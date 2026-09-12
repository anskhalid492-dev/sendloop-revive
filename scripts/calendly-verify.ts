/**
 * Scoped Calendly verification / repair.
 *
 * Guardrail: refuses to run unless an explicit connection id AND the expected
 * Calendly account email are passed on the command line. It never scans other
 * workspaces, never enables anything globally and never touches payments.
 *
 *   bun scripts/calendly-verify.ts --connection <uuid> --email <calendly email> \
 *     [--origin http://localhost:8080] [--webhook-test]
 */
import {
  accessTokenForConnection,
  calendlyMe,
  listWebhookSubscriptions,
  readCalendlyCredentials,
} from "@/lib/calendly.server";
import { calendlyWebhookUrl, setupCalendlyWebhook } from "@/lib/calendly-setup.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHmac } from "node:crypto";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const connectionId = arg("connection");
const expectedEmail = arg("email");
const origin = arg("origin") ?? "http://localhost:8080";
/** Where the signature test POSTs; Calendly itself rejects localhost callbacks. */
const postOrigin = arg("post-origin") ?? "http://localhost:8080";
const runWebhookTest = process.argv.includes("--webhook-test");

if (!connectionId || !expectedEmail) {
  console.error("Refusing to run: pass --connection <uuid> --email <calendly email>.");
  process.exit(1);
}

const { data: conn } = await supabaseAdmin
  .from("integration_connections")
  .select("id, workspace_id, slug, status, account_label, config, error_message")
  .eq("id", connectionId)
  .eq("slug", "calendly")
  .maybeSingle();
const row = conn as
  | {
      id: string;
      workspace_id: string;
      status: string;
      account_label: string | null;
      config: Record<string, unknown>;
      error_message: string | null;
    }
  | null;
if (!row) throw new Error("No Calendly connection with that id.");
if ((row.account_label ?? "").toLowerCase() !== expectedEmail.toLowerCase()) {
  throw new Error(`Guardrail: connection belongs to ${row.account_label}, not ${expectedEmail}.`);
}

console.log(`connection ${row.id} status=${row.status} error=${row.error_message ?? "none"}`);

const { token } = await accessTokenForConnection(row.id);
if (!token) throw new Error("No usable access token; the customer must reconnect.");
const me = await calendlyMe(token);
console.log(`/users/me -> ok=${me.ok} status=${me.status} email=${me.user?.email}`);
if (!me.user) throw new Error("Calendly did not confirm the account.");

const before = await listWebhookSubscriptions(token, {
  organization: me.user.current_organization,
  user: me.user.uri,
});
console.log(
  `subscriptions before: ok=${before.ok} count=${before.subscriptions.length}`,
  before.subscriptions.map((s) => `${s.callback_url} [${s.events.join("|")}] ${s.state}`),
);

const config = (row.config ?? {}) as Record<string, unknown>;
for (const pass of [1, 2, 3]) {
  const { data: fresh } = await supabaseAdmin
    .from("integration_connections")
    .select("config")
    .eq("id", row.id)
    .single();
  const result = await setupCalendlyWebhook({
    workspaceId: row.workspace_id,
    connectionId: row.id,
    accessToken: token,
    organizationUri: me.user.current_organization,
    ownerUri: me.user.uri,
    origin,
    config: ((fresh as { config?: Record<string, unknown> })?.config ?? config) as Record<
      string,
      unknown
    >,
  });
  console.log(`pass ${pass}: ok=${result.ok} reused=${result.reused} message=${result.message}`);
}

const after = await listWebhookSubscriptions(token, {
  organization: me.user.current_organization,
  user: me.user.uri,
});
const ours = after.subscriptions.filter((s) => s.callback_url === calendlyWebhookUrl(origin));
console.log(`subscriptions for ${calendlyWebhookUrl(origin)}: ${ours.length}`);
if (ours.length !== 1) throw new Error("Expected exactly one MunchReach subscription.");

const { data: finalRow } = await supabaseAdmin
  .from("integration_connections")
  .select("status, error_message, config")
  .eq("id", row.id)
  .single();
console.log("final connection:", JSON.stringify(finalRow));

if (runWebhookTest) {
  const creds = await readCalendlyCredentials(row.id);
  const key = creds?.webhook_signing_key;
  if (!key) throw new Error("No signing key stored.");
  const testEmail = "calendly-verify-throwaway@munchreach-test.invalid";
  const send = async (event: string, sign: boolean) => {
    const body = JSON.stringify({
      event,
      created_at: new Date().toISOString(),
      payload: {
        email: testEmail,
        name: "Verify Throwaway",
        uri: `https://api.calendly.com/scheduled_events/verify-${event}-${Date.now()}`,
        scheduled_event: { name: "Verification call", start_time: new Date().toISOString() },
      },
    });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", sign ? key : "wrong-key").update(`${t}.${body}`).digest("hex");
    const res = await fetch(`${postOrigin}/api/public/integrations/calendly/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "calendly-webhook-signature": `t=${t},v1=${sig}` },
      body,
    });
    console.log(`${event} signed=${sign} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.status;
  };
  const bad = await send("invitee.created", false);
  if (bad !== 401) throw new Error("Forged signature was not rejected.");
  const created = await send("invitee.created", true);
  const canceled = await send("invitee.canceled", true);
  if (created !== 200 || canceled !== 200) throw new Error("Signed webhook was rejected.");

  await supabaseAdmin
    .from("integration_events")
    .delete()
    .eq("connection_id", row.id)
    .like("idempotency_key", "calendly:%verify-%");
  console.log("cleaned up verification events");
}

console.log("DONE");

/**
 * Optional attribution check. Creates ONE explicitly-named throwaway contact,
 * sends a signed booking + cancellation for it, asserts the CRM/meeting state,
 * then deletes it. No existing contact is ever read or modified.
 */
if (process.argv.includes("--attribution-test")) {
  const creds = await readCalendlyCredentials(row.id);
  const key = creds!.webhook_signing_key!;
  const email = `calendly-attribution-throwaway-${Date.now()}@munchreach-test.invalid`;
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .insert({
      workspace_id: row.workspace_id,
      email,
      first_name: "Calendly",
      last_name: "Throwaway",
      status: "contacted",
    })
    .select("id, status")
    .single();
  const leadId = (lead as { id: string }).id;
  try {
    const fire = async (event: string) => {
      const body = JSON.stringify({
        event,
        created_at: new Date().toISOString(),
        payload: {
          email,
          name: "Calendly Throwaway",
          uri: `https://api.calendly.com/scheduled_events/attr-${event}-${Date.now()}`,
          scheduled_event: { name: "Throwaway demo", start_time: new Date().toISOString() },
        },
      });
      const t = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
      const res = await fetch(`${postOrigin}/api/public/integrations/calendly/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "calendly-webhook-signature": `t=${t},v1=${sig}` },
        body,
      });
      console.log(`attr ${event} -> ${res.status} ${(await res.text()).slice(0, 160)}`);
    };
    await fire("invitee.created");
    const { data: booked } = await supabaseAdmin
      .from("leads")
      .select("status, stage")
      .eq("id", leadId)
      .single();
    console.log("after booking:", JSON.stringify(booked));
    if ((booked as { status: string }).status !== "meeting_booked")
      throw new Error("Booking did not mark the contact as meeting booked.");
    await fire("invitee.canceled");
    const { data: after2 } = await supabaseAdmin
      .from("leads")
      .select("status")
      .eq("id", leadId)
      .single();
    const { data: acts } = await supabaseAdmin
      .from("lead_activities")
      .select("type, detail")
      .eq("lead_id", leadId);
    console.log("after cancel:", JSON.stringify(after2), "activities:", JSON.stringify(acts));
    if ((after2 as { status: string }).status === "meeting_booked")
      throw new Error("Cancellation did not reverse the meeting state.");
  } finally {
    await supabaseAdmin.from("lead_activities").delete().eq("lead_id", leadId);
    await supabaseAdmin.from("leads").delete().eq("id", leadId);
    await supabaseAdmin
      .from("integration_events")
      .delete()
      .eq("connection_id", row.id)
      .like("idempotency_key", "calendly:%attr-%");
    console.log("attribution test data removed");
  }
  console.log("ATTRIBUTION OK");
}
