/**
 * Verified billing webhook for referral commissions.
 *
 * External billing providers (Stripe, Paddle, Lemon Squeezy, ...) post here.
 * The payload is HMAC-verified before anything is written, and every event id
 * is stored once, so a replayed event can never create a second commission.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Records every delivery attempt so the admin health panel can show it. */
async function logDelivery(entry: {
  provider?: string;
  eventId?: string | null;
  eventType?: string | null;
  signatureOk: boolean;
  statusCode: number;
  result?: string | null;
  error?: string | null;
  request: Request;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashIp, clientIp } = await import("@/lib/referral.server");
    await supabaseAdmin.from("referral_webhook_events").insert({
      provider: entry.provider ?? "unknown",
      event_id: entry.eventId ?? null,
      event_type: entry.eventType ?? null,
      signature_ok: entry.signatureOk,
      status_code: entry.statusCode,
      result: entry.result ?? null,
      error: entry.error ?? null,
      source_ip_hash: await hashIp(clientIp(entry.request)),
    });
  } catch {
    /* health logging must never break webhook processing */
  }
}

async function post({ request }: { request: Request }) {
  const secret = process.env["REFERRAL_BILLING_SECRET"] ?? process.env["INBOUND_EMAIL_SECRET"];
  if (!secret) {
    await logDelivery({ signatureOk: false, statusCode: 503, result: "error", error: "Billing webhook secret is not configured", request });
    return json({ error: "Billing webhook is not configured" }, 503);
  }

  const body = await request.text();
  const provided = (
    request.headers.get("x-sendloop-signature") ??
    request.headers.get("x-signature") ??
    ""
  ).replace(/^sha256=/, "");
  const expected = await hmac(secret, body);
  if (!provided || !safeEqual(provided.toLowerCase(), expected)) {
    await logDelivery({
      signatureOk: false,
      statusCode: 401,
      result: "rejected",
      error: provided ? "Signature did not match the configured secret" : "Request had no signature header",
      request,
    });
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(body);
  } catch {
    await logDelivery({ signatureOk: true, statusCode: 400, result: "error", error: "Payload was not valid JSON", request });
    return json({ error: "Invalid JSON" }, 400);
  }

  const provider = String(payload["provider"] ?? "unknown").slice(0, 40);
  const eventId = String(payload["event_id"] ?? payload["id"] ?? "").slice(0, 200);
  const eventType = String(payload["event_type"] ?? payload["type"] ?? "").slice(0, 120);
  if (!eventId || !eventType) {
    await logDelivery({
      provider,
      eventId,
      eventType,
      signatureOk: true,
      statusCode: 400,
      result: "error",
      error: "event_id and event_type are required",
      request,
    });
    return json({ error: "event_id and event_type are required" }, 400);
  }

  const { processBillingEvent } = await import("@/lib/referral.server");
  let result: { status: string; detail?: string };
  try {
    result = await processBillingEvent({
    provider,
    eventId,
    eventType,
    userId: payload["user_id"] ?? null,
    email: payload["email"] ?? payload["customer_email"] ?? null,
    workspaceId: payload["workspace_id"] ?? null,
    amountCents: Number(payload["amount_cents"] ?? 0),
    currency: String(payload["currency"] ?? "usd"),
    subscriptionId: payload["subscription_id"] ?? null,
    paymentId: payload["payment_id"] ?? null,
    planName: payload["plan_name"] ?? null,
      raw: payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    await logDelivery({ provider, eventId, eventType, signatureOk: true, statusCode: 500, result: "error", error: message, request });
    return json({ error: "Processing failed" }, 500);
  }

  await logDelivery({
    provider,
    eventId,
    eventType,
    signatureOk: true,
    statusCode: 200,
    result: result.status,
    error: result.detail ?? null,
    request,
  });

  return json({ ok: true, ...result }, 200);
}

export const Route = createFileRoute("/api/public/referral/billing")({
  server: { handlers: { POST: post } },
});
