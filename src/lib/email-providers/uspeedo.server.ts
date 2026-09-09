/**
 * uSpeedo provider adapter (unified layer).
 *
 * Documented API surface used here:
 *   POST https://api.uspeedo.com/api/v1/email/SendEmail   send
 *   GET  https://api.uspeedo.com/api/v1/email/GetSenderList  read-only check
 *   Auth: HTTP Basic with the console access-key pair.
 *   Webhook payload envelope: `{ "MsgType": 2, "Data": [ { … } ] }`.
 *
 * uSpeedo documents NO domain, DNS-record or inbound-email endpoints, and
 * webhook subscriptions are created in its console. Those are declared
 * unsupported / manual here rather than invented.
 */
import type { EmailProvider } from "./provider";
import {
  capabilities,
  type NormalizedEmailEvent,
  type NormalizedEmailEventType,
  type UnifiedSendResult,
} from "./types";

const API = "https://api.uspeedo.com/api/v1/email";
const ID = "uspeedo";

const EVENT_MAP: Record<string, NormalizedEmailEventType> = {
  request: "ACCEPTED",
  deliver: "DELIVERED",
  open: "OPENED",
  click: "CLICKED",
  bounce: "BOUNCED",
  unsubscribe: "UNSUBSCRIBED",
  report_spam: "COMPLAINED",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function uspeedoAuthHeader(creds: Record<string, string>): string {
  const id = creds["access_key_id"] ?? "";
  const secret = creds["access_key_secret"] ?? "";
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export function uspeedoHeaders(creds: Record<string, string>) {
  return {
    Authorization: uspeedoAuthHeader(creds),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function uspeedoEvent(payload: unknown): NormalizedEmailEvent | null {
  const p = asRecord(payload);
  const list = Array.isArray(p["Data"]) ? (p["Data"] as unknown[]) : [];
  const d = asRecord(list[0] ?? p);
  const event = (str(d["Event"]) ?? "").toLowerCase();
  if (!event) return null;
  return {
    type: EVENT_MAP[event] ?? "UNKNOWN",
    provider: ID,
    providerEventId: str(d["MsgId"]) ? `${str(d["MsgId"])}:${event}` : null,
    providerMessageId: str(d["MsgId"]) ?? str(d["SessionNo"]),
    recipient: str(d["RecipientEmail"]),
    url: str(d["ClickedURL"]),
    bounceType: event === "bounce" ? "unknown" : null,
    reason: str(d["ReceiptDesc"]) ?? str(d["ReceiptResult"]),
    occurredAt: str(d["ReceiptTime"]),
    rawMetadata: payload,
  };
}

async function sendUspeedo(
  creds: Record<string, string>,
  message: Parameters<NonNullable<EmailProvider["send"]>>[1],
): Promise<UnifiedSendResult> {
  const headers = Object.entries(message.headers ?? {}).map(([Name, Value]) => ({ Name, Value }));
  const res = await fetch(`${API}/SendEmail`, {
    method: "POST",
    headers: uspeedoHeaders(creds),
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      From: message.fromEmail,
      FromName: message.fromName,
      To: [message.to],
      ...(message.cc?.length ? { Cc: message.cc } : {}),
      ...(message.bcc?.length ? { Bcc: message.bcc } : {}),
      Subject: message.subject,
      Text: message.text,
      ...(message.html ? { Html: message.html } : {}),
      ...(headers.length ? { Headers: headers } : {}),
    }),
  });
  const body = await res.text();
  let json: unknown = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }
  const payload = asRecord(json);
  // The provider signals application-level failures with a non-zero RetCode.
  const retCode = Number(payload["RetCode"] ?? -1);
  const ok = res.ok && retCode === 0;
  return {
    ok,
    providerMessageId: str(payload["SessionNo"]),
    statusCode: res.status,
    message: ok
      ? `Provider accepted the email for ${message.to}.`
      : `Provider refused the send [${res.status}${retCode >= 0 ? `/${retCode}` : ""}]: ${
          str(payload["Message"]) ?? body.slice(0, 300)
        }`,
    rawMetadata: json,
  };
}

export const uspeedoEmailProvider: EmailProvider = {
  id: ID,
  label: "uSpeedo",
  // Sending domains are authorised in the uSpeedo console, not over the API.
  inboundSetupMode: "unsupported",
  capabilities: capabilities({
    sending: true,
    delivery_tracking: true,
    open_tracking: true,
    click_tracking: true,
    bounce_tracking: true,
    webhooks: true,
  }),

  async send(creds, message) {
    return sendUspeedo(creds, message);
  },

  identifyWebhookRequest(request) {
    const p = asRecord(request.payload);
    const list = Array.isArray(p["Data"]) ? (p["Data"] as unknown[]) : [];
    const first = asRecord(list[0]);
    if (p["MsgType"] !== undefined && (first["Event"] ?? first["SessionNo"])) {
      return {
        provider: ID,
        matched: true,
        confidence: "likely",
        detail: "Payload carries this provider's MsgType/Data envelope.",
      };
    }
    return {
      provider: ID,
      matched: false,
      confidence: "none",
      detail: "No provider-specific payload envelope found.",
    };
  },

  parseDeliveryEvent: uspeedoEvent,
  parseTrackingEvent: uspeedoEvent,
};

export const USPEEDO_API = API;
