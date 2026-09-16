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
 */
function sniffBoundary(body: string): string | null {
  const lines = normalize(body).split("\n");
  for (const line of lines.slice(0, 40)) {
    const match = /^--([A-Za-z0-9'()+_,./:=?-]{6,200})\s*$/.exec(line.trim());
    const token = match?.[1];
    if (!token || token.endsWith("--")) continue;
    const marker = `--${token}`;
    const occurrences = lines.filter((entry) => entry.trim().startsWith(marker)).length;
    if (occurrences >= 2) return token;
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

/** Very small HTML→text pass, used only when there is no text/plain part. */
export function htmlBodyToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
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
    const pieces = normalize(source).split(new RegExp(`\\n?--${escaped}(?:--)?[ \\t]*\\n?`));
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

/**
 * Safety net for text that has already been extracted by a provider: leaves
 * ordinary message text exactly as-is, and only re-parses when the value still
 * looks like raw MIME (a boundary marker plus part headers).
 */
export function cleanInboundText(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const looksRawMime =
    /^--[A-Za-z0-9'()+_,./:=?-]{6,}\s*$/m.test(value) && /^content-type:/im.test(value);
  if (!looksRawMime) return value;
  const parsed = extractInboundBody(value);
  return parsed.text ?? value;
}
