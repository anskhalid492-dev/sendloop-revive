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

/**
 * Makes a redeemed AppSumo code actually grant access. The redemption routine
 * records the billing subscription, but plan entitlement is read from
 * `workspace_subscriptions`, so it must be updated too — the same way a
 * confirmed Stripe Lifetime purchase does. Never touches Stripe.
 */
export async function activateAppSumoEntitlement(db: any, workspaceId: string, subscriptionId: string) {
  const { data: sub } = await db
    .from("billing_subscriptions")
    .select("plan_id, external_subscription_id, current_period_start")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub?.plan_id) throw new Error("appsumo_subscription_missing");
  const { error } = await db.from("workspace_subscriptions").upsert(
    {
      workspace_id: workspaceId,
      plan_id: sub.plan_id,
      status: "active",
      payment_status: "paid",
      billing_interval: "lifetime",
      external_customer_id: null,
      external_subscription_id: sub.external_subscription_id,
      current_period_end: null,
      trial_ends_at: null,
    },
    { onConflict: "workspace_id" },
  );
  if (error) throw new Error(error.message);
  try {
    const { allocatePlanCredits } = await import("@/lib/billing/credits.server");
    await allocatePlanCredits({
      workspaceId,
      planId: sub.plan_id,
      periodStart: sub.current_period_start ?? new Date().toISOString(),
    });
  } catch {
    /* credit grant must never block access */
  }
}

/**
 * Undoes activateAppSumoEntitlement after a code is revoked. Only touches the
 * workspace's plan when it is still the one granted by this AppSumo
 * subscription, so a later Stripe purchase or staff plan is never overwritten.
 */
export async function revokeAppSumoEntitlement(db: any, codeId: string) {
  const { data: code } = await db
    .from("appsumo_codes")
    .select("workspace_id, subscription_id")
    .eq("id", codeId)
    .maybeSingle();
  if (!code?.workspace_id || !code?.subscription_id) return { downgraded: false };
  const { data: sub } = await db
    .from("billing_subscriptions")
    .select("external_subscription_id")
    .eq("id", code.subscription_id)
    .maybeSingle();
  const { data: free } = await db
    .from("plans")
    .select("id")
    .eq("monthly_price", 0)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!sub?.external_subscription_id || !free?.id) throw new Error("appsumo_revoke_lookup_failed");
  const { data: rows, error } = await db
    .from("workspace_subscriptions")
    .update({
      plan_id: free.id,
      status: "active",
      payment_status: null,
      billing_interval: "monthly",
      external_subscription_id: null,
      current_period_end: null,
    })
    .eq("workspace_id", code.workspace_id)
    .eq("external_subscription_id", sub.external_subscription_id)
    .select("workspace_id");
  if (error) throw new Error(error.message);
  return { downgraded: (rows ?? []).length > 0 };
}
