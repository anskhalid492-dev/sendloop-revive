/**
 * Generic, provider-agnostic normalization helpers used by the new adapters.
 * Adapters may override these when a provider needs special handling.
 */
import { firstProviderMessageId } from "@/lib/provider-message-id";
import type { InboundEmailEvent, NormalizedEmailEvent, NormalizedEmailEventType } from "./types";

const MAP: { match: (raw: string) => boolean; type: NormalizedEmailEventType }[] = [
  { match: (r) => r.includes("inbound") || r.includes("received") || r.includes("repl"), type: "REPLIED" },
  { match: (r) => r.includes("complain") || r.includes("spam"), type: "COMPLAINED" },
  { match: (r) => r.includes("unsub"), type: "UNSUBSCRIBED" },
  { match: (r) => r.includes("bounce"), type: "BOUNCED" },
  { match: (r) => r.includes("fail") || r.includes("reject") || r.includes("drop"), type: "FAILED" },
  { match: (r) => r.includes("deliver"), type: "DELIVERED" },
  { match: (r) => r.includes("click"), type: "CLICKED" },
  { match: (r) => r.includes("open"), type: "OPENED" },
  { match: (r) => r.includes("accept") || r.includes("queued"), type: "ACCEPTED" },
  { match: (r) => r.includes("sent") || r.includes("send"), type: "SENT" },
];

export function normalizedEventType(raw: unknown): NormalizedEmailEventType | "UNKNOWN" {
  const value = String(raw ?? "").toLowerCase();
  if (!value) return "UNKNOWN";
  return MAP.find((entry) => entry.match(value))?.type ?? "UNKNOWN";
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => str(v)).filter((v): v is string => !!v);
  const single = str(value);
  return single ? [single] : [];
}

function body(payload: unknown): Record<string, unknown> {
  const p = (payload ?? {}) as Record<string, unknown>;
  const data = p["data"];
  return data && typeof data === "object" ? { ...p, ...(data as Record<string, unknown>) } : p;
}

export function normalizeEmailEvent(provider: string, payload: unknown): NormalizedEmailEvent {
  const p = body(payload);
  return {
    type: normalizedEventType(p["type"] ?? p["event"] ?? p["RecordType"] ?? p["eventType"]),
    provider,
    providerEventId: str(p["event_id"] ?? p["eventId"] ?? p["id"]),
    providerMessageId: firstProviderMessageId(payload),
    rfcMessageId: str(p["rfc_message_id"] ?? p["Message-ID"] ?? p["message-id"]),
    recipient: str(p["email"] ?? p["recipient"] ?? p["Recipient"]) ?? list(p["to"])[0] ?? null,
    sender: str(p["from"] ?? p["From"] ?? p["sender"]),
    subject: str(p["subject"] ?? p["Subject"]),
    url: str(p["url"] ?? p["link"]),
    reason: str(p["reason"] ?? p["Description"] ?? p["error"]),
    occurredAt: str(p["created_at"] ?? p["timestamp"] ?? p["occurred_at"]),
    rawMetadata: payload,
  };
}

export function normalizeInboundEvent(provider: string, payload: unknown): InboundEmailEvent | null {
  const p = body(payload);
  const from = str(p["from"] ?? p["From"] ?? p["sender"]) ?? list(p["from"])[0];
  const to = list(p["to"] ?? p["To"] ?? p["recipient"]);
  if (!from || to.length === 0) return null;
  return {
    provider,
    providerEventId: str(p["event_id"] ?? p["eventId"] ?? p["id"]),
    providerMessageId: firstProviderMessageId(payload),
    from,
    to,
    cc: list(p["cc"] ?? p["Cc"]),
    bcc: list(p["bcc"] ?? p["Bcc"]),
    subject: str(p["subject"] ?? p["Subject"]),
    text: str(p["text"] ?? p["TextBody"] ?? p["body-plain"]),
    html: str(p["html"] ?? p["HtmlBody"] ?? p["body-html"]),
    messageId: str(p["message_id"] ?? p["messageId"] ?? p["Message-ID"]),
    inReplyTo: str(p["in_reply_to"] ?? p["inReplyTo"] ?? p["In-Reply-To"]),
    references: list(p["references"] ?? p["References"]),
    receivedAt: str(p["created_at"] ?? p["timestamp"] ?? p["received_at"]),
    rawMetadata: payload,
  };
}
