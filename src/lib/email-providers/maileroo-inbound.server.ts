/**
 * Authenticity check for Maileroo inbound deliveries.
 *
 * Maileroo sends no signature header. Instead every payload carries a one-time
 * `validation_url`: it answers `{"success": true}` on the first call and fails
 * on every call afterwards. So it must be called exactly once per webhook, and
 * NEVER again when Maileroo retries delivery of the same message.
 *
 * Retry safety therefore has two layers, in this order:
 *   1. an in-process cache of message ids already validated in this instance
 *   2. the stored `email_events` row for the same external id (survives restarts)
 * Only a genuinely new message reaches the network call.
 */
import { mailerooValidationUrl } from "./maileroo-inbound";
import type { WebhookVerification } from "./types";

/** Message ids validated by this instance — cheap guard against fast retries. */
const validated = new Set<string>();

function verdict(
  valid: boolean,
  status: string,
  reason: string,
  detail: string,
): WebhookVerification {
  return { valid, detail, verification: { status, method: "validation_url", reason } };
}

/** True when this exact inbound event was already stored (Maileroo retry). */
async function alreadyStored(externalId: string | null): Promise<boolean> {
  if (!externalId) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_events")
      .select("id")
      .eq("external_id", externalId)
      .maybeSingle();
    return !!data;
  } catch {
    // A lookup failure must not reject a legitimate delivery on its own.
    return false;
  }
}

export async function verifyMailerooInbound(payload: unknown): Promise<WebhookVerification> {
  const p = (payload ?? {}) as Record<string, unknown>;
  const messageId = typeof p["message_id"] === "string" ? p["message_id"] : null;
  const cacheKey = messageId ?? (typeof p["_id"] === "string" ? p["_id"] : null);

  if (cacheKey && validated.has(cacheKey)) {
    return verdict(true, "valid", "already_validated", "This delivery was already validated.");
  }

  const externalId = messageId ? `inbound:${messageId.replace(/[<>]/g, "").slice(0, 260)}` : null;
  if (await alreadyStored(externalId)) {
    if (cacheKey) validated.add(cacheKey);
    return verdict(true, "valid", "redelivery", "A redelivery of an already stored message.");
  }

  const url = mailerooValidationUrl(payload);
  if (!url) {
    return verdict(
      false,
      "invalid",
      "missing_validation_url",
      "The delivery carried no one-time validation URL.",
    );
  }

  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok && body?.["success"] === true) {
      if (cacheKey) validated.add(cacheKey);
      return verdict(true, "valid", "validation_url_confirmed", "The one-time URL confirmed it.");
    }
    return verdict(
      false,
      "invalid",
      "validation_url_rejected",
      `The one-time validation URL did not confirm this delivery [${res.status}].`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Unreachable validation endpoint is an infrastructure failure, not a forgery:
    // "failed" makes the pipeline answer 503 so Maileroo retries.
    return verdict(false, "failed", "validation_url_unreachable", message.slice(0, 200));
  }
}
