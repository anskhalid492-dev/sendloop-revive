/**
 * Webhook signing, enqueueing and delivery.
 *
 * Events are queued (never delivered inline on the request path) so a slow or
 * dead customer endpoint can never stall a send. The queue row is unique on
 * (endpoint, event_id), which makes `enqueueWebhookEvent` idempotent: the same
 * domain event enqueued twice is delivered once.
 */
import {
  DELIVERY_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  nextAttemptDelaySeconds,
  signaturePayload,
  type WebhookEvent,
} from "./webhooks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 10_000;

export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPayload(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signaturePayload(timestamp, body)),
  );
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Queue an event for every active endpoint in the workspace subscribed to it.
 * Safe to call from any send/reply path: it swallows its own failures so a
 * webhook problem can never break the operation that produced the event.
 */
export async function enqueueWebhookEvent(
  admin: Admin,
  workspaceId: string,
  eventType: WebhookEvent,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: endpoints } = await admin
      .from("webhook_endpoints")
      .select("id, events")
      .eq("workspace_id", workspaceId)
      .eq("status", "active");

    const targets = (endpoints ?? []).filter(
      (endpoint: { events: string[] | null }) =>
        (endpoint.events ?? []).includes(eventType) || (endpoint.events ?? []).includes("*"),
    );
    if (targets.length === 0) return;

    await admin.from("webhook_deliveries").upsert(
      targets.map((endpoint: { id: string }) => ({
        workspace_id: workspaceId,
        endpoint_id: endpoint.id,
        event_type: eventType,
        event_id: eventId,
        payload,
        status: "pending",
        max_attempts: MAX_ATTEMPTS,
        next_attempt_at: new Date().toISOString(),
      })),
      { onConflict: "endpoint_id,event_id", ignoreDuplicates: true },
    );
  } catch (error) {
    console.warn("[webhooks] enqueue failed", error);
  }
}

type DeliveryRow = {
  id: string;
  endpoint_id: string;
  event_type: string;
  event_id: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
};

/** Delivers one queued row; returns whether the endpoint accepted it. */
async function deliverOne(admin: Admin, row: DeliveryRow): Promise<boolean> {
  const { data: endpoint } = await admin
    .from("webhook_endpoints")
    .select("id, url, status, secret_ciphertext, consecutive_failures")
    .eq("id", row.endpoint_id)
    .maybeSingle();

  if (!endpoint || endpoint.status !== "active") {
    await admin
      .from("webhook_deliveries")
      .update({ status: "cancelled", failure_reason: "Endpoint is not active" })
      .eq("id", row.id);
    return false;
  }

  const { decryptCredentials } = await import("@/lib/provider-credentials.server");
  let secret = "";
  try {
    secret = decryptCredentials<{ secret?: string }>(endpoint.secret_ciphertext).secret ?? "";
  } catch {
    secret = "";
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: row.event_id,
    type: row.event_type,
    created_at: new Date().toISOString(),
    data: row.payload,
  });

  const attempts = row.attempts + 1;
  let responseStatus: number | null = null;
  let failure: string | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [EVENT_HEADER]: row.event_type,
        [DELIVERY_HEADER]: row.id,
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: secret ? `v1=${await signPayload(secret, timestamp, body)}` : "",
        "user-agent": "MunchReach-Webhooks/1.0",
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    responseStatus = response.status;
    if (!response.ok) failure = `Endpoint responded ${response.status}`;
  } catch (error) {
    failure = error instanceof Error ? error.message : "Request failed";
  }

  const succeeded = failure === null;
  const exhausted = !succeeded && attempts >= (row.max_attempts || MAX_ATTEMPTS);

  await admin
    .from("webhook_deliveries")
    .update({
      attempts,
      status: succeeded ? "delivered" : exhausted ? "failed" : "pending",
      response_status: responseStatus,
      failure_reason: failure,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: succeeded
        ? null
        : new Date(Date.now() + nextAttemptDelaySeconds(attempts) * 1000).toISOString(),
    })
    .eq("id", row.id);

  const failures = succeeded ? 0 : (endpoint.consecutive_failures ?? 0) + 1;
  await admin
    .from("webhook_endpoints")
    .update({
      last_delivery_at: new Date().toISOString(),
      last_delivery_status: succeeded ? "delivered" : "failed",
      consecutive_failures: failures,
      // An endpoint that has been dead for a long run is disabled rather than
      // retried forever; the customer re-enables it from the dashboard.
      ...(failures >= 25 ? { status: "disabled" } : {}),
    })
    .eq("id", endpoint.id);

  return succeeded;
}

/** Drains due deliveries. Called by the cron route; bounded per invocation. */
export async function runWebhookDeliveries(admin: Admin, budget = 50) {
  const { data: due } = await admin
    .from("webhook_deliveries")
    .select("id, endpoint_id, event_type, event_id, payload, attempts, max_attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(budget);

  const rows = (due ?? []) as DeliveryRow[];
  let delivered = 0;
  for (const row of rows) {
    if (await deliverOne(admin, row)) delivered += 1;
  }
  return { processed: rows.length, delivered, failed: rows.length - delivered };
}
