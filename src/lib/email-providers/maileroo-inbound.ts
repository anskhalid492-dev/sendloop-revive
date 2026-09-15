/**
 * Maileroo inbound webhook -> MunchReach inbound payload.
 *
 * Flow this module serves:
 *   reply -> customer@customer-domain.com -> Maileroo inbound route ->
 *   HTTPS POST -> MunchReach -> existing inbound processor -> Unified Inbox
 *
 * Maileroo's inbound payload differs from its delivery-event envelope: the
 * authoritative addresses live in `envelope_sender` / `recipients`, threading
 * headers live in a `headers` map whose values are arrays, and the body is
 * supplied twice — raw and already quote-stripped by Maileroo.
 *
 * Like the Amazon/Resend/Bird translators, this module only reshapes the
 * payload into the SAME flat shape the production parser
 * (`src/lib/inbound-parse.ts`) reads, so routing, threading and idempotency
 * behave identically for every provider.
 *
 * Pure and client-safe: no provider calls, no environment, no Supabase.
 */
import { classifyEvent, externalIdOf, normalizeInbound } from "@/lib/inbound-parse";
import type { InboundEmailAttachment, InboundEmailEvent } from "./types";

const ID = "maileroo";

type MailerooBody = {
  plaintext?: unknown;
  stripped_plaintext?: unknown;
  html?: unknown;
  stripped_html?: unknown;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

/** Maileroo header values are arrays; the first entry is the effective one. */
export function mailerooHeader(headers: unknown, name: string): string | null {
  const map = record(headers);
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(map)) {
    if (key.toLowerCase() !== wanted) continue;
    if (Array.isArray(value)) return str(value[0]);
    return str(value);
  }
  return null;
}

/** Flattens the header map into the `{ name, value }` list the parser reads. */
function headerPairs(headers: unknown): { name: string; value: string }[] {
  const pairs: { name: string; value: string }[] = [];
  for (const [key, value] of Object.entries(record(headers))) {
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      const text = str(entry);
      if (text) pairs.push({ name: key, value: text });
    }
  }
  return pairs;
}

/**
 * True only for Maileroo's inbound-message payload. Its delivery-event payload
 * carries `event_type` instead and is handled by the tracking translator.
 */
export function isMailerooInboundPayload(payload: unknown): boolean {
  const p = record(payload);
  if (p["event_type"]) return false;
  const hasEnvelope = typeof p["envelope_sender"] === "string";
  const hasRecipients = Array.isArray(p["recipients"]);
  const hasBody = p["body"] !== undefined && typeof p["body"] === "object";
  return hasEnvelope && hasRecipients && hasBody;
}

/** The one-time authenticity URL Maileroo includes with each delivery. */
export function mailerooValidationUrl(payload: unknown): string | null {
  return str(record(payload)["validation_url"]);
}

function attachments(value: unknown): InboundEmailAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const a = record(item);
    return {
      filename: str(a["filename"]),
      contentType: str(a["content_type"]),
      size: typeof a["size"] === "number" ? a["size"] : null,
      // Maileroo exposes attachments as downloadable URLs, never inline bytes.
      content: null,
      url: str(a["url"]),
    };
  });
}

/**
 * Turns a Maileroo inbound payload into the flat shape the existing processor
 * understands. Returns `null` for anything that is not an inbound message.
 */
export function mailerooFlattenInboundPayload(payload: unknown): Record<string, unknown> | null {
  if (!isMailerooInboundPayload(payload)) return null;
  const p = record(payload);
  const headers = p["headers"];
  const body = record(p["body"]) as MailerooBody;

  // The envelope sender is the authoritative address. The From header is only
  // used when it names the very same address, so the inbox can show a display
  // name without ever trusting a header over the envelope.
  const envelopeSender = str(p["envelope_sender"]);
  const fromHeader = mailerooHeader(headers, "from");
  const from =
    envelopeSender && fromHeader && extractEmail(fromHeader) === extractEmail(envelopeSender)
      ? fromHeader
      : (envelopeSender ?? fromHeader);
  // Envelope recipients carry the plus-routing token; the To header may be rewritten.
  const recipients = [...list(p["recipients"]), ...list(mailerooHeader(headers, "to"))];
  if (!from || recipients.length === 0) return null;

  const messageId = str(p["message_id"]) ?? mailerooHeader(headers, "message-id");
  const processedAt = Number(p["processed_at"]);
  const receivedAt =
    Number.isFinite(processedAt) && processedAt > 0
      ? new Date(processedAt * 1000).toISOString()
      : null;

  // Maileroo already removes the quoted original, so the stripped variants are
  // the displayed reply; the raw variants stay available as full history.
  const strippedText = str(body.stripped_plaintext);
  const strippedHtml = str(body.stripped_html);
  const rawText = str(body.plaintext);
  const rawHtml = str(body.html);

  return {
    type: "email.received",
    provider: ID,
    data: {
      email_id: str(p["_id"]) ?? messageId,
      from,
      to: recipients,
      envelope: { to: recipients },
      cc: list(mailerooHeader(headers, "cc")),
      bcc: list(mailerooHeader(headers, "bcc")),
      subject: mailerooHeader(headers, "subject"),
      text: strippedText ?? rawText,
      html: strippedHtml ?? rawHtml,
      raw_text: rawText,
      raw_html: rawHtml,
      headers: headerPairs(headers),
      messageId,
      "in-reply-to": mailerooHeader(headers, "in-reply-to"),
      references: mailerooHeader(headers, "references"),
      attachments: attachments(p["attachments"]),
      spam: p["is_spam"] === true,
      created_at: receivedAt,
      timestamp: receivedAt,
    },
  };
}

/** Provider-neutral inbound event for the unified layer. */
export function mailerooInboundEvent(payload: unknown): InboundEmailEvent | null {
  const flat = mailerooFlattenInboundPayload(payload);
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
    attachments: attachments(source["attachments"]),
    rawMetadata: payload,
  };
}
