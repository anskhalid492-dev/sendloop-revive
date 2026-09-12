/**
 * Controlled verification of the `lead.created` REST Hook flow.
 *
 * SCOPE GUARDRAIL: every row this script touches is created by this script and
 * carries the `whverify-<timestamp>` prefix. It never reads, modifies or deletes
 * a real customer's workspace, leads, webhooks or integrations, and it performs
 * no payment-provider actions.
 *
 * Covers: subscribe/unsubscribe endpoints, real HTTP delivery, full payload
 * shape, idempotency, duplicate handling, and that reply.received still works.
 *
 * Usage: bun scripts/lead-webhook-verify.ts [baseUrl]
 */
import { createClient } from "@supabase/supabase-js";

import { generateApiKey, hashApiKey, keyPrefix } from "../src/lib/api/v1/keys";

const BASE = process.argv[2] ?? "http://localhost:8080";
const url = process.env["SUPABASE_URL"]!;
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { auth: { persistSession: false } }) as any;

const PREFIX = `whverify-${Date.now()}`;
/** Public echo endpoint: accepts any POST and returns 200, so a real delivery is observable. */
const RECEIVER = "https://postman-echo.com/post";
const RECEIVER_TWO = "https://postman-echo.com/post?two=1";

function ok(status: number) {
  return status === 200 || status === 201;
}

const results: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

let userId = "";
let workspaceId = "";
let apiKeyId = "";
let apiSecret = "";

async function setup() {
  const email = `${PREFIX}@example.com`;
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  userId = created.user.id;
  await db.from("profiles").upsert({ id: userId, email, full_name: "Webhook Verify" });

  const { data: ws, error: wsError } = await db
    .from("workspaces")
    .insert({ name: `WH ${PREFIX}`, slug: PREFIX, owner_id: userId, status: "active" })
    .select("id")
    .single();
  if (wsError) throw new Error(`workspace: ${wsError.message}`);
  workspaceId = ws.id;

  apiSecret = generateApiKey();
  const { data: row, error: keyError } = await db
    .from("api_keys")
    .insert({
      workspace_id: workspaceId,
      name: `${PREFIX} key`,
      prefix: keyPrefix(apiSecret),
      key_hash: await hashApiKey(apiSecret),
      scopes: ["write", "read"],
      created_by: userId,
      rate_limit_per_minute: 600,
    })
    .select("id")
    .single();
  if (keyError) throw new Error(`api key: ${keyError.message}`);
  apiKeyId = row.id;
}

async function api(method: string, path: string, body?: unknown) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiSecret}`,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, json: json as Record<string, unknown> };
}

async function deliveries(endpointId?: string, eventType = "lead.created") {
  let query = db
    .from("webhook_deliveries")
    .select("id, endpoint_id, event_type, event_id, status, response_status, payload")
    .eq("workspace_id", workspaceId)
    .eq("event_type", eventType);
  if (endpointId === undefined) {
    // no filter: caller wants every endpoint
  } else if (!endpointId) {
    throw new Error("deliveries(): endpoint id missing");
  } else {
    query = query.eq("endpoint_id", endpointId);
  }
  const { data } = await query;
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function cleanup() {
  await db.from("webhook_deliveries").delete().eq("workspace_id", workspaceId);
  await db.from("webhook_endpoints").delete().eq("workspace_id", workspaceId);
  await db.from("integration_events").delete().eq("workspace_id", workspaceId);
  await db.from("integration_connections").delete().eq("workspace_id", workspaceId);
  await db.from("lead_activities").delete().eq("workspace_id", workspaceId);
  await db.from("leads").delete().eq("workspace_id", workspaceId);
  if (apiKeyId) await db.from("api_keys").delete().eq("id", apiKeyId);
  await db.from("api_request_logs").delete().eq("workspace_id", workspaceId).then(
    () => undefined,
    () => undefined,
  );
  await db.from("workspaces").delete().eq("id", workspaceId);
  await db.from("profiles").delete().eq("id", userId);
  if (userId) await db.auth.admin.deleteUser(userId);
}

async function main() {
  await setup();

  // ---- (c) subscribing through the new endpoint registers a real endpoint ----
  const sub = await api("POST", "/api/public/v1/webhook-subscriptions", {
    url: RECEIVER,
    event: "lead.created",
  });
  const subData = (sub.json?.["data"] ?? {}) as Record<string, unknown>;
  const endpointId = subData["id"] as string;
  check("subscribe returns 200 with an id and a signing secret",
    ok(sub.status) && Boolean(endpointId) && typeof subData["secret"] === "string",
    `status ${sub.status}`);

  const { data: storedEndpoint } = await db
    .from("webhook_endpoints")
    .select("id, url, events, status, secret_ciphertext")
    .eq("id", endpointId)
    .maybeSingle();
  check("subscription is stored exactly like a manual webhook entry",
    storedEndpoint?.url === RECEIVER &&
      storedEndpoint?.status === "active" &&
      (storedEndpoint?.events ?? []).includes("lead.created") &&
      Boolean(storedEndpoint?.secret_ciphertext));

  // Idempotent subscribe: same URL + same event must not create a second endpoint.
  const again = await api("POST", "/api/public/v1/webhook-subscriptions", {
    url: RECEIVER,
    event: "lead.created",
  });
  const againData = (again.json?.["data"] ?? {}) as Record<string, unknown>;
  const { count: endpointCount } = await db
    .from("webhook_endpoints")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  check("re-subscribing the same URL reuses the subscription (no duplicate endpoint)",
    againData["id"] === endpointId && againData["reused"] === true && endpointCount === 1,
    `endpoints=${endpointCount}`);

  // ---- (a) a real lead creation fires lead.created with the full payload ----
  const leadEmail = `${PREFIX}-one@example.com`;
  const create = await api("POST", "/api/public/v1/contacts", {
    email: leadEmail,
    first_name: "Ada",
    last_name: "Lovelace",
    company: "Example Inc",
    job_title: "Head of Sales",
    lead_source: "crm",
  });
  check("contact creation succeeded", ok(create.status), `status ${create.status} ${JSON.stringify(create.json).slice(0, 200)}`);

  const afterCreate = await deliveries(endpointId);
  const payload = (afterCreate[0]?.["payload"] ?? {}) as { lead?: Record<string, unknown> };
  const lead = payload.lead ?? {};
  const requiredFields = [
    "id",
    "email",
    "first_name",
    "last_name",
    "company",
    "job_title",
    "status",
    "lead_source",
    "created_at",
  ];
  check("lead.created queued once for the subscribed URL", afterCreate.length === 1,
    `${afterCreate.length} rows`);
  check("payload carries the full lead shape",
    requiredFields.every((field) => field in lead) &&
      lead["email"] === leadEmail &&
      lead["first_name"] === "Ada" &&
      lead["company"] === "Example Inc" &&
      lead["job_title"] === "Head of Sales",
    JSON.stringify(lead).slice(0, 200));

  // Re-sending the same contact must not enqueue a second lead.created.
  await api("POST", "/api/public/v1/contacts", { email: leadEmail, first_name: "Ada" });
  const afterReplay = await deliveries(endpointId);
  check("updating an existing contact does not re-fire lead.created",
    afterReplay.length === 1, `${afterReplay.length} rows`);

  // ---- (b) bulk import path fires for each genuinely new lead ----
  const importEmails = [1, 2, 3].map((n) => `${PREFIX}-import${n}@example.com`);
  const bulk = await api("POST", "/api/public/v1/contacts/bulk", {
    action: "upsert",
    contacts: importEmails.map((email, i) => ({
      email,
      first_name: `Imported${i}`,
      company: "Bulk Co",
      lead_source: "import",
    })),
  });
  check("bulk import succeeded", ok(bulk.status), `status ${bulk.status} ${JSON.stringify(bulk.json).slice(0, 200)}`);
  const afterImport = await deliveries(endpointId);
  check("import fired lead.created once per new lead",
    afterImport.length === 4, `${afterImport.length} rows`);

  // Re-importing the same file must not duplicate anything.
  await api("POST", "/api/public/v1/contacts/bulk", {
    action: "upsert",
    contacts: importEmails.map((email) => ({ email, company: "Bulk Co" })),
  });
  const afterReimport = await deliveries(endpointId);
  check("re-importing the same rows adds no duplicate deliveries",
    afterReimport.length === 4, `${afterReimport.length} rows`);

  // ---- real HTTP delivery to the subscribed URL ----
  const { runWebhookDeliveries } = await import("../src/lib/api/v1/webhook-delivery.server");
  const drain = await runWebhookDeliveries(db, 50, workspaceId);
  console.log("drain:", JSON.stringify(drain));
  const queued = await deliveries(endpointId);
  console.log("delivery statuses:", queued.map((r) => `${r["status"]}/${r["response_status"]}`).join(", "));
  const { data: diag } = await db
    .from("webhook_deliveries")
    .select("status, response_status, failure_reason, attempts")
    .eq("workspace_id", workspaceId)
    .limit(3);
  console.log("delivery diagnostics:", JSON.stringify(diag));
  const delivered = (await deliveries(endpointId)).filter(
    (row) => row["status"] === "delivered" && row["response_status"] === 200,
  );
  check("queued events were really delivered over HTTPS (200 from receiver)",
    delivered.length === 4, `${delivered.length}/4 delivered`);

  // ---- (e) a customer who ALSO has a manual webhook for the same event ----
  const manual = await api("POST", "/api/public/v1/webhooks", {
    url: RECEIVER_TWO,
    events: ["lead.created"],
    description: "manual settings entry",
  });
  const manualId = ((manual.json?.["data"] ?? {}) as Record<string, unknown>)["id"] as string;
  const dualEmail = `${PREFIX}-dual@example.com`;
  await api("POST", "/api/public/v1/contacts", { email: dualEmail, first_name: "Dual" });
  const dualEventId = `lead.created:${await leadIdFor(dualEmail)}`;
  const restHookRows = (await deliveries(endpointId)).filter(
    (row) => row["event_id"] === dualEventId,
  );
  const manualRows = (await deliveries(manualId)).filter(
    (row) => row["event_id"] === dualEventId,
  );
  check("each configured destination gets exactly one delivery (no duplicates per URL)",
    restHookRows.length === 1 && manualRows.length === 1,
    `resthook=${restHookRows.length} manual=${manualRows.length}`);

  // ---- (d) unsubscribing stops delivery ----
  const removed = await api("DELETE", `/api/public/v1/webhook-subscriptions/${endpointId}`);
  const { data: gone } = await db
    .from("webhook_endpoints")
    .select("id")
    .eq("id", endpointId)
    .maybeSingle();
  check("unsubscribe returns 200 and removes the subscription",
    removed.status === 200 && !gone, `status ${removed.status}`);

  const beforeAfterUnsub = (await deliveries(endpointId)).length;
  await api("POST", "/api/public/v1/contacts", {
    email: `${PREFIX}-after@example.com`,
    first_name: "After",
  });
  const afterUnsub = await deliveries(endpointId);
  check("no further events are queued for the removed subscription",
    afterUnsub.length <= beforeAfterUnsub, `${afterUnsub.length} rows`);
  const manualStillFires = (await deliveries(manualId)).length;
  check("the customer's other webhook keeps receiving lead.created",
    manualStillFires >= 2, `${manualStillFires} rows`);

  const secondDelete = await api("DELETE", `/api/public/v1/webhook-subscriptions/${endpointId}`);
  check("unsubscribing twice is a clean 404, not an error loop", secondDelete.status === 404,
    `status ${secondDelete.status}`);

  // ---- (f) existing events are untouched ----
  const { enqueueWebhookEvent } = await import("../src/lib/api/v1/webhook-delivery.server");
  await enqueueWebhookEvent(db, workspaceId, "reply.received", `${PREFIX}-reply`, {
    lead: { email: leadEmail },
  });
  const replyRows = await deliveries(undefined, "reply.received");
  check("a lead.created-only endpoint is never sent reply.received",
    replyRows.length === 0, `${replyRows.length} rows`);

  const replySub = await api("POST", "/api/public/v1/webhooks", {
    url: RECEIVER,
    events: ["reply.received", "contact.replied"],
  });
  const replyEndpointId = ((replySub.json?.["data"] ?? {}) as Record<string, unknown>)["id"] as string;
  check("reply-only webhook created", ok(replySub.status) && Boolean(replyEndpointId),
    `status ${replySub.status} ${JSON.stringify(replySub.json).slice(0, 200)}`);
  await enqueueWebhookEvent(db, workspaceId, "reply.received", `${PREFIX}-reply-2`, {
    lead: { email: leadEmail },
  });
  await enqueueWebhookEvent(db, workspaceId, "contact.replied", `${PREFIX}-positive`, {
    lead: { email: leadEmail },
  });
  const replyAfter = await deliveries(replyEndpointId, "reply.received");
  const positiveAfter = await deliveries(replyEndpointId, "contact.replied");
  check("existing reply events (reply.received, contact.replied) still work as before",
    replyAfter.length === 1 && positiveAfter.length === 1,
    `reply=${replyAfter.length} positive=${positiveAfter.length}`);

  const leadRowsOnReplyEndpoint = await deliveries(replyEndpointId, "lead.created");
  check("a reply-only endpoint never receives lead.created",
    leadRowsOnReplyEndpoint.length === 0, `${leadRowsOnReplyEndpoint.length} rows`);
}

async function leadIdFor(email: string): Promise<string> {
  const { data } = await db
    .from("leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", email)
    .maybeSingle();
  return (data?.id as string) ?? "missing";
}

main()
  .catch((error) => {
    check("script completed", false, (error as Error).message);
  })
  .finally(async () => {
    await cleanup().catch((error) => console.warn("cleanup", error));
    console.log(`\n${results.join("\n")}\n`);
    console.log(process.exitCode ? "RESULT: FAILURES" : "RESULT: ALL PASS");
  });
