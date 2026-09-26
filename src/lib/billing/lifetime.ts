/**
 * Lifetime Deal constants — shared by the marketing page, the pricing page and
 * the billing UI.
 *
 * `billing_type` / `one_time_price` are the authoritative source once the
 * lifetime migration is applied. The slug fallback below keeps the offer hidden
 * from the public pricing page (and correctly priced) even on a database where
 * those columns are not present yet.
 */
export const LIFETIME_PLAN_SLUG = "lifetime";

/** Fallback used only when the plan row has no `one_time_price` column/value. */
export const LIFETIME_PRICE_CENTS = 9900;
export const LIFETIME_COMPARE_AT_CENTS = 56400;

type PlanLike = {
  slug?: string | null;
  billing_type?: string | null;
  one_time_price?: number | null;
  compare_at_price?: number | null;
  yearly_price?: number | null;
};

export function isLifetimePlan(plan: PlanLike) {
  return plan.billing_type === "lifetime" || plan.slug === LIFETIME_PLAN_SLUG;
}

export function lifetimePriceCents(plan?: PlanLike | null) {
  return plan?.one_time_price ?? LIFETIME_PRICE_CENTS;
}

export function lifetimeCompareAtCents(plan?: PlanLike | null) {
  return plan?.compare_at_price ?? LIFETIME_COMPARE_AT_CENTS;
}
