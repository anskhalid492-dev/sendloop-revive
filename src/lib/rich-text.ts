/**
 * Rich text for the human composer (inbox reply + new email).
 *
 * The composer produces a small amount of inline HTML — bold, italic,
 * underline, links, line breaks. It reuses the existing email HTML sanitizer
 * (`sanitizeSignatureHtml`) so there is ONE allow-list in the product, and the
 * existing HTML-to-text helper so the plain-text part of every email stays
 * readable and keeps link destinations.
 *
 * Nothing here changes campaign sending: campaigns still compose from plain
 * text through `campaignBodyHtml`.
 */
import { sanitizeSignatureHtml, signatureHtmlToText } from "@/lib/signature-model";

/** Sanitized HTML for a composer body. Safe to store, send and render. */
export function sanitizeComposerHtml(input: string | null | undefined): string {
  const html = sanitizeSignatureHtml(input);
  // A contenteditable left empty still reports "<br>" or an empty paragraph.
  const stripped = html.replace(/<(br|p|div|span)\b[^>]*>/gi, "").replace(/<\/(p|div|span)>/gi, "");
  return stripped.replace(/&nbsp;/gi, " ").trim() ? html : "";
}

/** Readable plain-text equivalent, used for the email's text part. */
export function composerHtmlToText(html: string | null | undefined): string {
  return signatureHtmlToText(html);
}

/** True when the composer holds something other than empty markup. */
export function composerHtmlHasContent(html: string | null | undefined): boolean {
  return composerHtmlToText(sanitizeComposerHtml(html)).trim().length > 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Plain text -> composer HTML, for seeding the editor from a saved template, a
 * draft, or an AI-written draft. Blank lines become paragraphs.
 */
export function textToComposerHtml(text: string | null | undefined): string {
  const value = (text ?? "").toString();
  if (!value.trim()) return "";
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Link destination check for the composer's link control.
 *
 * Only web and mail links are accepted; `javascript:`, `data:` and friends are
 * rejected outright. A bare domain is upgraded to https.
 */
export function safeLinkUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().replace(/[\u0000-\u001f\s]/g, "");
  if (!value) return null;
  if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/|\?|#|$)/i.test(value)) return `https://${value}`;
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value)) return `mailto:${value}`;
  return null;
}
