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
export const LIFETIME_STARTER_SLUG = "lifetime-starter";

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
  return plan.billing_type === "lifetime" || plan.slug === LIFETIME_PLAN_SLUG || plan.slug === LIFETIME_STARTER_SLUG;
}

export function lifetimePriceCents(plan?: PlanLike | null) {
  return plan?.one_time_price ?? (plan?.slug === LIFETIME_STARTER_SLUG ? 2900 : LIFETIME_PRICE_CENTS);
}

export function lifetimeCompareAtCents(plan?: PlanLike | null) {
  return plan?.compare_at_price ?? (plan?.slug === LIFETIME_STARTER_SLUG ? 0 : LIFETIME_COMPARE_AT_CENTS);
}

export function lifetimeBillingHref(plan: { id: string }) {
  return `/billing?plan=${encodeURIComponent(plan.id)}`;
}

/** Deterministic marketing order without changing stored plan ordering. */
export function lifetimeOffers<T extends PlanLike>(plans: T[]): T[] {
  return plans.filter(isLifetimePlan).sort((a, b) => lifetimePriceCents(a) - lifetimePriceCents(b));
}

export type LifetimeStripePrice = {
  id?: string; active?: boolean; type?: string; recurring?: unknown;
  currency?: string; unit_amount?: number | null;
  product?: string | { active?: boolean };
};

export function validateLifetimeStripePrice(price: LifetimeStripePrice | null, amount: number) {
  if (!price || price.active !== true) throw new Error("That Stripe price is missing or archived.");
  if (price.recurring || (price.type && price.type !== "one_time")) throw new Error("Lifetime access requires a one-time, non-recurring Stripe price.");
  if (price.currency?.toLowerCase() !== "usd") throw new Error("Lifetime access requires a USD Stripe price.");
  if (price.unit_amount !== amount) throw new Error("The Stripe price amount must match this lifetime plan's configured one-time price.");
  if (typeof price.product === "object" && price.product?.active !== true) throw new Error("The Stripe product is archived.");
}
