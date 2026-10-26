/**
 * First-party click tracking.
 *
 * Sibling of `open-tracking.ts`, built exactly the same way: a signed,
 * per-message, per-link token; one shared rewriting step used by every send
 * path (campaign dispatch, Unified Inbox reply, Compose); one endpoint that
 * records the click and forwards the reader to the real destination.
 *
 * Deliberately NOT touched here: the unsubscribe link (it is its own signed
 * link with its own recorded event and must never be wrapped), the open pixel,
 * and anything about reply/bounce handling.
 */
import {
  clickRatePercent as sharedClickRate,
  type ReachableBase,
} from "@/lib/engagement-rates";
import { createHmac, timingSafeEqual } from "crypto";

import { OPEN_PIXEL_PATH } from "@/lib/open-tracking";
import { SITE_URL } from "@/lib/seo";
import { signingKey, verificationKeys } from "@/lib/tracking-signing-keys";
import { UNSUBSCRIBE_PATH } from "@/lib/unsubscribe";

export const CLICK_PATH = "/api/public/click";

export type ClickTrackingMessageKind = "campaign" | "conversation";

export type ClickTrackingTarget = {
  workspaceId: string;
  messageKind: ClickTrackingMessageKind;
  /** `campaign_messages.id` or `conversation_messages.id`. */
  messageId: string;
  campaignId?: string | null;
  leadId?: string | null;
  email?: string | null;
};

export type ClickTrackingHit = ClickTrackingTarget & { url: string };

/**
 * Private server-side signing keys, in the same order the previous code used
 * (so already-sent links signed with a private key keep verifying). The public
 * publishable key and the hardcoded literal that used to follow are gone: with
 * no private key, links are not wrapped and every token is rejected.
 * `SB_SERVICE_ROLE_KEY` is only consulted last. Never logged.
 */
const CLICK_SIGNING_SECRET_ENV = [
  "CLICK_TRACKING_SECRET",
  "OPEN_TRACKING_SECRET",
  "UNSUBSCRIBE_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SB_SERVICE_ROLE_KEY",
] as const;
function secret(): string | null {
  return signingKey(CLICK_SIGNING_SECRET_ENV);
}

/** True when a private signing key is configured. Never reveals which or its value. */
export function hasClickTrackingSecret(): boolean {
  return secret() !== null;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

/** Empty string when no private key is configured; an empty signature never verifies. */
export function signClickPayload(payload: string): string {
  const key = secret();
  if (!key) return "";
  return createHmac("sha256", key).update(payload).digest("hex").slice(0, 32);
}

/** `<base64url payload>.<32 hex HMAC>` and nothing else. */
const CLICK_TOKEN_PATTERN = /^([A-Za-z0-9_-]{1,16384})\.([0-9a-f]{32})$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/** Opaque, tamper-proof token: `<base64url(json)>.<hmac>`. */
export function buildClickToken(target: ClickTrackingTarget, url: string): string {
  const payload = base64url(
    JSON.stringify({
      w: target.workspaceId,
      k: target.messageKind === "conversation" ? "v" : "c",
      m: target.messageId,
      p: target.campaignId ?? null,
      l: target.leadId ?? null,
      e: target.email ? target.email.trim().toLowerCase() : null,
      u: url,
    }),
  );
  return `${payload}.${signClickPayload(payload)}`;
}

export function parseClickToken(token: string): ClickTrackingHit | null {
  if (typeof token !== "string") return null;
  const match = CLICK_TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const payload = match[1]!;
  const signature = match[2]!;
  // No private key: fail closed. Otherwise accept the current key or the exact
  // key the previous release signed with, so already-sent tokens still verify.
  const a = Buffer.from(signature);
  const verified = verificationKeys(CLICK_SIGNING_SECRET_ENV).some((key) => {
    const b = Buffer.from(
      createHmac("sha256", key).update(payload).digest("hex").slice(0, 32),
    );
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!verified) return null;
  try {
    const parsed = JSON.parse(fromBase64url(payload)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const raw = parsed as Record<string, unknown>;
    const workspaceId = typeof raw["w"] === "string" ? raw["w"] : "";
    const messageId = typeof raw["m"] === "string" ? raw["m"] : "";
    const url = typeof raw["u"] === "string" ? raw["u"] : "";
    if (!ID_PATTERN.test(workspaceId) || !ID_PATTERN.test(messageId)) return null;
    if (!isTrackableDestination(url)) return null;
    let messageKind: ClickTrackingMessageKind;
    if (raw["k"] === "c") messageKind = "campaign";
    else if (raw["k"] === "v") messageKind = "conversation";
    else return null;
    return {
      workspaceId,
      messageKind,
      messageId,
      campaignId: typeof raw["p"] === "string" ? raw["p"] : null,
      leadId: typeof raw["l"] === "string" ? raw["l"] : null,
      email: typeof raw["e"] === "string" ? raw["e"] : null,
      url,
    };
  } catch {
    return null;
  }
}

/** Same host as the open pixel, so one tracking domain covers both. */
export function clickTrackingBaseUrl(): string {
  const configured =
    process.env["OPEN_TRACKING_BASE_URL"] || process.env["TRACKING_BASE_URL"] || "";
  const base = configured.trim() || SITE_URL;
  return base.replace(/\/+$/, "");
}

/** Only real, absolute web links are ever wrapped. */
export function isTrackableDestination(url: string): boolean {
  const value = (url ?? "").trim();
  if (!/^https?:\/\//i.test(value)) return false;
  if (value.includes("{{") || value.includes("[")) return false;
  if (value.includes(UNSUBSCRIBE_PATH)) return false;
  if (value.includes(OPEN_PIXEL_PATH)) return false;
  if (value.includes(CLICK_PATH)) return false;
  return true;
}

export function clickUrl(target: ClickTrackingTarget, destination: string): string {
  if (!target.workspaceId || !target.messageId) return destination;
  if (!isTrackableDestination(destination)) return destination;
  // No private key: leave the real link untouched rather than mint a token
  // nobody can verify.
  if (!hasClickTrackingSecret()) return destination;
  return `${clickTrackingBaseUrl()}${CLICK_PATH}?t=${encodeURIComponent(buildClickToken(target, destination))}`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function encodeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Shared rewriting step: every `href` pointing at a real web page becomes a
 * tracked link for THIS message. Unsubscribe links, the open pixel, mailto/tel
 * links, anchors and unresolved placeholders are left exactly as they are.
 *
 * Returns the HTML untouched when there is no HTML body — a plain-text email is
 * never converted to HTML just to carry tracking.
 */
export function rewriteLinksForClickTracking(
  html: string | null | undefined,
  target: ClickTrackingTarget,
): string | null {
  if (!html) return html ?? null;
  return html.replace(
    /href\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (whole: string, _quoted: string, dq?: string, sq?: string) => {
      const raw = dq ?? sq ?? "";
      const destination = decodeEntities(raw).trim();
      if (!isTrackableDestination(destination)) return whole;
      return `href="${encodeAttribute(clickUrl(target, destination))}"`;
    },
  );
}

/**
 * Click rate. Re-exported from the one shared engagement-rate module, so every
 * surface divides unique clickers by the same reachable base.
 */
export function clickRatePercent(
  uniqueClicks: number,
  base: ReachableBase | number,
): number {
  // The shared helper is people-based: a bare send count is the people base
  // for single-step scopes, where one email = one person.
  const people = typeof base === "number" ? base : { contacted: base.sent, bounced: base.bounced };
  return sharedClickRate(uniqueClicks, people);
}
