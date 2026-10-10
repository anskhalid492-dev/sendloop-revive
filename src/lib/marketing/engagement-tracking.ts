/**
 * Marketing open tracking (server-side helpers).
 *
 * Each marketing send gets its own signed pixel token naming the exact send
 * event, so an open can be attributed to the template and subject line that
 * were actually delivered. Separate from the cold-outbound pixel so the two
 * analytics never mix.
 */
import { createHmac, timingSafeEqual } from "crypto";

import { openTrackingBaseUrl } from "@/lib/open-tracking";

export const MARKETING_OPEN_PATH = "/api/public/marketing/open";

export type MarketingOpenTarget = {
  sendEventId: string;
  subscriberId: string | null;
  email: string;
  campaignId: string | null;
  automationId: string | null;
};

/**
 * Private server-side signing keys, in the previous order so already-sent
 * pixels signed with a private key keep verifying. The hardcoded literal that
 * used to follow is gone: with no private key, no pixel is added and every
 * token is rejected. `SB_SERVICE_ROLE_KEY` is only consulted last. Never logged.
 */
const MARKETING_SIGNING_SECRET_ENV = [
  "OPEN_TRACKING_SECRET",
  "MARKETING_UNSUBSCRIBE_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SB_SERVICE_ROLE_KEY",
] as const;
const MIN_SECRET_LENGTH = 16;

function secret(): string | null {
  for (const name of MARKETING_SIGNING_SECRET_ENV) {
    const value = (process.env[name] ?? "").trim();
    if (value.length >= MIN_SECRET_LENGTH) return value;
  }
  return null;
}

export function hasMarketingOpenSecret(): boolean {
  return secret() !== null;
}

function sign(payload: string): string {
  const key = secret();
  if (!key) return "";
  return createHmac("sha256", key).update(`mkt-open:${payload}`).digest("hex").slice(0, 32);
}

const TOKEN_PATTERN = /^([A-Za-z0-9_-]{1,2048})\.([0-9a-f]{32})$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function buildMarketingOpenToken(target: MarketingOpenTarget): string {
  const payload = Buffer.from(
    JSON.stringify({
      m: target.sendEventId,
      s: target.subscriberId,
      e: target.email.trim().toLowerCase(),
      c: target.campaignId,
      a: target.automationId,
    }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseMarketingOpenToken(token: string): MarketingOpenTarget | null {
  if (typeof token !== "string") return null;
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const payload = match[1]!;
  const signature = match[2]!;
  const expected = sign(payload);
  if (!expected) return null; // no private key: fail closed
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const raw = parsed as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const sendEventId = str(raw["m"]);
    const email = str(raw["e"]);
    if (!sendEventId || !ID_PATTERN.test(sendEventId)) return null;
    if (!email || email.length > 320 || !email.includes("@")) return null;
    return {
      sendEventId,
      email,
      subscriberId: str(raw["s"]),
      campaignId: str(raw["c"]),
      automationId: str(raw["a"]),
    };
  } catch {
    return null;
  }
}

/** `null` when no private key is configured: the email is sent without a pixel. */
export function marketingOpenPixelUrl(target: MarketingOpenTarget): string | null {
  if (!hasMarketingOpenSecret()) return null;
  return `${openTrackingBaseUrl()}${MARKETING_OPEN_PATH}?t=${encodeURIComponent(buildMarketingOpenToken(target))}`;
}
