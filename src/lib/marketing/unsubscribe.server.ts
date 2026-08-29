/**
 * Marketing unsubscribe links.
 *
 * Deliberately separate from the campaign (cold outbound) unsubscribe in
 * `src/lib/unsubscribe.ts`: marketing opt-outs suppress the SUBSCRIBER across
 * every marketing send, while campaign opt-outs suppress a lead for outbound.
 * Mixing the two would let a marketing opt-out silently kill a customer's cold
 * campaign, or vice versa.
 */
import { createHmac, timingSafeEqual } from "crypto";

import { SITE_URL } from "@/lib/seo";

export const MARKETING_UNSUBSCRIBE_PATH = "/api/public/marketing/unsubscribe";
export const MARKETING_PREFERENCES_PATH = "/api/public/marketing/preferences";

export type MarketingUnsubscribeTarget = {
  subscriberId: string;
  email: string;
  campaignId?: string | null;
  automationId?: string | null;
};

function secret(): string {
  return (
    process.env["MARKETING_UNSUBSCRIBE_SECRET"] ||
    process.env["UNSUBSCRIBE_SECRET"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    "munchreach-marketing-unsubscribe"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
}

export function buildMarketingToken(target: MarketingUnsubscribeTarget): string {
  const payload = Buffer.from(
    JSON.stringify({
      s: target.subscriberId,
      e: target.email.trim().toLowerCase(),
      c: target.campaignId ?? null,
      a: target.automationId ?? null,
    }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseMarketingToken(token: string): MarketingUnsubscribeTarget | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      s: string;
      e: string;
      c: string | null;
      a: string | null;
    };
    if (!json.s || !json.e) return null;
    return {
      subscriberId: json.s,
      email: json.e,
      campaignId: json.c,
      automationId: json.a,
    };
  } catch {
    return null;
  }
}

export function marketingUnsubscribeUrl(target: MarketingUnsubscribeTarget): string {
  return `${SITE_URL}${MARKETING_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(
    buildMarketingToken(target),
  )}`;
}

export function marketingPreferencesUrl(target: MarketingUnsubscribeTarget): string {
  return `${SITE_URL}${MARKETING_PREFERENCES_PATH}?token=${encodeURIComponent(
    buildMarketingToken(target),
  )}`;
}
