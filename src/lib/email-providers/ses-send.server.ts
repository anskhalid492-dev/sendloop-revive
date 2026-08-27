/**
 * Amazon SES OUTBOUND sending (SESv2 `SendEmail`).
 *
 * Phase 9B: this is the ONLY place in the codebase that knows how the SES send
 * API works. Campaign code keeps calling the existing provider abstraction
 * (`sendManagedEmail` -> `getAdapter(provider).sendEmail` ->
 * `sendProviderEmail`), which routes `ses` into the SES provider adapter.
 *
 * Quota is read with the EXISTING `getSesSendingQuota()` method — no new quota
 * system is introduced. Mailbox daily limits, campaign limits, warmup and
 * billing quotas remain owned by their existing layers.
 *
 * Server-only.
 */
import { sesRegion, sesRequest, resolveSesCredentials } from "./ses-api.server";
import { getSesSendingQuota, type SesSendingQuota } from "./ses.server";
import type {
  EmailProviderCredentials,
  UnifiedOutboundMessage,
  UnifiedSendResult,
} from "./types";

export type SesSendResult = UnifiedSendResult & {
  requestId?: string | null;
  providerResponse?: string | null;
};

/** Headers SES owns itself; passing them through would be rejected. */
const RESERVED_HEADERS = new Set([
  "from",
  "to",
  "cc",
  "bcc",
  "subject",
  "reply-to",
  "return-path",
  "date",
]);

function sanitizeHeaders(headers: Record<string, string> | undefined): { Name: string; Value: string }[] {
  const out: { Name: string; Value: string }[] = [];
  for (const [rawName, rawValue] of Object.entries(headers ?? {})) {
    const name = rawName.trim();
    const value = String(rawValue ?? "").trim();
    if (!name || !value) continue;
    if (!/^[A-Za-z0-9-]+$/.test(name)) continue;
    if (/[\r\n]/.test(value)) continue;
    if (RESERVED_HEADERS.has(name.toLowerCase())) continue;
    out.push({ Name: name, Value: value });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Quota (existing method, cached + rate-paced)
 * ------------------------------------------------------------------ */

type QuotaCacheEntry = { at: number; quota: SesSendingQuota };
const quotaCache = new Map<string, QuotaCacheEntry>();
const QUOTA_TTL_MS = 60_000;
const lastSendAt = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Clears the cached quota/rate state (tests + admin tooling). */
export function resetSesQuotaCache(): void {
  quotaCache.clear();
  lastSendAt.clear();
}

async function readQuota(creds: EmailProviderCredentials): Promise<SesSendingQuota> {
  const key = sesRegion(creds);
  const cached = quotaCache.get(key);
  if (cached && Date.now() - cached.at < QUOTA_TTL_MS) return cached.quota;
  const quota = await getSesSendingQuota(creds);
  if (quota.known) quotaCache.set(key, { at: Date.now(), quota });
  return quota;
}

/** Paces sends so SES `MaxSendRate` (messages/second) is never exceeded. */
async function respectSendRate(region: string, maxSendRate: number | null): Promise<void> {
  if (!maxSendRate || maxSendRate <= 0) return;
  const minGap = Math.min(1000 / maxSendRate, 2000);
  const previous = lastSendAt.get(region) ?? 0;
  const wait = previous + minGap - Date.now();
  if (wait > 0) await sleep(wait);
  lastSendAt.set(region, Date.now());
}

/* ------------------------------------------------------------------ *
 * Send
 * ------------------------------------------------------------------ */

export async function sendSesEmail(
  credentials: EmailProviderCredentials,
  message: UnifiedOutboundMessage,
): Promise<SesSendResult> {
  if (!resolveSesCredentials(credentials)) {
    return { ok: false, message: "No sending credentials are available for this account." };
  }

  // Existing SES quota method — a rejected pre-check never reaches the send API
  // and therefore never consumes provider or campaign quota.
  const quota = await readQuota(credentials);
  if (quota.known && !quota.sendingEnabled) {
    return { ok: false, message: "Sending is currently disabled on the sending infrastructure." };
  }
  if (
    quota.known &&
    quota.max24HourSend !== null &&
    quota.sentLast24Hours !== null &&
    quota.max24HourSend > 0 &&
    quota.sentLast24Hours >= quota.max24HourSend
  ) {
    return {
      ok: false,
      message: "The sending infrastructure has reached its 24 hour sending quota.",
    };
  }

  const region = sesRegion(credentials);
  await respectSendRate(region, quota.known ? quota.maxSendRate : null);

  const headers = sanitizeHeaders(message.headers);
  const replyTo = message.replyTo || undefined;

  const res = await sesRequest<{ MessageId?: string }>(
    credentials,
    "POST",
    "/v2/email/outbound-emails",
    {
      FromEmailAddress: `${message.fromName} <${message.fromEmail}>`,
      Destination: {
        ToAddresses: [message.to],
        ...(message.cc?.length ? { CcAddresses: message.cc } : {}),
        ...(message.bcc?.length ? { BccAddresses: message.bcc } : {}),
      },
      ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: message.text, Charset: "UTF-8" },
            ...(message.html ? { Html: { Data: message.html, Charset: "UTF-8" } } : {}),
          },
          ...(headers.length ? { Headers: headers } : {}),
        },
      },
    },
  );

  if (!res.ok) {
    return {
      ok: false,
      message: res.status
        ? `Provider refused the send [${res.status}]: ${res.detail.slice(0, 300)}`
        : res.detail,
      statusCode: res.status || null,
      providerResponse: res.detail.slice(0, 1000),
    };
  }

  const providerMessageId = (res.json?.MessageId ?? "").trim() || null;
  if (!providerMessageId) {
    // No acceptance id means we cannot correlate the message later; treat it as
    // a failure rather than marking an unverifiable send as accepted.
    return {
      ok: false,
      message: "The sending infrastructure accepted the request without a message id.",
      statusCode: res.status,
      providerResponse: res.detail.slice(0, 1000),
    };
  }

  return {
    ok: true,
    message: `Provider accepted the email for ${message.to}.`,
    providerMessageId,
    // SES stamps this exact RFC Message-ID on the accepted message.
    rfcMessageId: `<${providerMessageId}@${region}.amazonses.com>`,
    statusCode: res.status,
    requestId: providerMessageId,
    providerResponse: JSON.stringify(res.json ?? {}).slice(0, 1000),
    rawMetadata: res.json,
  };
}
