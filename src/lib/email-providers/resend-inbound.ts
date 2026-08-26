/**
 * Resend inbound payload -> MunchReach `InboundEmailEvent`.
 *
 * Deliberately delegates to the production parser in `@/lib/inbound-parse`
 * (`normalizeInbound`, `classifyEvent`, `externalIdOf`) so threading-critical
 * extraction — Message-ID, In-Reply-To, References, plus-routed recipients —
 * behaves exactly as it does today. This module only reshapes those values into
 * the provider-agnostic event type; it adds no new parsing rules.
 */
import { classifyEvent, externalIdOf, normalizeInbound } from "@/lib/inbound-parse";
import { firstProviderMessageId } from "@/lib/provider-message-id";
import type { InboundEmailAttachment, InboundEmailEvent } from "./types";

const ID = "resend";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => str(v)).filter((v): v is string => !!v);
  const single = str(value);
  if (!single) return [];
  return single
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function attachments(value: unknown): InboundEmailAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const a = (item ?? {}) as Record<string, unknown>;
    return {
      filename: str(a["filename"] ?? a["name"] ?? a["Name"]),
      contentType: str(a["content_type"] ?? a["contentType"] ?? a["ContentType"]),
      size: typeof a["size"] === "number" ? a["size"] : null,
      content: str(a["content"] ?? a["Content"]),
      url: str(a["url"] ?? a["Url"]),
    };
  });
}

/** Returns `null` when the payload is not an inbound/reply message. */
export function resendInboundEvent(payload: unknown): InboundEmailEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const kind = classifyEvent(raw);
  if (kind !== "inbound") return null;

  const normalized = normalizeInbound(raw);
  if (!normalized) return null;

  const source = (raw["data"] && typeof raw["data"] === "object" ? raw["data"] : raw) as Record<
    string,
    unknown
  >;

  const from = str(normalized["from"]);
  const to = list(normalized["to"]);
  if (!from || to.length === 0) return null;

  return {
    provider: ID,
    providerEventId: externalIdOf(raw, kind),
    providerMessageId: firstProviderMessageId(source),
    from,
    to,
    cc: list(normalized["cc"]),
    bcc: list(source["bcc"] ?? source["Bcc"]),
    subject: str(normalized["subject"]),
    text: str(normalized["text"]),
    html: str(normalized["html"]),
    messageId: str(normalized["messageId"]),
    inReplyTo: str(normalized["inReplyTo"]),
    references: list(normalized["references"]),
    // Root-level `created_at` is the provider's envelope timestamp; the legacy
    // parser only looks inside `data`, so fall back without changing it.
    receivedAt: str(normalized["receivedAt"]) ?? str(raw["created_at"]),
    attachments: attachments(normalized["attachments"]),
    rawMetadata: payload,
  };
}
