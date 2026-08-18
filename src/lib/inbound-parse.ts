/**
 * Provider-agnostic parsing of inbound email payloads.
 *
 * Pure functions only, so the webhook route and the admin retry path process a
 * stored payload in exactly the same way.
 */
import { z } from "zod";

export const inboundPayloadSchema = z.object({
  from: z.string().trim().min(3).max(320),
  fromName: z.string().trim().max(200).nullish(),
  to: z.string().trim().min(3).max(320),
  cc: z.array(z.string().trim().max(320)).max(20).optional(),
  subject: z.string().max(500).nullish(),
  text: z.string().max(200000).nullish(),
  html: z.string().max(400000).nullish(),
  messageId: z.string().max(400).nullish(),
  inReplyTo: z.string().max(400).nullish(),
  references: z
    .union([z.array(z.string().max(400)).max(50), z.string().max(4000)])
    .optional(),
  receivedAt: z.string().max(60).nullish(),
  attachments: z
    .array(
      z.object({
        name: z.string().max(300),
        url: z.string().max(1000).optional(),
        size: z.number().optional(),
      }),
    )
    .max(20)
    .optional(),
});

export type InboundPayload = z.infer<typeof inboundPayloadSchema>;

export function extractEmail(value: string): string {
  const match = /<([^>]+)>/.exec(value);
  return (match?.[1] ?? value).trim().toLowerCase();
}

export function extractName(value: string): string | null {
  const match = /^\s*"?([^"<]+?)"?\s*</.exec(value);
  return match?.[1]?.trim() || null;
}

function firstAddress(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value.split(",")[0]! : "";
}

export function headerOf(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== "object") return null;
  const wanted = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (entry && typeof entry === "object" && typeof (entry as { name?: string }).name === "string") {
        const item = entry as { name: string; value?: unknown };
        if (item.name.toLowerCase() === wanted && typeof item.value === "string") return item.value;
      }
    }
    return null;
  }
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === wanted && typeof value === "string") return value;
  }
  return null;
}

export type EventKind = "inbound" | "delivered" | "bounced" | "complained" | "unsubscribed" | "unknown";

/** Classifies the webhook event so delivery signals are not treated as replies. */
export function classifyEvent(input: Record<string, unknown>): EventKind {
  const raw = String(input["type"] ?? input["event"] ?? input["RecordType"] ?? "").toLowerCase();
  if (!raw || raw.includes("received") || raw.includes("inbound")) return "inbound";
  if (raw.includes("bounce")) return "bounced";
  if (raw.includes("complain") || raw.includes("spam")) return "complained";
  if (raw.includes("unsub")) return "unsubscribed";
  if (raw.includes("deliver")) return "delivered";
  return "unknown";
}

/** A stable id per provider event, used for webhook idempotency. */
export function externalIdOf(input: Record<string, unknown>, kind: EventKind): string | null {
  const source =
    input["data"] && typeof input["data"] === "object"
      ? (input["data"] as Record<string, unknown>)
      : input;
  const id =
    input["event_id"] ??
    input["id"] ??
    source["event_id"] ??
    source["email_id"] ??
    source["message_id"] ??
    source["messageId"] ??
    source["Message-Id"] ??
    headerOf(source["headers"], "message-id");
  return id ? `${kind}:${String(id).replace(/[<>]/g, "").slice(0, 300)}` : null;
}

/** Reduces any supported provider shape to the fields ingestion needs. */
export function normalizeInbound(input: Record<string, unknown>): Record<string, unknown> | null {
  const source =
    input["data"] && typeof input["data"] === "object"
      ? (input["data"] as Record<string, unknown>)
      : input;

  const headers = source["headers"];
  const rawFrom =
    firstAddress(source["from"]) || firstAddress(source["sender"]) || firstAddress(source["From"]);
  const rawTo =
    firstAddress(source["to"]) || firstAddress(source["recipient"]) || firstAddress(source["To"]);
  if (!rawFrom || !rawTo) return null;

  const cc = source["cc"] ?? source["Cc"];
  const ccList = Array.isArray(cc)
    ? cc.map(String)
    : typeof cc === "string" && cc.trim()
      ? cc.split(",")
      : [];

  return {
    from: rawFrom,
    fromName:
      (typeof source["fromName"] === "string" ? source["fromName"] : null) ?? extractName(rawFrom),
    to: rawTo,
    cc: ccList,
    subject: source["subject"] ?? source["Subject"] ?? null,
    text: source["text"] ?? source["body-plain"] ?? source["stripped-text"] ?? null,
    html: source["html"] ?? source["body-html"] ?? null,
    messageId:
      source["messageId"] ??
      source["message_id"] ??
      source["Message-Id"] ??
      headerOf(headers, "message-id") ??
      null,
    inReplyTo:
      source["inReplyTo"] ?? source["In-Reply-To"] ?? headerOf(headers, "in-reply-to") ?? null,
    references:
      source["references"] ?? source["References"] ?? headerOf(headers, "references") ?? undefined,
    receivedAt: source["receivedAt"] ?? source["created_at"] ?? source["timestamp"] ?? null,
    attachments: Array.isArray(source["attachments"]) ? source["attachments"] : [],
  };
}

/** Recipient + provider message id for a delivery (non-reply) event. */
export function normalizeDelivery(input: Record<string, unknown>) {
  const source =
    input["data"] && typeof input["data"] === "object"
      ? (input["data"] as Record<string, unknown>)
      : input;
  const to = firstAddress(source["to"]) || firstAddress(source["recipient"]) || firstAddress(source["email"]);
  const providerMessageId =
    (source["email_id"] as string) ??
    (source["message_id"] as string) ??
    (source["MessageID"] as string) ??
    null;
  const reasonSource = (source["bounce"] ?? source) as Record<string, unknown>;
  const reason =
    (reasonSource["message"] as string) ??
    (reasonSource["reason"] as string) ??
    (reasonSource["Description"] as string) ??
    null;
  return {
    email: to ? extractEmail(to) : null,
    providerMessageId: providerMessageId ? String(providerMessageId) : null,
    reason: reason ? String(reason).slice(0, 500) : null,
  };
}
