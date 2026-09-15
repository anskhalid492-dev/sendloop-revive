/**
 * Inbound email body presentation helpers.
 *
 * Two jobs, both pure and shared by the inbox list preview and the full
 * thread view:
 *  - decode HTML entities that survive text extraction (`&nbsp;`, `&lt;`, …)
 *  - split a reply into the newly typed part, an optional mobile signature,
 *    and the quoted original history ("On … wrote:", "> …", etc.)
 *
 * Nothing here mutates stored data; ingestion keeps the full original body.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  shy: "",
  zwnj: "",
  zwj: "",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "\u2018",
  rsquo: "\u2019",
  sbquo: "\u201a",
  ldquo: "\u201c",
  rdquo: "\u201d",
  bdquo: "\u201e",
  bull: "•",
  middot: "·",
  laquo: "«",
  raquo: "»",
  trade: "™",
  reg: "®",
  copy: "©",
  deg: "°",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  dagger: "†",
  Dagger: "‡",
  permil: "‰",
  prime: "′",
  Prime: "″",
  times: "×",
  divide: "÷",
  plusmn: "±",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sup2: "²",
  sup3: "³",
  micro: "µ",
  szlig: "ß",
  agrave: "à",
  aacute: "á",
  eacute: "é",
  egrave: "è",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  ccedil: "ç",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
};

/** Decode numeric and common named HTML entities in extracted text. */
export function decodeHtmlEntities(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body];
    return named === undefined ? match : named;
  });
}

/**
 * Markers that begin quoted history. `On … wrote:` is matched inline too,
 * because Apple Mail replies often arrive as one unbroken line.
 */
const QUOTE_MARKERS: RegExp[] = [
  /^\s*>/m,
  /\bOn\b[^\n]{0,300}?\bwrote\s*:/i,
  /\bLe\b[^\n]{0,300}?\ba écrit\s*:/i,
  /\bAm\b[^\n]{0,300}?\bschrieb\s*:/i,
  /-{2,}\s*original message\s*-{2,}/i,
  /-{2,}\s*forwarded message\s*-{2,}/i,
  /\bbegin forwarded message\s*:/i,
  /^\s*_{5,}\s*$/m,
  /^\s*-{5,}\s*$/m,
  /^\s*from\s*:\s*\S+.*$/im,
  /^\s*(sent|date)\s*:\s*\S+.*\n\s*to\s*:/im,
];

const SIGNATURE_PATTERNS: RegExp[] = [
  /\bsent from my [^\n.]{0,40}/i,
  /\bsent from (mail|outlook|yahoo mail|proton mail)[^\n]{0,40}/i,
  /\bget outlook for (ios|android)\b/i,
  /\bsent via [^\n.]{0,40}/i,
];

export type SplitReply = {
  /** The newly typed reply text. */
  reply: string;
  /** Trailing mobile/client signature line, if one was detected. */
  signature: string;
  /** Quoted original history, verbatim (minus decoding). */
  quoted: string;
};

/**
 * Split a message body into the new reply, its signature, and quoted history.
 * HTML entities are decoded in every part.
 */
export function splitReplyBody(body: string | null | undefined): SplitReply {
  const text = decodeHtmlEntities(body ?? "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return { reply: "", signature: "", quoted: "" };

  let cut = text.length;
  for (const pattern of QUOTE_MARKERS) {
    const match = pattern.exec(text);
    if (match && match.index < cut) cut = match.index;
  }

  let reply = text.slice(0, cut).replace(/\s+$/, "");
  const quoted = text.slice(cut).trim();

  let signature = "";
  for (const pattern of SIGNATURE_PATTERNS) {
    const match = pattern.exec(reply);
    if (match && match.index >= 0) {
      signature = match[0].trim();
      reply = (reply.slice(0, match.index) + reply.slice(match.index + match[0].length)).trim();
      break;
    }
  }

  // Everything the sender typed was above a marker we cut at too aggressively
  // (e.g. a reply that is only a signature); keep something visible.
  if (!reply && !signature && quoted) return { reply: "", signature: "", quoted };

  return { reply: reply.trim(), signature, quoted };
}

/** One-line preview: new reply text only, entities decoded, quotes removed. */
export function replyPreview(body: string | null | undefined, max = 180): string {
  const { reply, signature, quoted } = splitReplyBody(body);
  const source = reply || signature || quoted;
  return source
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
