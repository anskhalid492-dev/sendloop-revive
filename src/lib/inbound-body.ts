/**
 * Reads the human-readable body out of a raw inbound message body.
 *
 * IMAP gives us the message body exactly as the sending client wrote it, which
 * for Gmail and most other clients is a multipart MIME container: boundary
 * lines, per-part headers, and a body encoded as quoted-printable or base64.
 * None of that scaffolding belongs in the Unified Inbox, so this module strips
 * it and decodes the real text.
 *
 * Pure and client-safe: one shared implementation for every inbound path, so a
 * fix here can never apply to only one of them. Quoting/"Show quoted text" is a
 * separate concern (`src/lib/reply-text.ts`) and is deliberately untouched.
 */
import { decodeBase64, decodeQuotedPrintable } from "@/lib/email-providers/ses-mime";

export type InboundBody = { text: string | null; html: string | null };

const MAX_DEPTH = 8;

function normalize(raw: string): string {
  return raw.replace(/\r\n/g, "\n");
}

function boundaryOf(contentType: string): string | null {
  const match = /boundary\s*=\s*("([^"]+)"|([^;\s]+))/i.exec(contentType);
  return match?.[2] ?? match?.[3] ?? null;
}

/**
 * Finds the boundary when no top-level Content-Type header was fetched: the
 * first `--token` line that the message later closes with `--token--`, or at
 * least repeats. Guessing is safe because the only thing we do with it is split.
 *
 * A body that *starts* on a boundary line is accepted even when that marker
 * appears only once: some clients (and some stored bodies) carry a single part
 * with no closing marker, and leaving it unsplit is what used to leak part
 * headers into the inbox.
 */
function sniffBoundary(body: string): string | null {
  const lines = normalize(body).split("\n");
  const firstMeaningful = lines.find((entry) => entry.trim().length > 0)?.trim() ?? "";
  for (const line of lines.slice(0, 40)) {
    const match = /^--([A-Za-z0-9'()+_,./:=?-]{6,200})\s*$/.exec(line.trim());
    const token = match?.[1];
    if (!token || token.endsWith("--")) continue;
    const marker = `--${token}`;
    const occurrences = lines.filter((entry) => entry.trim().startsWith(marker)).length;
    if (occurrences >= 2 || firstMeaningful === marker) return token;
  }
  return null;
}


function splitPartHeaders(section: string): { headers: Record<string, string>; body: string } {
  const text = normalize(section).replace(/^\n+/, "");
  const at = text.indexOf("\n\n");
  const headerBlock = at === -1 ? text : text.slice(0, at);
  const body = at === -1 ? "" : text.slice(at + 2);

  const headers: Record<string, string> = {};
  let lastName: string | null = null;
  for (const line of headerBlock.split("\n")) {
    if (/^[ \t]/.test(line) && lastName) {
      headers[lastName] = `${headers[lastName]} ${line.trim()}`;
      continue;
    }
    const idx = line.indexOf(":");
    if (idx <= 0) {
      // Not a header block at all (a bare text body): treat everything as body.
      return { headers: {}, body: text };
    }
    lastName = line.slice(0, idx).trim().toLowerCase();
    headers[lastName] = line.slice(idx + 1).trim();
  }
  return { headers, body };
}

function decodePart(body: string, encoding: string | undefined): string {
  const enc = (encoding ?? "").toLowerCase();
  if (enc.includes("base64")) return decodeBase64(body);
  if (enc.includes("quoted-printable")) return decodeQuotedPrintable(body);
  // No declared encoding: quoted-printable is still the most common thing to
  // find here, and its markers (soft line breaks, =XX escapes) are unambiguous
  // enough that decoding only ever improves the text.
  const softBreaks = (body.match(/=\n/g) ?? []).length;
  const escapes = (body.match(/=[0-9A-F]{2}/g) ?? []).length;
  if (softBreaks + escapes >= 2) return decodeQuotedPrintable(body);
  return body;
}

/**
 * Removes CSS rule blocks (`selector { ... }`, including `@media` wrappers) that
 * survived tag stripping. Marketing mail often arrives with its `<style>` block
 * broken up — a chunked-transfer length marker or a truncated fetch can split the
 * opening/closing tag — and without this the whole stylesheet used to be shown as
 * the message text.
 */
function stripCssBlocks(value: string): string {
  let out = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = out
      // @media / @supports wrappers with nested rules
      .replace(/@[a-z-]+[^{}]{0,200}\{(?:[^{}]*\{[^{}]*\}\s*)*[^{}]*\}/gi, "\n")
      // plain `selector { prop: value; }` blocks
      .replace(/(^|\n)[ \t]*[^{}\n;:]{0,200}\{[^{}]*:[^{}]*\}/g, "\n");
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Very small HTML→text pass, used only when there is no text/plain part. */
export function htmlBodyToText(html: string): string {
  const withoutStyles = html
    // Closed blocks first, then any unterminated one (broken or truncated mail).
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, "")
    .replace(/<title\b[\s\S]*?<\/title\s*>/gi, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<![^>]*>/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*$/gi, "")
    .replace(/<script[\s\S]*$/gi, "");

  return stripCssBlocks(
    withoutStyles
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function walk(section: string, contentTypeHint: string | null, out: InboundBody, depth: number) {
  if (depth > MAX_DEPTH) return;

  const parsed = splitPartHeaders(section);
  const contentType = parsed.headers["content-type"] ?? contentTypeHint ?? "";
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  const disposition = (parsed.headers["content-disposition"] ?? "").toLowerCase();
  const encoding = parsed.headers["content-transfer-encoding"];

  const boundary =
    (type.startsWith("multipart/") ? boundaryOf(contentType) : null) ??
    (depth === 0 && !type ? sniffBoundary(parsed.body || section) : null);

  if (boundary) {
    const source = parsed.headers["content-type"] || contentTypeHint ? parsed.body : section;
    const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const splitter = new RegExp(`\\n?--${escaped}(?:--)?[ \\t]*\\n?`);
    const normalized = normalize(source);
    // Anything before the first boundary is MIME preamble ("This is a
    // multi-part message in MIME format."), never message text.
    const firstMarker = normalized.search(new RegExp(`(^|\\n)--${escaped}[ \\t]*(\\n|$)`));
    const pieces = (firstMarker > 0 ? normalized.slice(firstMarker) : normalized).split(splitter);
    for (const piece of pieces) {
      if (!piece || !piece.trim()) continue;
      walk(piece, null, out, depth + 1);
    }
    return;
  }


  // Real attachments are never message text.
  if (disposition.startsWith("attachment")) return;

  const decoded = decodePart(parsed.body || (parsed.headers["content-type"] ? "" : section), encoding).trim();
  if (!decoded) return;
  if (type === "text/html" || (!type && /<html|<body|<div|<p[ >]/i.test(decoded))) {
    if (!out.html) out.html = decoded;
    return;
  }
  if (!out.text) out.text = decoded;
}

/**
 * Turns a raw inbound body (optionally with its Content-Type /
 * Content-Transfer-Encoding headers, when the fetch provided them) into clean
 * text plus the HTML alternative when one exists. Boundary lines and part
 * headers never survive this step.
 */
export function extractInboundBody(
  raw: string | null | undefined,
  headers?: { contentType?: string | null; contentTransferEncoding?: string | null },
): InboundBody {
  if (!raw || !raw.trim()) return { text: null, html: null };

  const out: InboundBody = { text: null, html: null };
  const contentType = headers?.contentType?.trim() || null;
  const encoding = headers?.contentTransferEncoding?.trim() || null;

  // Rebuild a tiny header block so one code path handles both cases: a body we
  // know the type of, and a bare body we have to sniff.
  if (contentType || encoding) {
    const block = [
      ...(contentType ? [`Content-Type: ${contentType}`] : []),
      ...(encoding ? [`Content-Transfer-Encoding: ${encoding}`] : []),
    ].join("\n");
    walk(`${block}\n\n${normalize(raw)}`, null, out, 0);
  } else {
    walk(normalize(raw), null, out, 0);
  }

  if (!out.text && out.html) {
    const asText = htmlBodyToText(out.html);
    if (asText) out.text = asText;
  }
  return out;
}

/** Share of characters that are ordinary readable text. */
function printableRatio(value: string): number {
  if (!value) return 0;
  // eslint-disable-next-line no-control-regex
  const control = (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  return 1 - control / value.length;
}

/**
 * A body that is nothing but a base64 blob — the shape a client produces for a
 * single-part message with `Content-Transfer-Encoding: base64`. There are no
 * boundaries or part headers to recognise, so the encoding itself is the signal:
 * base64 alphabet only, long enough not to be a short sentence, and it must
 * decode to readable text.
 */
function base64OnlyBody(value: string): string | null {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 32) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  if (compact.length % 4 !== 0) return null;
  // Plain prose almost never satisfies the above, but a single lowercase word
  // could; requiring some mixed case or padding keeps false positives away.
  if (!/[A-Z]/.test(compact) && !/[0-9+/=]/.test(compact)) return null;
  try {
    const decoded = decodeBase64(compact);
    if (!decoded.trim() || printableRatio(decoded) < 0.9) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * The single decode step for message text, applied once at ingestion so every
 * later consumer — Unified Inbox, notification emails, webhooks, automations,
 * the campaign reply log — reads the same already-clean text and never re-parses
 * anything itself.
 *
 * It handles: full raw MIME (boundary + part headers), a body whose Content-Type
 * / Content-Transfer-Encoding headers came with it, a bare base64 body, and
 * quoted-printable. Ordinary text is returned untouched.
 */
export function cleanInboundText(
  value: string | null | undefined,
  headers?: { contentType?: string | null; contentTransferEncoding?: string | null },
): string | null {
  if (!value || !value.trim()) return null;

  const contentType = headers?.contentType?.trim() || null;
  const encoding = headers?.contentTransferEncoding?.trim() || null;
  if (contentType || encoding) {
    const parsed = extractInboundBody(value, { contentType, contentTransferEncoding: encoding });
    if (parsed.text) return parsed.text;
  }

  const looksRawMime =
    /^--[A-Za-z0-9'()+_,./:=?-]{6,}\s*$/m.test(value) && /^content-type:/im.test(value);
  if (looksRawMime) {
    const parsed = extractInboundBody(value);
    if (parsed.text) return parsed.text;
  }

  const base64 = base64OnlyBody(value);
  if (base64) return base64;

  // Quoted-printable escapes leaking into the text: unambiguous enough that
  // decoding can only improve it.
  const softBreaks = (value.match(/=\n/g) ?? []).length;
  const escapes = (value.match(/=[0-9A-F]{2}/g) ?? []).length;
  const decoded = softBreaks + escapes >= 2 ? decodeQuotedPrintable(value) : value;

  // An HTML body (or the leftovers of a broken one) must never be shown as the
  // message text: markup and stylesheets are not something a person wrote.
  if (/<\/?(html|body|head|table|div|p|style|br)\b/i.test(decoded) || /\{[^{}]*:[^{}]*\}/.test(decoded)) {
    const asText = htmlBodyToText(decoded);
    return asText || null;
  }

  return decoded;
}

