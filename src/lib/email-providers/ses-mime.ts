/**
 * Minimal RFC 5322 / MIME reader for Amazon SES inbound notifications.
 *
 * SES receipt rules that publish to SNS include the FULL raw message as a
 * base64 string. This module turns those bytes into the exact fields the
 * existing MunchReach inbound parser already understands: a header list plus
 * the text and HTML bodies.
 *
 * Pure and client-safe: no network, no environment, no provider SDK. It only
 * decodes; it never interprets threading, routing or addresses — that stays in
 * `src/lib/inbound-parse.ts`.
 */

export type MimeHeader = { name: string; value: string };

export type ParsedMime = {
  headers: MimeHeader[];
  text: string | null;
  html: string | null;
};

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

export function decodeBase64(input: string): string {
  const clean = input.replace(/[\r\n\s]/g, "");
  if (!clean) return "";
  try {
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

export function decodeQuotedPrintable(input: string): string {
  const joined = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i += 1) {
    const ch = joined[i]!;
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = ch.charCodeAt(0);
      if (code < 128) bytes.push(code);
      else for (const b of new TextEncoder().encode(ch)) bytes.push(b);
    }
  }
  return new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
}

/** Decodes RFC 2047 encoded-words (`=?utf-8?B?...?=`) inside a header value. */
export function decodeEncodedWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, _charset: string, encoding: string, payload: string) => {
      if (encoding.toLowerCase() === "b") return decodeBase64(payload);
      return decodeQuotedPrintable(payload.replace(/_/g, " "));
    },
  );
}

/* ------------------------------------------------------------------ *
 * Message structure
 * ------------------------------------------------------------------ */

function splitHeaders(section: string): { headers: MimeHeader[]; body: string } {
  const normalized = section.replace(/\r\n/g, "\n");
  const split = normalized.indexOf("\n\n");
  const headerBlock = split === -1 ? normalized : normalized.slice(0, split);
  const body = split === -1 ? "" : normalized.slice(split + 2);

  const headers: MimeHeader[] = [];
  let current: MimeHeader | null = null;
  for (const line of headerBlock.split("\n")) {
    if (/^[ \t]/.test(line) && current) {
      current.value = `${current.value} ${line.trim()}`;
      continue;
    }
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    current = { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    headers.push(current);
  }
  return { headers, body };
}

function headerValue(headers: MimeHeader[], name: string): string {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower)?.value ?? "";
}

function decodeBody(body: string, encoding: string): string {
  const enc = encoding.toLowerCase();
  if (enc.includes("base64")) return decodeBase64(body);
  if (enc.includes("quoted-printable")) return decodeQuotedPrintable(body);
  return body;
}

function boundaryOf(contentType: string): string | null {
  const match = /boundary\s*=\s*("([^"]+)"|([^;\s]+))/i.exec(contentType);
  return match?.[2] ?? match?.[3] ?? null;
}

type Bodies = { text: string | null; html: string | null };

function walk(section: string, out: Bodies, depth = 0): void {
  if (depth > 8) return;
  const { headers, body } = splitHeaders(section);
  const contentType = headerValue(headers, "content-type") || "text/plain";
  const encoding = headerValue(headers, "content-transfer-encoding");
  const disposition = headerValue(headers, "content-disposition").toLowerCase();
  const type = contentType.split(";")[0]!.trim().toLowerCase();

  if (type.startsWith("multipart/")) {
    const boundary = boundaryOf(contentType);
    if (!boundary) return;
    const parts = body.split(new RegExp(`\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(--)?\\n?`));
    for (const part of parts) {
      // `split` with a capture group yields undefined entries for the group.
      if (!part || !part.trim()) continue;
      walk(part, out, depth + 1);
    }
    return;
  }

  if (disposition.startsWith("attachment")) return;

  const decoded = decodeBody(body, encoding).trim();
  if (!decoded) return;
  if (type === "text/html") {
    if (!out.html) out.html = decoded;
  } else if (type === "text/plain") {
    if (!out.text) out.text = decoded;
  }
}

/** Parses a raw RFC 5322 message into headers + text/html bodies. */
export function parseMimeMessage(raw: string): ParsedMime {
  const { headers } = splitHeaders(raw);
  const bodies: Bodies = { text: null, html: null };
  walk(raw, bodies);
  return {
    headers: headers.map((h) => ({ name: h.name, value: decodeEncodedWords(h.value) })),
    text: bodies.text,
    html: bodies.html,
  };
}
