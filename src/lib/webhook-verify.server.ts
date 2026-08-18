/**
 * Strict signature verification for the inbound-email webhook.
 *
 * Two accepted schemes:
 *   - Svix (what the sending provider uses): `svix-id`, `svix-timestamp` and
 *     `svix-signature` are verified as an HMAC-SHA256 over
 *     `${id}.${timestamp}.${body}` using the base64 signing secret, with a
 *     replay window on the timestamp.
 *   - Sendloop shared secret: `x-sendloop-signature` / bearer token, compared
 *     in constant time. When `INBOUND_WEBHOOK_SIGNING_SECRET` is configured,
 *     an HMAC-SHA256 of the raw body (hex, optional `sha256=` prefix) is
 *     required instead of the plain secret.
 *
 * Anything else is rejected — no unsigned deliveries are ever processed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type VerificationStatus = "valid" | "invalid" | "missing" | "failed";

export type VerificationResult = {
  status: VerificationStatus;
  /** Scheme that produced the verdict. */
  method: "svix" | "hmac" | "shared_secret" | "none";
  reason: string;
};

const REPLAY_WINDOW_SECONDS = 5 * 60;

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmac(keyBytes: Uint8Array, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

async function verifySvix(
  headers: Headers,
  body: string,
  secret: string,
): Promise<VerificationResult> {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signature = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!id || !timestamp || !signature) {
    return { status: "missing", method: "svix", reason: "Signature headers are incomplete." };
  }

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) {
    return { status: "invalid", method: "svix", reason: "Signature timestamp is not a number." };
  }
  const drift = Math.abs(Math.floor(Date.now() / 1000) - sent);
  if (drift > REPLAY_WINDOW_SECONDS) {
    return {
      status: "invalid",
      method: "svix",
      reason: `Signature timestamp is ${drift}s old — outside the replay window.`,
    };
  }

  const keyBytes = secret.startsWith("whsec_")
    ? base64ToBytes(secret.slice(6))
    : new TextEncoder().encode(secret);
  const expected = toBase64(await hmac(keyBytes, `${id}.${timestamp}.${body}`));
  const candidates = signature
    .split(" ")
    .map((part) => (part.includes(",") ? part.split(",")[1]! : part))
    .filter(Boolean);
  const ok = candidates.some((candidate) => constantTimeEquals(candidate, expected));
  return ok
    ? { status: "valid", method: "svix", reason: "Svix signature verified." }
    : { status: "invalid", method: "svix", reason: "Svix signature does not match the payload." };
}

/**
 * Verifies a delivery. `body` must be the exact raw request body — any
 * re-serialisation changes the bytes and invalidates the signature.
 */
export async function verifyInboundSignature(
  request: Request,
  body: string,
): Promise<VerificationResult> {
  const svixSecret = process.env["RESEND_WEBHOOK_SECRET"] ?? process.env["SVIX_SIGNING_SECRET"];
  const sharedSecret = process.env["INBOUND_EMAIL_SECRET"];
  const hmacSecret = process.env["INBOUND_WEBHOOK_SIGNING_SECRET"];

  const hasSvixHeaders = Boolean(request.headers.get("svix-signature") ?? request.headers.get("webhook-signature"));
  if (hasSvixHeaders) {
    if (!svixSecret) {
      return {
        status: "failed",
        method: "svix",
        reason: "A signed delivery arrived but no provider signing secret is configured.",
      };
    }
    return verifySvix(request.headers, body, svixSecret);
  }

  const provided =
    request.headers.get("x-sendloop-signature") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("token") ??
    "";
  if (!provided) {
    return { status: "missing", method: "none", reason: "No signature or shared secret was sent." };
  }

  if (hmacSecret) {
    const expected = toHex(await hmac(new TextEncoder().encode(hmacSecret), body));
    const candidate = provided.replace(/^sha256=/i, "").toLowerCase();
    return constantTimeEquals(candidate, expected)
      ? { status: "valid", method: "hmac", reason: "HMAC signature verified." }
      : { status: "invalid", method: "hmac", reason: "HMAC signature does not match the payload." };
  }

  if (!sharedSecret) {
    return {
      status: "failed",
      method: "shared_secret",
      reason: "The inbound endpoint has no shared secret configured.",
    };
  }
  return constantTimeEquals(provided, sharedSecret)
    ? { status: "valid", method: "shared_secret", reason: "Shared secret matched." }
    : { status: "invalid", method: "shared_secret", reason: "Shared secret did not match." };
}

/** Stores the latest verdict so the admin setup page can show live status. */
export async function recordWebhookVerification(result: VerificationResult) {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "inbound_webhook_status")
    .maybeSingle();
  const previous = (data?.value ?? {}) as {
    validCount?: number;
    invalidCount?: number;
    lastValidAt?: string | null;
  };
  const now = new Date().toISOString();

  await supabaseAdmin.from("platform_settings").upsert(
    {
      key: "inbound_webhook_status",
      value: {
        status: result.status,
        method: result.method,
        reason: result.reason,
        checkedAt: now,
        lastValidAt: result.status === "valid" ? now : (previous.lastValidAt ?? null),
        validCount: (previous.validCount ?? 0) + (result.status === "valid" ? 1 : 0),
        invalidCount: (previous.invalidCount ?? 0) + (result.status === "valid" ? 0 : 1),
      },
    },
    { onConflict: "key" },
  );
}
