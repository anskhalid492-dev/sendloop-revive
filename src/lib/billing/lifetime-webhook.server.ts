import type { BillingEnvironment } from "@/lib/billing/model";
import { admin, applyBillingEvent } from "@/lib/billing/core.server";
import { stripeCall } from "@/lib/billing/providers.server";

/** Called only after signature verification, including stored verified retries. */
export async function applyVerifiedLifetimeCheckout(environment: BillingEnvironment, eventId: string, session: any) {
  if (session?.mode !== "payment" || !["paid", "no_payment_required"].includes(session?.payment_status)) return;
  const workspaceId = session.metadata?.workspace_id ?? session.client_reference_id;
  const planId = session.metadata?.plan_id;
  if (!workspaceId || !planId) throw new Error("Lifetime checkout is missing its workspace or plan.");
  const db = await admin();
  const [{ data: plan, error: planError }, { data: mapping, error: mappingError }] = await Promise.all([
    db.from("plans").select("id, billing_type, one_time_price").eq("id", planId).maybeSingle(),
    db.from("billing_plan_prices").select("external_price_id").eq("plan_id", planId).eq("provider", "stripe").eq("environment", environment).eq("billing_interval", "lifetime").maybeSingle(),
  ]);
  if (planError || mappingError || !plan || plan.billing_type !== "lifetime" || !mapping) throw new Error("Lifetime checkout plan or price mapping is invalid.");
  const items = await stripeCall(environment, `checkout/sessions/${encodeURIComponent(session.id)}/line_items?limit=2`, undefined, "GET");
  const line = items?.data?.[0];
  const priceId = typeof line?.price === "string" ? line.price : line?.price?.id;
  // Legacy sessions need no new metadata field: verify actual purchased lines.
  if (items?.data?.length !== 1 || line?.quantity !== 1 || priceId !== mapping.external_price_id || session.currency !== "usd" || line?.price?.unit_amount !== plan.one_time_price) throw new Error("Lifetime checkout does not match this plan's configured USD price.");
  await applyBillingEvent("stripe", {
    eventId: `${eventId}:lifetime`, eventType: "checkout.session.lifetime_purchase", environment,
    workspaceId, planId,
    subscription: {
      externalId: `lifetime_${session.id}`, customerId: typeof session.customer === "string" ? session.customer : null,
      status: "active", interval: "lifetime", priceId,
      amountCents: session.amount_total ?? 0, currency: "usd",
      currentPeriodStart: new Date().toISOString(), currentPeriodEnd: null,
      trialEndsAt: null, cancelAtPeriodEnd: false, cancelledAt: null,
    },
  });
}