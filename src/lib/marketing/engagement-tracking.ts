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

function secret(): string {
  return (
    process.env["OPEN_TRACKING_SECRET"] ||
    process.env["MARKETING_UNSUBSCRIBE_SECRET"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    "munchreach-marketing-open"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`mkt-open:${payload}`).digest("hex").slice(0, 32);
}

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
  const [payload, signature] = (token ?? "").split(".");
  if (!payload || !signature) return null;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const sendEventId = str(raw["m"]);
    const email = str(raw["e"]);
    if (!sendEventId || !email) return null;
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

export function marketingOpenPixelUrl(target: MarketingOpenTarget): string {
  return `${openTrackingBaseUrl()}${MARKETING_OPEN_PATH}?t=${encodeURIComponent(buildMarketingOpenToken(target))}`;
}
