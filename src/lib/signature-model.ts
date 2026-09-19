/**
 * Mailbox email signatures — the ONE shared composition layer.
 *
 * Pure and side-effect free, so campaign dispatch, Unified Inbox replies,
 * Compose, test sends and the Settings preview all produce byte-for-byte the
 * same signature.
 *
 * Design rules:
 *  - the stored campaign/sequence body is NEVER rewritten to carry a signature;
 *    the signature is applied while composing the final message, so a retry,
 *    a deferral or a requeue rebuilds it once and never stacks it,
 *  - sender tokens are resolved from the sending mailbox server-side,
 *  - HTML is sanitized to a small, email-client friendly allow-list,
 *  - every signature also has a readable plain-text form.
 */

export const SENDER_SIGNATURE_TOKEN = "sender_signature";

/** Survives HTML escaping, so it can be planted before the body is rendered. */
export const SIGNATURE_SENTINEL = "[[MUNCHREACH_SIGNATURE]]";

/** Marks the rendered signature block, used for duplicate protection. */
export const SIGNATURE_HTML_MARKER = "data-munchreach-signature";

export type SignatureSenderFields = {
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  job_title: string;
  phone: string;
  website: string;
};

export const SIGNATURE_SENDER_TOKENS: Array<keyof SignatureSenderFields> = [
  "first_name",
  "last_name",
  "email",
  "company",
  "job_title",
  "phone",
  "website",
];

/** Clearly-labelled example values for previews when no mailbox data exists. */
export const PREVIEW_SENDER_FIELDS: SignatureSenderFields = {
  first_name: "Anas",
  last_name: "Khalid",
  email: "anas@munchreach.com",
  company: "MunchReach",
  job_title: "Founder",
  phone: "+1 555 010 2030",
  website: "https://munchreach.com",
};

export const PREVIEW_DISCLAIMER =
  "Preview values are examples. Actual values are taken from the sending mailbox when the email is sent.";

export type SignatureRow = {
  id?: string;
  workspace_id?: string;
  mailbox_id?: string;
  name?: string | null;
  html_signature?: string | null;
  plain_text_signature?: string | null;
  enabled?: boolean | null;
  sender_fields?: Partial<SignatureSenderFields> | null;
};

export type RenderedSignature = { html: string; text: string };

export function emptySenderFields(): SignatureSenderFields {
  return {
    first_name: "",
    last_name: "",
    email: "",
    company: "",
    job_title: "",
    phone: "",
    website: "",
  };
}

export function senderFieldsFrom(
  partial: Partial<SignatureSenderFields> | null | undefined,
): SignatureSenderFields {
  const base = emptySenderFields();
  for (const token of SIGNATURE_SENDER_TOKENS) {
    const value = partial?.[token];
    base[token] = typeof value === "string" ? value.trim() : "";
  }
  return base;
}

/* --------------------------------- tokens --------------------------------- */

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?))?\s*\}\}/g;

/**
 * Resolve sender tokens inside a signature. An unknown or empty value falls
 * back to the inline default (`{{phone | }}`) and otherwise disappears — a raw
 * token can never reach a recipient.
 */
export function resolveSignatureTokens(
  value: string,
  fields: Partial<SignatureSenderFields>,
): string {
  return (value ?? "").replace(TOKEN_RE, (_match, rawToken: string, fallback?: string) => {
    const token = rawToken.toLowerCase() as keyof SignatureSenderFields;
    const resolved = (fields[token] ?? "").toString().trim();
    if (resolved) return resolved;
    return (fallback ?? "").trim();
  });
}

/* ------------------------------- sanitizing ------------------------------- */

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "span",
  "div",
  "p",
  "br",
  "hr",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "small",
  "font",
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);

const ALLOWED_ATTRS = new Set([
  "href",
  "src",
  "alt",
  "title",
  "width",
  "height",
  "style",
  "align",
  "valign",
  "target",
  "rel",
  "border",
  "cellpadding",
  "cellspacing",
  "color",
  "size",
  "face",
  "colspan",
  "rowspan",
]);

/** Blocks whose *contents* must go too, not just the tag. */
const STRIPPED_BLOCKS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "svg",
  "math",
  "link",
  "meta",
  "base",
  "noscript",
  "template",
];

function safeUrl(raw: string, kind: "href" | "src"): string | null {
  const value = raw.trim().replace(/[\u0000-\u001f]/g, "");
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:")) return null;
  if (lower.startsWith("data:")) return null;
  if (kind === "href") {
    if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
    if (value.startsWith("/")) return value;
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(value)) return `https://${value}`;
    return null;
  }
  if (/^https:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return value;
  return null;
}

function safeStyle(raw: string): string | null {
  const cleaned = raw
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      if (!part || !part.includes(":")) return false;
      const lower = part.toLowerCase();
      if (lower.includes("expression") || lower.includes("javascript:") || lower.includes("url(")) {
        return false;
      }
      if (lower.startsWith("position") || lower.startsWith("behavior")) return false;
      return true;
    })
    .join("; ");
  return cleaned || null;
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function sanitizeAttributes(tag: string, rawAttrs: string): string {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(rawAttrs))) {
    const name = (match[1] ?? "").toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (!ALLOWED_ATTRS.has(name)) continue;
    if (name === "href") {
      const url = safeUrl(value, "href");
      if (url) out.push(`href="${escapeAttribute(url)}"`);
      continue;
    }
    if (name === "src") {
      const url = safeUrl(value, "src");
      if (url) out.push(`src="${escapeAttribute(url)}"`);
      continue;
    }
    if (name === "style") {
      const style = safeStyle(value);
      if (style) out.push(`style="${escapeAttribute(style)}"`);
      continue;
    }
    out.push(`${name}="${escapeAttribute(value)}"`);
  }
  if (tag === "a") {
    if (!out.some((a) => a.startsWith("target="))) out.push('target="_blank"');
    if (!out.some((a) => a.startsWith("rel="))) out.push('rel="noopener noreferrer"');
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sanitize signature HTML down to an email-client safe allow-list. Scripts,
 * styles, iframes, event handlers and unsafe URLs are removed; unknown tags are
 * unwrapped so their text survives.
 */
export function sanitizeSignatureHtml(input: string | null | undefined): string {
  let html = (input ?? "").toString();
  if (!html.trim()) return "";

  // Comments and whole dangerous blocks (content included).
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const block of STRIPPED_BLOCKS) {
    html = html.replace(new RegExp(`<${block}\\b[\\s\\S]*?<\\/${block}\\s*>`, "gi"), "");
    html = html.replace(new RegExp(`<${block}\\b[^>]*\\/?>`, "gi"), "");
  }

  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (
    _match,
    rawTag: string,
    rawAttrs: string,
  ) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const closing = _match.startsWith("</");
    if (closing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
    const attrs = sanitizeAttributes(tag, rawAttrs ?? "");
    return VOID_TAGS.has(tag) ? `<${tag}${attrs}>` : `<${tag}${attrs}>`;
  });

  // Anything that still looks like a tag was malformed — drop the bracket.
  html = html.replace(/<(?![/a-zA-Z])/g, "&lt;");
  return html.trim();
}

/* ------------------------------- plain text ------------------------------- */

const TEXT_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

/**
 * Readable plain-text equivalent of a signature: block tags become line breaks
 * and links keep their destination, so no information is lost in the text part.
 */
export function signatureHtmlToText(html: string | null | undefined): string {
  let text = (html ?? "").toString();
  if (!text.trim()) return "";

  text = text.replace(/<!--[\s\S]*?-->/g, "");
  for (const block of STRIPPED_BLOCKS) {
    text = text.replace(new RegExp(`<${block}\\b[\\s\\S]*?<\\/${block}\\s*>`, "gi"), "");
  }
  text = text.replace(/<img\b[^>]*alt\s*=\s*"([^"]*)"[^>]*>/gi, (_m, alt: string) => alt.trim());
  text = text.replace(/<img\b[^>]*>/gi, "");
  text = text.replace(
    /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, _q, dq: string | undefined, sq: string | undefined, label: string) => {
      const href = (dq ?? sq ?? "").trim();
      const text_ = label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!href) return text_;
      const bare = href.replace(/^mailto:|^tel:/i, "");
      if (!text_) return bare;
      if (text_.toLowerCase() === bare.toLowerCase()) return text_;
      return `${text_} (${bare})`;
    },
  );
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|tr|li|h1|h2|h3|h4|table)\s*>/gi, "\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n---\n");
  text = text.replace(/<\/t[dh]\s*>/gi, " ");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z#][a-zA-Z0-9#]{1,31});/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (/^#\d+$/.test(body)) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return TEXT_ENTITIES[body.toLowerCase()] ?? match;
  });

  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -------------------------------- rendering ------------------------------- */

/**
 * Final signature for one send: tokens resolved from the real sending mailbox,
 * HTML sanitized, plain-text fallback derived when none was stored.
 *
 * Returns null when there is nothing to append (no signature, disabled, or the
 * signature renders empty) — the email then goes out unchanged.
 */
export function renderSignature(
  row: SignatureRow | null | undefined,
  fields: Partial<SignatureSenderFields>,
): RenderedSignature | null {
  if (!row) return null;
  if (row.enabled === false) return null;

  const html = sanitizeSignatureHtml(resolveSignatureTokens(row.html_signature ?? "", fields));
  const storedText = resolveSignatureTokens(row.plain_text_signature ?? "", fields).trim();
  const text = storedText || signatureHtmlToText(html);

  if (!html.trim() && !text.trim()) return null;
  return {
    html: html.trim() || escapeHtmlText(text),
    text: text.trim() || signatureHtmlToText(html),
  };
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .join("<br>");
}

/** The signature block as it appears in an outgoing HTML email. */
export function signatureHtmlBlock(html: string): string {
  return `<div ${SIGNATURE_HTML_MARKER}="1" style="margin-top:16px;">${html}</div>`;
}

/* -------------------------------- placement ------------------------------- */

const TOKEN_ANYWHERE = new RegExp(`\\{\\{\\s*${SENDER_SIGNATURE_TOKEN}\\s*(?:\\|[^}]*)?\\}\\}`, "gi");
const FOOTER_LINE = /^\s*(unsubscribe|opt[- ]?out)\s*:/i;

export function bodyUsesSignatureToken(body: string | null | undefined): boolean {
  TOKEN_ANYWHERE.lastIndex = 0;
  return TOKEN_ANYWHERE.test(body ?? "");
}

/**
 * Replace `{{sender_signature}}` with `replacement`, or place `replacement`
 * after the written content but above any trailing unsubscribe footer.
 *
 * Extra occurrences of the token resolve to nothing, so the signature appears
 * exactly once.
 */
function placeInBody(body: string, replacement: string): string {
  const text = (body ?? "").replace(/\r\n?/g, "\n");
  if (bodyUsesSignatureToken(text)) {
    let used = false;
    return text.replace(TOKEN_ANYWHERE, () => {
      if (used) return "";
      used = true;
      return replacement;
    });
  }
  if (!replacement) return text;

  const lines = text.split("\n");
  let footerStart = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    if (FOOTER_LINE.test(line)) {
      footerStart = i;
      continue;
    }
    break;
  }
  if (footerStart >= 0) {
    const head = lines.slice(0, footerStart).join("\n").replace(/\s+$/, "");
    const footer = lines.slice(footerStart).join("\n").replace(/^\s+/, "");
    return `${head}\n\n${replacement}\n\n${footer}`;
  }
  return `${text.replace(/\s+$/, "")}\n\n${replacement}`;
}

/** Strip the token from a body when there is no signature to put there. */
export function clearSignatureToken(body: string | null | undefined): string {
  return placeInBody(body ?? "", "").replace(/\n{3,}/g, "\n\n");
}

/** Final plain-text body with the signature applied exactly once. */
export function applySignatureToText(
  body: string | null | undefined,
  signatureText: string | null | undefined,
): string {
  const text = (body ?? "").replace(/\r\n?/g, "\n");
  const signature = (signatureText ?? "").trim();
  if (!signature) return clearSignatureToken(text);
  // Already applied (a stored draft that carries it, a re-render of the same
  // composed message): never append a second copy.
  if (!bodyUsesSignatureToken(text) && text.includes(signature)) return text;
  return placeInBody(text, signature);
}

/**
 * Body used to build the HTML part: the signature's place is marked with a
 * sentinel that survives HTML escaping and link/open tracking, so the real
 * signature markup is injected afterwards and its links stay untouched.
 */
export function signatureHtmlSource(body: string | null | undefined): string {
  return placeInBody((body ?? "").replace(/\r\n?/g, "\n"), SIGNATURE_SENTINEL);
}

/** Swap the sentinel in a rendered HTML email for the signature block. */
export function injectSignatureHtml(
  html: string | null | undefined,
  signatureHtml: string | null | undefined,
): string | null {
  if (!html) return html ?? null;
  const signature = (signatureHtml ?? "").trim();
  if (html.includes(SIGNATURE_HTML_MARKER)) {
    return html.split(SIGNATURE_SENTINEL).join("");
  }
  if (!signature) return html.split(SIGNATURE_SENTINEL).join("");
  if (!html.includes(SIGNATURE_SENTINEL)) return html;
  let used = false;
  return html
    .split(SIGNATURE_SENTINEL)
    .reduce((acc, part, index) => {
      if (index === 0) return part;
      if (used) return acc + part;
      used = true;
      return acc + signatureHtmlBlock(signature) + part;
    }, "");
}

/**
 * Compose one outgoing email's text and HTML with the signature applied once.
 * `buildHtml` is the caller's existing HTML renderer (campaignBodyHtml) and
 * `decorate` its existing tracking step — both keep running exactly as before.
 */
export function composeWithSignature(args: {
  body: string;
  signature: RenderedSignature | null;
  buildHtml?: (body: string) => string | null;
  decorate?: (html: string | null) => string | null;
}): { text: string; html: string | null } {
  const signature = args.signature;
  const text = applySignatureToText(args.body, signature?.text ?? null);
  if (!args.buildHtml) return { text, html: null };

  const source = signature ? signatureHtmlSource(args.body) : clearSignatureToken(args.body);
  let html = args.buildHtml(source);
  if (args.decorate) html = args.decorate(html);
  html = injectSignatureHtml(html, signature?.html ?? null);
  return { text, html: html ?? null };
}
