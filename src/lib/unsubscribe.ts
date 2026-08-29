/**
 * Campaign unsubscribe links.
 *
 * The sequence editor already writes the existing `{{unsubscribe_link}}` token
 * (see SYSTEM_VARIABLES in campaign-model). This module is the single place
 * that turns that token into a real, signed, per-recipient URL, and the place
 * that repairs older messages whose token was rendered to an empty string
 * before the link existed.
 *
 * Nothing here touches scheduling, providers or limits.
 */
import { createHmac, timingSafeEqual } from "crypto";

import { SITE_URL } from "@/lib/seo";

/** The token the sequence editor inserts. Never invent a second one. */
export const UNSUBSCRIBE_TOKEN = "unsubscribe_link";

export const UNSUBSCRIBE_PATH = "/api/public/unsubscribe";

export type UnsubscribeTarget = {
  workspaceId: string;
  campaignId: string;
  email: string;
  recipientId?: string | null;
};

function secret(): string {
  return (
    process.env["UNSUBSCRIBE_SECRET"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    "munchreach-unsubscribe"
  );
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signUnsubscribePayload(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
}

/** Opaque, tamper-proof token: `<base64url(json)>.<hmac>`. */
export function buildUnsubscribeToken(target: UnsubscribeTarget): string {
  const payload = base64url(
    JSON.stringify({
      w: target.workspaceId,
      c: target.campaignId,
      e: target.email.trim().toLowerCase(),
      r: target.recipientId ?? null,
    }),
  );
  return `${payload}.${signUnsubscribePayload(payload)}`;
}

export function parseUnsubscribeToken(token: string): UnsubscribeTarget | null {
  const [payload, signature] = (token ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = signUnsubscribePayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const raw = JSON.parse(fromBase64url(payload)) as Record<string, unknown>;
    const workspaceId = typeof raw["w"] === "string" ? raw["w"] : "";
    const campaignId = typeof raw["c"] === "string" ? raw["c"] : "";
    const email = typeof raw["e"] === "string" ? raw["e"] : "";
    if (!workspaceId || !campaignId || !email) return null;
    return {
      workspaceId,
      campaignId,
      email,
      recipientId: typeof raw["r"] === "string" ? raw["r"] : null,
    };
  } catch {
    return null;
  }
}

/** The absolute, recipient-unique unsubscribe URL that ships in the email. */
export function unsubscribeUrl(target: UnsubscribeTarget): string {
  if (!target.workspaceId || !target.campaignId || !target.email) return "";
  return `${SITE_URL}${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(buildUnsubscribeToken(target))}`;
}

/**
 * Where an unsubscribe came from.
 *
 * `list_unsubscribe` is the mail-client header link (RFC 2369), `one_click` is
 * the RFC 8058 POST the client sends without asking the reader anything, and
 * `email_link` is the link inside the email body. Attribution is carried by a
 * short `s` query parameter on the header URL; the body link stays unmarked so
 * older messages already in flight keep working and default to `email_link`.
 */
export type UnsubscribeSource = "one_click" | "list_unsubscribe" | "email_link";

const SOURCE_CODES: Record<string, UnsubscribeSource> = {
  h: "list_unsubscribe",
  o: "one_click",
  b: "email_link",
};

/** Tags a URL with its placement so the click can be attributed later. */
export function withUnsubscribeSource(url: string, source: UnsubscribeSource): string {
  if (!url) return url;
  const code = source === "list_unsubscribe" ? "h" : source === "one_click" ? "o" : "b";
  return `${url}&s=${code}`;
}

/** Resolves the recorded source from the request shape. */
export function resolveUnsubscribeSource(args: {
  method: string;
  sourceParam?: string | null;
  body?: string | null;
}): UnsubscribeSource {
  // RFC 8058: the client POSTs `List-Unsubscribe=One-Click` with no user click
  // beyond confirming in their mail app — that is one-click, whatever the tag.
  if (args.method.toUpperCase() === "POST") return "one_click";
  const tagged = SOURCE_CODES[(args.sourceParam ?? "").toLowerCase()];
  return tagged ?? "email_link";
}


/** Extras entry so `renderEmailForLead` resolves `{{unsubscribe_link}}`. */
export function unsubscribeExtras(target: UnsubscribeTarget): Record<string, string> {
  const url = unsubscribeUrl(target);
  return url ? { [UNSUBSCRIBE_TOKEN]: url } : {};
}

const EMPTY_FOOTER_RE = /^([ \t>*-]*)(unsubscribe|opt[- ]?out)\s*[:\-–]?\s*$/gim;

/**
 * Send-time repair for bodies stored before the link resolved.
 *
 * - an unresolved `{{unsubscribe_link}}` token becomes the URL
 * - a dangling "Unsubscribe:" line (the reported bug) gets the URL appended
 *
 * Bodies that already contain the URL are returned untouched.
 */
export function applyUnsubscribeUrl(body: string, url: string): string {
  if (!body || !url) return body ?? "";
  let out = body.replace(
    /\{\{\s*(?:unsubscribe_link|unsubscribe_url|unsubscribe)\s*(?:\|[^}]*)?\}\}/gi,
    url,
  );
  if (out.includes(url)) return out;
  out = out.replace(EMPTY_FOOTER_RE, (_m, prefix: string) => `${prefix}Unsubscribe: ${url}`);
  return out;
}

/** True when the rendered body carries a usable unsubscribe URL. */
export function hasUnsubscribeUrl(body: string, url: string): boolean {
  return Boolean(url) && (body ?? "").includes(url);
}
