/**
 * AppSumo Lifetime codes. Server only.
 *
 * Redemption runs in the `redeem_appsumo_code` database routine, which locks the
 * code row so two concurrent submissions of the same code have exactly one
 * winner. The routine creates a normal Lifetime billing_subscriptions row with
 * provider = 'appsumo' — no Stripe object is created or touched.
 */
export const GENERIC_CODE_ERROR = "That AppSumo code is invalid or has already been redeemed.";

const PUBLIC_MESSAGES: Record<string, string> = {
  already_lifetime: "This workspace already has Lifetime access, so your code was not used.",
  active_recurring_subscription:
    "This workspace has an active paid subscription. Cancel it first (it stays active until the period ends), then redeem your code. Your code was not used.",
  lifetime_plan_missing: "Lifetime access is temporarily unavailable. Please contact support.",
};

export function normalizeCode(raw: string) {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function publicMessageFor(reason: string) {
  return PUBLIC_MESSAGES[reason] ?? GENERIC_CODE_ERROR;
}

const RULES = [
  { scope: "user:15m", limit: 8, windowSeconds: 15 * 60 },
  { scope: "user:24h", limit: 30, windowSeconds: 24 * 60 * 60 },
  { scope: "ip:15m", limit: 15, windowSeconds: 15 * 60 },
];

/** Brute-force protection. Throws a friendly message when a budget is spent. */
export async function assertRedeemRateLimit(db: any, userId: string, ip: string | null) {
  for (const rule of RULES) {
    const key = rule.scope.startsWith("ip") ? ip : userId;
    if (!key) continue;
    const { data, error } = await db.rpc("admin_rate_limit_hit", {
      _bucket: `appsumo:${rule.scope}:${key}`,
      _limit: rule.limit,
      _window_seconds: rule.windowSeconds,
    });
    if (error) continue; // fail open on infrastructure errors only
    if (data && data.allowed === false) {
      const minutes = Math.max(1, Math.ceil(Number(data.retry_after_seconds ?? 60) / 60));
      const err = new Error(`Too many attempts. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`);
      (err as any).rateLimited = true;
      throw err;
    }
  }
}

/** AppSumo CSV: one code per row, no header, no blank rows. */
export function toAppSumoCsv(codes: string[]) {
  return codes.filter((c) => c && c.trim()).map((c) => c.trim()).join("\n");
}
