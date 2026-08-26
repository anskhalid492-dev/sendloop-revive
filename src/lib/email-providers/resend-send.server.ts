/**
 * Resend-specific OUTBOUND sending and delivery/tracking event interpretation.
 *
 * Phase 4: this is the only place in the codebase that knows how the Resend
 * send API, its native event names, and its single-message status read work.
 * Shared campaign / reconciliation code talks to `EmailProvider` instead.
 *
 * Behaviour is copied verbatim from the previous production implementation in
 * `src/lib/provider-credentials.server.ts` (POST /emails, provider message id
 * extraction, RFC Message-ID read through GET /emails/:id) so sending semantics
 * are unchanged.
 *
 * Server-only.
 */
import {
  extractRfcMessageId,
  getResendEmail,
  resolveResendApiKey,
} from "./resend-api.server";
import type {
  EmailProviderCredentials,
  NormalizedEmailEventType,
  UnifiedOutboundMessage,
  UnifiedSendResult,
  UnifiedSendStatus,
} from "./types";

const API = "https://api.resend.com";

/* ------------------------------------------------------------------ *
 * Native event mapping (Resend-only knowledge)
 * ------------------------------------------------------------------ */

/**
 * The exact native events the production Resend integration receives, mapped to
 * MunchReach's normalized vocabulary. Unlisted events stay `UNKNOWN` — they are
 * never upgraded into a delivery/engagement signal.
 */
const RESEND_EVENTS: Record<string, NormalizedEmailEventType> = {
  "email.received": "REPLIED",
  "email.inbound": "REPLIED",
  received: "REPLIED",
  inbound: "REPLIED",
  "email.sent": "SENT",
  sent: "SENT",
  queued: "ACCEPTED",
  scheduled: "ACCEPTED",
  "email.scheduled": "ACCEPTED",
  "email.queued": "ACCEPTED",
  "email.delivered": "DELIVERED",
  delivered: "DELIVERED",
  "email.delivery_delayed": "DELAYED",
  delivery_delayed: "DELAYED",
  "email.opened": "OPENED",
  opened: "OPENED",
  "email.clicked": "CLICKED",
  clicked: "CLICKED",
  "email.bounced": "BOUNCED",
  bounced: "BOUNCED",
  "email.complained": "COMPLAINED",
  complained: "COMPLAINED",
  "email.failed": "FAILED",
  failed: "FAILED",
  canceled: "FAILED",
  "email.canceled": "FAILED",
};

/** True only for delayed signals, which MunchReach tracks as a soft state. */
export function isResendDelayEvent(raw: unknown): boolean {
  return String(raw ?? "")
    .toLowerCase()
    .includes("delay");
}

export function resendEventType(raw: unknown): NormalizedEmailEventType | "UNKNOWN" {
  const key = String(raw ?? "").toLowerCase().trim();
  if (!key) return "UNKNOWN";
  return RESEND_EVENTS[key] ?? "UNKNOWN";
}

/* ------------------------------------------------------------------ *
 * Sending
 * ------------------------------------------------------------------ */

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers ?? {})) {
    const name = rawName.trim();
    const value = String(rawValue ?? "").trim();
    if (!name || !value) continue;
    if (!/^[A-Za-z0-9-]+$/.test(name)) continue;
    if (/[\r\n]/.test(value)) continue;
    clean[name] = value;
  }
  return clean;
}

export function extractResendMessageId(body: string, headers: Headers): string | undefined {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const data = json["data"] as Record<string, unknown> | undefined;
    const candidate =
      json["id"] ??
      json["email_id"] ??
      json["emailId"] ??
      data?.["id"] ??
      data?.["email_id"] ??
      data?.["emailId"];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  } catch {
    /* not JSON — fall through to headers */
  }
  return headers.get("x-message-id") ?? undefined;
}

export type ResendSendResult = UnifiedSendResult & {
  requestId?: string | null;
  providerResponse?: string | null;
};

/** Sends one email through the Resend HTTP API. */
export async function sendResendEmail(
  credentials: EmailProviderCredentials,
  message: UnifiedOutboundMessage,
): Promise<ResendSendResult> {
  const apiKey = resolveResendApiKey(credentials);
  if (!apiKey) {
    return { ok: false, message: "No sending credentials are available for this account." };
  }

  const headers = sanitizeHeaders(message.headers);
  const hasHeaders = Object.keys(headers).length > 0;
  const replyTo = message.replyTo || undefined;

  try {
    const res = await fetch(`${API}/emails`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${message.fromName} <${message.fromEmail}>`,
        to: [message.to],
        ...(message.cc?.length ? { cc: message.cc } : {}),
        ...(message.bcc?.length ? { bcc: message.bcc } : {}),
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(hasHeaders ? { headers } : {}),
        ...(message.attachments?.length
          ? {
              attachments: message.attachments
                .filter((a) => a.url || a.content)
                .map((a) => ({
                  filename: a.name,
                  ...(a.content ? { content: a.content } : { path: a.url }),
                })),
            }
          : {}),
      }),
    });

    const body = await res.text();
    const requestId =
      res.headers.get("x-request-id") ??
      res.headers.get("request-id") ??
      res.headers.get("cf-ray") ??
      null;

    if (!res.ok) {
      return {
        ok: false,
        message: `Provider refused the send [${res.status}]: ${body.slice(0, 300)}`,
        statusCode: res.status,
        requestId,
        providerResponse: body.slice(0, 1000),
      };
    }

    const providerMessageId = extractResendMessageId(body, res.headers) ?? null;
    // The RFC Message-ID is not returned by the send call; it is read back from
    // the provider so replies can be threaded. Resend-specific, kept here.
    const rfcMessageId = providerMessageId
      ? ((await getResendRfcMessageIdSafe(providerMessageId, credentials)) ?? null)
      : null;

    return {
      ok: true,
      message: `Provider accepted the email for ${message.to}.`,
      providerMessageId,
      rfcMessageId,
      statusCode: res.status,
      requestId,
      providerResponse: body.slice(0, 1000),
      rawMetadata: body.slice(0, 1000),
    };
  } catch (error) {
    return { ok: false, message: `Could not reach the provider: ${(error as Error).message}` };
  }
}

async function getResendRfcMessageIdSafe(
  providerMessageId: string,
  credentials: EmailProviderCredentials,
): Promise<string | undefined> {
  const body = await getResendEmail(providerMessageId, credentials);
  return body ? extractRfcMessageId(body) : undefined;
}

/* ------------------------------------------------------------------ *
 * Provider-side send status (used by delivery reconciliation)
 * ------------------------------------------------------------------ */

export async function resendSendStatus(
  credentials: EmailProviderCredentials,
  providerMessageId: string,
): Promise<UnifiedSendStatus> {
  const body = await getResendEmail(providerMessageId, credentials);
  if (!body) {
    return { known: false, status: null, detail: "No provider record for this message." };
  }
  const lastEvent = body["last_event"];
  const status = resendEventType(lastEvent);
  if (status === "UNKNOWN") {
    return { known: false, status: null, detail: `Unrecognized provider state (${String(lastEvent ?? "none")}).` };
  }
  return {
    known: true,
    status,
    detail: `Recovered from delivery log (${String(lastEvent)})`,
  };
}
