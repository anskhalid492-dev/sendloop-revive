/**
 * Stripe catalogue sync — server only.
 *
 * Creates (or reuses) one Stripe product per MunchReach plan and one recurring
 * price per billing cycle, then records the mapping in `billing_plan_prices`.
 * Without that mapping a paid subscription cannot be resolved back to a plan,
 * so the webhook would have nothing to upgrade the workspace to.
 *
 * The same code runs for test and live: the environment only selects which
 * credential set is used, never any hard-coded identifier.
 */
import type { BillingEnvironment, BillingInterval } from "@/lib/billing/model";
import { admin, writeAudit } from "@/lib/billing/core.server";
import { stripeCall } from "@/lib/billing/providers.server";

type PlanRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthly_price: number | null;
  yearly_price: number | null;
  is_active: boolean;
  sort_order: number | null;
  billing_type: string | null;
  one_time_price: number | null;
};

export type StripeSyncResult = {
  environment: BillingEnvironment;
  plans: {
    planId: string;
    planName: string;
    interval: BillingInterval;
    priceId: string;
    amountCents: number;
    action: "reused" | "created";
  }[];
  skipped: { planName: string; reason: string }[];
};

/** Monthly cents charged for a plan on the given cycle (yearly is billed once, 12x). */
function amountFor(plan: PlanRow, interval: BillingInterval) {
  if (interval === "lifetime") return plan.one_time_price ?? 0;
  if (interval === "monthly") return plan.monthly_price ?? 0;
  const perMonth = plan.yearly_price ?? plan.monthly_price ?? 0;
  return perMonth * 12;
}

async function findOrCreateProduct(env: BillingEnvironment, plan: PlanRow) {
  const query = `metadata['munchreach_plan_id']:'${plan.id}'`;
  try {
    const found = await stripeCall(
      env,
      `products/search?query=${encodeURIComponent(query)}&limit=1`,
      undefined,
      "GET",
    );
    const hit = found?.data?.[0];
    if (hit?.id) return hit.id as string;
  } catch {
    /* search is unavailable on very old accounts — fall through to create */
  }
  const created = await stripeCall(env, "products", {
    name: `MunchReach ${plan.name}`,
    ...(plan.description ? { description: plan.description } : {}),
    metadata: { munchreach_plan_id: plan.id, munchreach_plan_slug: plan.slug },
  });
  return created.id as string;
}

async function existingPriceIsValid(
  env: BillingEnvironment,
  priceId: string,
  amountCents: number,
  interval: BillingInterval,
) {
  try {
    const price = await stripeCall(env, `prices/${priceId}`, undefined, "GET");
    if (price?.active !== true || price?.unit_amount !== amountCents) return false;
    if (interval === "lifetime") return !price?.recurring;
    return price?.recurring?.interval === (interval === "yearly" ? "year" : "month");
  } catch {
    return false;
  }
}

/**
 * Returns a Stripe price id that is guaranteed to exist, be active and match the
 * plan's current amount/cycle for this environment — repairing the mapping when
 * the stored price was archived, deleted or repriced in Stripe. Without this a
 * stale mapping makes Stripe reject the checkout session ("No such price"),
 * which the customer only sees as a generic payment failure.
 */
export async function ensureStripePrice(
  environment: BillingEnvironment,
  planId: string,
  interval: BillingInterval,
): Promise<string> {
  const db = await admin();
  const { data: plan } = await db
    .from("plans")
    .select(
      "id, name, slug, description, monthly_price, yearly_price, is_active, sort_order, billing_type, one_time_price",
    )
    .eq("id", planId)
    .maybeSingle();
  if (!plan) throw new Error("This plan is not available right now.");

  const amountCents = amountFor(plan as PlanRow, interval);
  if (amountCents <= 0)
    throw new Error("This plan is not available for checkout yet. Please contact support.");

  const { data: mapping } = await db
    .from("billing_plan_prices")
    .select("external_price_id")
    .eq("plan_id", planId)
    .eq("provider", "stripe")
    .eq("environment", environment)
    .eq("billing_interval", interval)
    .maybeSingle();

  if (
    mapping?.external_price_id &&
    (await existingPriceIsValid(environment, mapping.external_price_id, amountCents, interval))
  )
    return mapping.external_price_id as string;

  const productId = await findOrCreateProduct(environment, plan as PlanRow);
  const price = await stripeCall(environment, "prices", {
    product: productId,
    currency: "usd",
    unit_amount: amountCents,
    ...(interval === "lifetime"
      ? {}
      : { recurring: { interval: interval === "yearly" ? "year" : "month" } }),
    metadata: { munchreach_plan_id: plan.id, munchreach_interval: interval },
  });

  await db.from("billing_plan_prices").upsert(
    {
      plan_id: plan.id,
      provider: "stripe",
      environment,
      billing_interval: interval,
      external_price_id: price.id,
      currency: "usd",
    },
    { onConflict: "plan_id,provider,environment,billing_interval" },
  );
  return price.id as string;
}

/**
 * Makes the Stripe catalogue match the MunchReach plan table for one
 * environment. Existing prices are reused whenever they still match the plan's
 * amount and cycle; Stripe prices are immutable, so a changed amount creates a
 * new price and repoints the mapping (existing subscriptions keep their price
 * until the customer changes plan, which is Stripe's intended behaviour).
 */
export async function syncStripePrices(
  environment: BillingEnvironment,
  userId: string,
): Promise<StripeSyncResult> {
  const db = await admin();
  const { data: plans } = await db
    .from("plans")
    .select(
      "id, name, slug, description, monthly_price, yearly_price, is_active, sort_order, billing_type, one_time_price",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const result: StripeSyncResult = { environment, plans: [], skipped: [] };
  const intervals: BillingInterval[] = ["monthly", "yearly"];

  for (const plan of (plans ?? []) as PlanRow[]) {
    const lifetime = plan.billing_type === "lifetime";
    const anchorAmount = lifetime ? (plan.one_time_price ?? 0) : (plan.monthly_price ?? 0);
    if (anchorAmount <= 0) {
      result.skipped.push({ planName: plan.name, reason: "Free plan — no Stripe price needed" });
      continue;
    }
    const productId = await findOrCreateProduct(environment, plan);

    for (const interval of lifetime ? (["lifetime"] as BillingInterval[]) : intervals) {
      const amountCents = amountFor(plan, interval);
      if (amountCents <= 0) continue;

      const { data: mapping } = await db
        .from("billing_plan_prices")
        .select("external_price_id")
        .eq("plan_id", plan.id)
        .eq("provider", "stripe")
        .eq("environment", environment)
        .eq("billing_interval", interval)
        .maybeSingle();

      if (
        mapping?.external_price_id &&
        (await existingPriceIsValid(environment, mapping.external_price_id, amountCents, interval))
      ) {
        result.plans.push({
          planId: plan.id,
          planName: plan.name,
          interval,
          priceId: mapping.external_price_id,
          amountCents,
          action: "reused",
        });
        continue;
      }

      const price = await stripeCall(environment, "prices", {
        product: productId,
        currency: "usd",
        unit_amount: amountCents,
        ...(interval === "lifetime"
          ? {}
          : { recurring: { interval: interval === "yearly" ? "year" : "month" } }),
        metadata: { munchreach_plan_id: plan.id, munchreach_interval: interval },
      });

      await db.from("billing_plan_prices").upsert(
        {
          plan_id: plan.id,
          provider: "stripe",
          environment,
          billing_interval: interval,
          external_price_id: price.id,
          currency: "usd",
        },
        { onConflict: "plan_id,provider,environment,billing_interval" },
      );

      result.plans.push({
        planId: plan.id,
        planName: plan.name,
        interval,
        priceId: price.id as string,
        amountCents,
        action: "created",
      });
    }
  }

  await writeAudit({
    userId,
    provider: "stripe",
    environment,
    action: "stripe.catalogue_synced",
    detail: { created: result.plans.filter((p) => p.action === "created").length },
  });

  return result;
}
