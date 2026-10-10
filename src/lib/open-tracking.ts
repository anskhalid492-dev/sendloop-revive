/**
 * First-party open tracking.
 *
 * Campaign mail now leaves through the customer's own mailbox, so no sending
 * provider inserts an open pixel for us any more. This module is the SINGLE
 * place that
 *
 *   - mints the signed, per-message token,
 *   - builds the absolute pixel URL on the MunchReach tracking host,
 *   - injects the pixel into an HTML body,
 *   - classifies a pixel request (real reader vs. Apple's automatic prefetch),
 *   - and owns the 1x1 transparent GIF the endpoint serves back.
 *
 * Every send path (campaign dispatch, Unified Inbox reply, Compose) calls the
 * same helpers here — deliberately not three implementations.
 *
 * Nothing in here touches clicks, unsubscribe links, or reply/bounce handling.
 */
import { createHmac, timingSafeEqual } from "crypto";

import { SITE_URL } from "@/lib/seo";

export const OPEN_PIXEL_PATH = "/api/public/open";

/** Which table the tracked message lives in. */
export type OpenTrackingMessageKind = "campaign" | "conversation";

export type OpenTrackingTarget = {
  workspaceId: string;
  messageKind: OpenTrackingMessageKind;
  /** `campaign_messages.id` or `conversation_messages.id`. */
  messageId: string;
  campaignId?: string | null;
  leadId?: string | null;
  email?: string | null;
};

function secret(): string {
  return (
    process.env["OPEN_TRACKING_SECRET"] ||
    process.env["UNSUBSCRIBE_SECRET"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    "munchreach-open-tracking"
  );
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signOpenPayload(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
}

/** Opaque, tamper-proof token: `<base64url(json)>.<hmac>`. */
export function buildOpenToken(target: OpenTrackingTarget): string {
  const payload = base64url(
    JSON.stringify({
      w: target.workspaceId,
      k: target.messageKind === "conversation" ? "v" : "c",
      m: target.messageId,
      p: target.campaignId ?? null,
      l: target.leadId ?? null,
      e: target.email ? target.email.trim().toLowerCase() : null,
    }),
  );
  return `${payload}.${signOpenPayload(payload)}`;
}

export function parseOpenToken(token: string): OpenTrackingTarget | null {
  const [payload, signature] = (token ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = signOpenPayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const raw = JSON.parse(fromBase64url(payload)) as Record<string, unknown>;
    const workspaceId = typeof raw["w"] === "string" ? raw["w"] : "";
    const messageId = typeof raw["m"] === "string" ? raw["m"] : "";
    if (!workspaceId || !messageId) return null;
    return {
      workspaceId,
      messageKind: raw["k"] === "v" ? "conversation" : "campaign",
      messageId,
      campaignId: typeof raw["p"] === "string" ? raw["p"] : null,
      leadId: typeof raw["l"] === "string" ? raw["l"] : null,
      email: typeof raw["e"] === "string" ? raw["e"] : null,
    };
  } catch {
    return null;
  }
}

/**
 * The host the pixel is requested from. A dedicated tracking subdomain is
 * configured with `OPEN_TRACKING_BASE_URL`; without it the app's own domain is
 * used, which still works — it is just shared with the marketing site.
 */
export function openTrackingBaseUrl(): string {
  const configured =
    process.env["OPEN_TRACKING_BASE_URL"] || process.env["TRACKING_BASE_URL"] || "";
  const base = configured.trim() || SITE_URL;
  return base.replace(/\/+$/, "");
}

/** The absolute, message-unique pixel URL that ships inside the email. */
export function openPixelUrl(target: OpenTrackingTarget): string {
  if (!target.workspaceId || !target.messageId) return "";
  return `${openTrackingBaseUrl()}${OPEN_PIXEL_PATH}?t=${encodeURIComponent(buildOpenToken(target))}`;
}

/** The exact markup injected. Invisible, no layout impact, no JavaScript. */
export function openPixelTag(url: string): string {
  return `<img src="${url}" alt="" width="1" height="1" border="0" style="display:block;width:1px;height:1px;border:0;outline:none;overflow:hidden;opacity:0;" />`;
}

/**
 * Shared injection step used by ALL three send paths.
 *
 * Returns the HTML untouched when there is no HTML body (a plain-text email is
 * never converted to HTML just to carry a pixel), when tracking is off, or when
 * the pixel is already present.
 */
export function injectOpenPixel(html: string | null | undefined, url: string): string | null {
  if (!html || !url) return html ?? null;
  if (html.includes(url)) return html;
  const tag = openPixelTag(url);
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${tag}</body>`);
  return `${html}${tag}`;
}

/** The 1x1 fully transparent GIF served back to the mail client. */
export const TRANSPARENT_GIF_BASE64 =
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function transparentGifBytes(): Uint8Array {
  return new Uint8Array(Buffer.from(TRANSPARENT_GIF_BASE64, "base64"));
}

/** Response headers that stop any cache from swallowing a later real open. */
export function openPixelHeaders(length: number): Record<string, string> {
  return {
    "content-type": "image/gif",
    "content-length": String(length),
    "cache-control": "no-store, no-cache, must-revalidate, private, max-age=0",
    pragma: "no-cache",
    expires: "0",
    "x-robots-tag": "noindex, nofollow",
  };
}

export type OpenRequestClassification = {
  /**
   * True when the request was almost certainly made by Apple Mail Privacy
   * Protection at delivery time, not by a person opening the email.
   */
  isPrefetch: boolean;
  /** Which known proxy the request came from, when recognisable. */
  source: string | null;
};

/**
 * Best-effort machine-vs-human classification.
 *
 * Apple Mail Privacy Protection fetches every pixel through Apple's own proxy
 * as soon as the message is delivered, whether or not the reader ever opens it.
 * Apple's proxy answers from 17.0.0.0/8 (Apple's own address block), which is
 * the only reliable public signal, so that is what we key on. Gmail's image
 * proxy is recorded too, but it fetches when the reader actually opens, so it
 * is NOT treated as a prefetch.
 *
 * This cannot be perfect — Apple publishes no exhaustive list — so flagged
 * opens are stored and reported separately instead of being silently dropped or
 * silently mixed into the open rate.
 */
export function classifyOpenRequest(args: {
  userAgent?: string | null;
  ip?: string | null;
}): OpenRequestClassification {
  const ua = (args.userAgent ?? "").toLowerCase();
  const ip = (args.ip ?? "").trim();

  if (/^17\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return { isPrefetch: true, source: "apple_privacy_proxy" };
  }
  if (ua.includes("applemailproxy") || ua.includes("icloudprivaterelay")) {
    return { isPrefetch: true, source: "apple_privacy_proxy" };
  }
  // Google's automated mail scanner fetches the pixel from Google's own
  // 66.249.x range ~20-30s after delivery with a spoofed desktop browser UA
  // (no "GoogleImageProxy"). Production data showed this was most recorded
  // "opens" before Oct 8 2026. It is a machine fetch, not a reader.
  if (/^66\.249\.\d{1,3}\.\d{1,3}$/.test(ip) && !ua.includes("googleimageproxy")) {
    return { isPrefetch: true, source: "google_automated_scan" };
  }
  if (ua.includes("googleimageproxy")) {
    return { isPrefetch: false, source: "google_image_proxy" };
  }
  if (ua.includes("yahoomailproxy")) {
    return { isPrefetch: false, source: "yahoo_image_proxy" };
  }
  return { isPrefetch: false, source: null };
}

/**
 * Open rate. Re-exported from the one shared engagement-rate module so Admin,
 * Analytics and the campaign tabs can never compute it differently.
 */
export { openRatePercent } from "@/lib/engagement-rates";
