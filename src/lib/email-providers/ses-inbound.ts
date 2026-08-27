/**
 * Amazon SES inbound (SNS HTTPS notification) -> MunchReach inbound payload.
 *
 * Flow this module serves:
 *   Gmail reply -> customer@customer-domain.com -> SES receipt rule ->
 *   SNS HTTPS POST -> MunchReach -> existing inbound processor -> Unified Inbox
 *
 * SES wraps the receipt notification inside an SNS envelope, and the SES
 * notification itself carries either the full raw MIME message (`content`) or
 * headers only. This module reshapes that into the SAME flat payload shape the
 * production inbound parser (`src/lib/inbound-parse.ts`) already reads, so
 * routing, threading and idempotency behave identically to other providers.
 *
 * Pure and client-safe: no AWS calls, no environment, no Supabase.
 */
import { classifyEvent, externalIdOf, normalizeInbound } from "@/lib/inbound-parse";
import { parseMimeMessage, type MimeHeader } from "./ses-mime";
import type { InboundEmailEvent } from "./types";

const ID = "ses";

export type SnsEnvelope = {
  type: string;
  messageId: string | null;
  topicArn: string | null;
  subject: string | null;
  message: string;
  timestamp: string | null;
  signatureVersion: string | null;
  signature: string | null;
  signingCertUrl: string | null;
  subscribeUrl: string | null;
  token: string | null;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => str(v)).filter((v): v is string => !!v);
  const single = str(value);
  if (!single) return [];
  return single.split(",").map((p) => p.trim()).filter(Boolean);
}

/** Reads the SNS envelope, whatever casing the delivery uses. */
export function parseSnsEnvelope(payload: unknown): SnsEnvelope | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const type = str(p["Type"] ?? p["type"]);
  if (!type) return null;
  const known = ["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"];
  if (!known.includes(type)) return null;
  return {
    type,
    messageId: str(p["MessageId"]),
    topicArn: str(p["TopicArn"]),
    subject: str(p["Subject"]),
    message: typeof p["Message"] === "string" ? (p["Message"] as string) : "",
    timestamp: str(p["Timestamp"]),
    signatureVersion: str(p["SignatureVersion"]),
    signature: str(p["Signature"]),
    signingCertUrl: str(p["SigningCertURL"] ?? p["SigningCertUrl"]),
    subscribeUrl: str(p["SubscribeURL"] ?? p["SubscribeUrl"]),
    token: str(p["Token"]),
  };
}

type SesNotification = {
  notificationType?: string;
  eventType?: string;
  content?: string;
  mail?: {
    timestamp?: string;
    source?: string;
    messageId?: string;
    destination?: string[];
    headers?: { name?: string; value?: string }[];
    commonHeaders?: Record<string, unknown>;
  };
  receipt?: { recipients?: string[] };
};

function sesNotification(envelope: SnsEnvelope): SesNotification | null {
  try {
    const parsed = JSON.parse(envelope.message) as SesNotification;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function headerList(raw: unknown): MimeHeader[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const name = str(item["name"] ?? item["Name"] ?? item["key"]);
      const value = str(item["value"] ?? item["Value"]);
      return name && value ? { name, value } : null;
    })
    .filter((h): h is MimeHeader => h !== null);
}

function headerOf(headers: MimeHeader[], name: string): string | null {
  const wanted = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === wanted)?.value ?? null;
}

/**
 * Turns an SNS/SES receipt notification into the flat inbound payload shape the
 * existing processor understands. Returns `null` for anything that is not an
 * inbound (received) message.
 */
export function sesFlattenInboundPayload(payload: unknown): Record<string, unknown> | null {
  const envelope = parseSnsEnvelope(payload);
  if (!envelope || envelope.type !== "Notification") return null;
  const notification = sesNotification(envelope);
  if (!notification) return null;

  const kind = String(notification.notificationType ?? notification.eventType ?? "").toLowerCase();
  if (kind !== "received") return null;

  const mail = notification.mail ?? {};
  const common = (mail.commonHeaders ?? {}) as Record<string, unknown>;

  // Raw MIME (when the receipt rule includes the message) is the richest source
  // for headers and bodies; notification headers are the fallback.
  const rawMime = notification.content ? parseMimeMessage(atobSafe(notification.content)) : null;
  const headers: MimeHeader[] = [...headerList(mail.headers), ...(rawMime?.headers ?? [])];

  const from =
    str(common["from"] instanceof Array ? (common["from"] as string[])[0] : common["from"]) ??
    headerOf(headers, "from") ??
    str(mail.source);
  // Envelope recipients carry the plus-routing token; header To may be rewritten.
  const recipients = [
    ...list(notification.receipt?.recipients),
    ...list(mail.destination),
    ...list(common["to"]),
  ];
  if (!from || recipients.length === 0) return null;

  const messageId =
    str(common["messageId"]) ?? headerOf(headers, "message-id") ?? str(mail.messageId);

  return {
    type: "email.received",
    provider: ID,
    data: {
      email_id: str(mail.messageId),
      from,
      to: recipients,
      envelope: { to: recipients },
      cc: list(common["cc"]),
      bcc: list(common["bcc"]),
      subject: str(common["subject"]) ?? headerOf(headers, "subject"),
      text: rawMime?.text ?? null,
      html: rawMime?.html ?? null,
      headers,
      messageId,
      "in-reply-to": headerOf(headers, "in-reply-to"),
      references: headerOf(headers, "references"),
      created_at: str(mail.timestamp) ?? envelope.timestamp,
      timestamp: str(mail.timestamp) ?? envelope.timestamp,
    },
  };
}

function atobSafe(content: string): string {
  // SES base64-encodes the raw message; some rules deliver it already decoded.
  if (/^[A-Za-z0-9+/=\r\n\s]+$/.test(content) && content.length > 32) {
    const decoded = decodeBase64Safe(content);
    if (decoded.includes(":")) return decoded;
  }
  return content;
}

function decodeBase64Safe(value: string): string {
  try {
    const binary = atob(value.replace(/[\r\n\s]/g, ""));
    return new TextDecoder("utf-8").decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

/** Provider-neutral inbound event for the unified layer. */
export function sesInboundEvent(payload: unknown): InboundEmailEvent | null {
  const flat = sesFlattenInboundPayload(payload);
  if (!flat) return null;
  if (classifyEvent(flat) !== "inbound") return null;

  const normalized = normalizeInbound(flat);
  if (!normalized) return null;
  const source = flat["data"] as Record<string, unknown>;

  const from = str(normalized["from"]);
  const to = list(normalized["to"]);
  if (!from || to.length === 0) return null;

  return {
    provider: ID,
    providerEventId: externalIdOf(flat, "inbound"),
    providerMessageId: str(source["email_id"]),
    from,
    to,
    cc: list(source["cc"]),
    bcc: list(source["bcc"]),
    subject: str(normalized["subject"]),
    text: str(normalized["text"]),
    html: str(normalized["html"]),
    messageId: str(normalized["messageId"]),
    inReplyTo: str(normalized["inReplyTo"]),
    references: list(normalized["references"]),
    receivedAt: str(normalized["receivedAt"]),
    attachments: [],
    rawMetadata: payload,
  };
}
