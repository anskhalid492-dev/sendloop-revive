/**
 * Provider-agnostic webhook ingestion.
 *
 * The inbound endpoint no longer assumes which infrastructure sent a delivery.
 * Order is fixed and security-critical:
 *
 *   raw body -> provider identification -> provider signature verification
 *   -> JSON/form parsing -> provider normalization -> existing inbound processor
 *
 * The raw body string is never re-serialised: identification and normalization
 * read a parsed copy, while signature verification always receives the exact
 * bytes that arrived.
 *
 * Unidentified deliveries are rejected. There is no default provider — guessing
 * would let an unsigned or foreign payload reach the processor.
 */
import { identifyWebhookProvider } from "./registry.server";
import type { EmailProvider } from "./provider";
import type { InboundEmailEvent, NormalizedEmailEvent, WebhookRequestContext } from "./types";

export type WebhookIngestResult =
  | {
      ok: true;
      provider: EmailProvider;
      /** Parsed provider payload, passed unchanged to the existing processor. */
      payload: Record<string, unknown>;
      verification: { status: string; method: string; reason: string };
      inbound: InboundEmailEvent | null;
      delivery: NormalizedEmailEvent | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      /** Present once a provider was identified (used for admin alerting). */
      provider?: EmailProvider;
      verification?: { status: string; method: string; reason: string };
    };

function headerMap(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

/** Parses the body without touching the raw string used for signatures. */
export function parseWebhookBody(
  rawBody: string,
  contentType: string,
): Record<string, unknown> | null {
  try {
    if (contentType.includes("application/json") || rawBody.trimStart().startsWith("{")) {
      return JSON.parse(rawBody) as Record<string, unknown>;
    }
    return Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function webhookContext(
  request: Request,
  rawBody: string,
  payload?: unknown,
): WebhookRequestContext {
  const url = new URL(request.url);
  return {
    headers: headerMap(request),
    rawBody,
    url: request.url,
    query: Object.fromEntries(url.searchParams),
    ...(payload === undefined ? {} : { payload }),
    request,
  };
}

/**
 * Signing secret for a provider's webhook endpoint.
 *
 * Adapters that resolve their own secret (Resend, via the active-secret
 * fallback) simply ignore this value; adapters that compare a shared token
 * (Bird) need it supplied here, otherwise every delivery is refused.
 */
function webhookSecretFor(providerId: string): string | null {
  const upper = providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return (
    process.env[`${upper}_WEBHOOK_SECRET`] ??
    process.env[`${upper}_SIGNING_SECRET`] ??
    process.env["INBOUND_EMAIL_SECRET"] ??
    null
  );
}

/**
 * Identifies, verifies and normalizes one delivery. Does not touch the
 * database; the caller keeps the existing logging/alerting behaviour.
 */
export async function ingestProviderWebhook(
  request: Request,
  rawBody: string,
): Promise<WebhookIngestResult> {
  const contentType = request.headers.get("content-type") ?? "";
  // Parsed only for identification/normalization — never for verification.
  const parsed = parseWebhookBody(rawBody, contentType);
  const context = webhookContext(request, rawBody, parsed ?? undefined);

  const provider = identifyWebhookProvider(context);
  if (!provider) {
    return {
      ok: false,
      status: 400,
      error: "Unrecognised webhook sender — no email provider claimed this delivery.",
    };
  }

  if (!provider.verifyWebhookSignature) {
    return {
      ok: false,
      status: 501,
      provider,
      error: "This provider cannot verify webhook signatures, so the delivery is refused.",
    };
  }

  const verified = await provider.verifyWebhookSignature(context, webhookSecretFor(provider.id));
  const verification = verified.verification ?? {
    status: verified.valid ? "valid" : "invalid",
    method: "unknown",
    reason: verified.detail,
  };
  if (!verified.valid) {
    return { ok: false, status: verification.status === "failed" ? 503 : 401, provider, error: verification.reason, verification };
  }

  if (!parsed) return { ok: false, status: 400, provider, error: "Invalid body", verification };

  return {
    ok: true,
    provider,
    payload: parsed,
    verification,
    inbound: provider.parseInboundEvent?.(parsed) ?? null,
    delivery: provider.parseDeliveryEvent?.(parsed) ?? null,
  };
}
