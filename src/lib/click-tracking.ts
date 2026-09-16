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

function secret(): string {
  return (
    process.env["CLICK_TRACKING_SECRET"] ||
    process.env["OPEN_TRACKING_SECRET"] ||
    process.env["UNSUBSCRIBE_SECRET"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    "munchreach-click-tracking"
  );
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signClickPayload(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
}

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
  const [payload, signature] = (token ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = signClickPayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const raw = JSON.parse(fromBase64url(payload)) as Record<string, unknown>;
    const workspaceId = typeof raw["w"] === "string" ? raw["w"] : "";
    const messageId = typeof raw["m"] === "string" ? raw["m"] : "";
    const url = typeof raw["u"] === "string" ? raw["u"] : "";
    if (!workspaceId || !messageId || !isTrackableDestination(url)) return null;
    return {
      workspaceId,
      messageKind: raw["k"] === "v" ? "conversation" : "campaign",
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
  return sharedClickRate(uniqueClicks, typeof base === "number" ? { sent: base } : base);
}
