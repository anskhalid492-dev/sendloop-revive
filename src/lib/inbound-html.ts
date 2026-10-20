/**
 * Safe rendering of an inbound (prospect-written) HTML email body in the
 * Unified Inbox.
 *
 * Mail clients send whole HTML documents: a DOCTYPE, an XML prolog, a <head>
 * with <title>/<meta>/<style>, Outlook conditional comments and `o:` namespace
 * tags. The shared email allow-list sanitizer is built for fragments and would
 * escape declarations like `<!DOCTYPE …>` into visible text, so the document
 * scaffolding is removed here first and only the <body> content is sanitized.
 *
 * Pure and client-safe. Stored records are never changed — this runs at render.
 */
import { sanitizeSignatureHtml } from "@/lib/signature-model";

/** Strips document-level scaffolding, leaving only renderable body content. */
export function stripHtmlDocumentScaffolding(input: string): string {
  let html = input.replace(/^\uFEFF/, "");

  // Outlook conditional comments (both downlevel-hidden and downlevel-revealed).
  html = html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "");
  html = html.replace(/<!\[if[^\]]*\]>|<!\[endif\]>/gi, "");
  html = html.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  // Unterminated comment (truncated mail): drop the rest.
  html = html.replace(/<!--[\s\S]*$/g, "");
  // DOCTYPE and any other markup declaration, plus XML prolog / processing instructions.
  html = html.replace(/<![^>]*>/g, "");
  html = html.replace(/<\?[\s\S]*?\?>/g, "");

  // Head (with title/meta/style) never belongs in the message.
  html = html.replace(/<head\b[\s\S]*?<\/head\s*>/gi, "");
  html = html.replace(/<title\b[\s\S]*?<\/title\s*>/gi, "");

  // Prefer what is inside <body> when the document has one.
  const body = /<body\b[^>]*>([\s\S]*?)(<\/body\s*>|$)/i.exec(html);
  if (body) html = body[1] ?? "";

  // Leftover wrappers and Office namespace tags (<o:p>, <v:shape>…).
  html = html.replace(/<\/?(html|head|body)\b[^>]*>/gi, "");
  html = html.replace(/<\/?[a-z]+:[a-z0-9-]+\b[^>]*>/gi, "");
  return html.trim();
}

/** Sanitized, renderable HTML for an inbound message; "" when nothing visible remains. */
export function sanitizeInboundHtml(input: string | null | undefined): string {
  const raw = (input ?? "").toString();
  if (!raw.trim()) return "";
  const cleaned = sanitizeSignatureHtml(stripHtmlDocumentScaffolding(raw))
    // Defensive: a declaration that slipped through as escaped text.
    .replace(/&lt;!(DOCTYPE|\[CDATA\[|--)[^>]*?(&gt;|>)/gi, "")
    .trim();
  const visible = cleaned
    .replace(/<img\b[^>]*>/gi, "IMG")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim();
  return visible ? cleaned : "";
}
