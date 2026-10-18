/** Customer-facing billing operations (checkout, portal, plan changes, usage). */
import type { BillingInterval, BillingProvider } from "@/lib/billing/model";
import { BILLING_PROVIDERS } from "@/lib/billing/model";
import { admin, getBillingSettings, isConfigured, writeAudit } from "@/lib/billing/core.server";
import { getBillingAdapter } from "@/lib/billing/providers.server";
import { getEntitlement } from "@/lib/billing/entitlements.server";

function appUrl() {
  return (
    process.env["APP_URL"] ??
    process.env["VITE_APP_URL"] ??
    "https://munchreach.com"
  );
}

export async function availableProviders() {
  const settings = await getBillingSettings();
  const { loadReadiness } = await import("@/lib/billing/readiness.server");
  const states = await loadReadiness();
  return BILLING_PROVIDERS.map((provider) => {
    const state = states.find(
      (s) => s.provider === provider && s.environment === settings.environment,
    );
    // Checkout availability is per plan, not all-or-nothing: one plan with a
    // missing price mapping must not disable checkout for the plans that are
    // fully configured. Each plan's own mapping is re-validated server-side
    // before a session is created.
    const planAvailability = Object.fromEntries(
      (state?.plans ?? []).map((p) => [
        p.planId,
        p.billingType === "lifetime"
          ? { monthly: false, yearly: false, lifetime: p.lifetime.ok }
          : { monthly: p.monthly.ok, yearly: p.yearly.ok, lifetime: false },
      ]),
    );
    const anyPlanPurchasable = Object.values(planAvailability).some(
      (p) => p.monthly || p.yearly || p.lifetime,
    );
    const available = Boolean(state?.enabled && state.credentials.ok && anyPlanPurchasable);
    return {
      provider,
      environment: settings.environment,
      available,
      plans: planAvailability,
      reason: !state?.enabled
        ? "Not enabled"
        : !state.credentials.ok
          ? "Credentials missing"
        : !available
            ? "Plan IDs incomplete"
            : null,
    };
  });
}


export async function loadCustomerBilling(workspaceId: string) {
  const db = await admin();
  const settings = await getBillingSettings();
  const entitlement = await getEntitlement(workspaceId);

  const { getPlanUsageForBilling } = await import("@/lib/billing/gates.server");

  const [sub, invoices, transactions, planUsage] = await Promise.all([
    db
      .from("billing_subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("environment", settings.environment)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("billing_invoices")
      .select("id, provider, number, amount_cents, currency, status, issued_at, hosted_url, pdf_url")
      .eq("workspace_id", workspaceId)
      .eq("environment", settings.environment)
      .order("issued_at", { ascending: false })
      .limit(50),
    db
      .from("billing_transactions")
      .select("id, provider, kind, amount_cents, currency, status, occurred_at, description")
      .eq("workspace_id", workspaceId)
      .eq("environment", settings.environment)
      .order("occurred_at", { ascending: false })
      .limit(50),
    getPlanUsageForBilling(workspaceId),
  ]);

  const row = sub.data;
  return {
    environment: settings.environment,
    planId: entitlement.planId,
    planName: entitlement.planName,
    state: entitlement.state,
    active: entitlement.active,
    // Staff-granted plans are shown as provided by MunchReach. Internal admin
    // notes are deliberately never returned to the customer.
    planSource: entitlement.source,
    grant: entitlement.grant
      ? { planName: entitlement.grant.planName, expiresAt: entitlement.grant.expiresAt }
      : null,
    provider: (row?.provider as BillingProvider) ?? null,
    interval: (row?.billing_interval as BillingInterval) ?? null,
    amountCents: row?.amount_cents ?? 0,
    currency: row?.currency ?? "usd",
    nextBillingAt: row?.current_period_end ?? null,
    trialEndsAt: row?.trial_ends_at ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    accessUntil: row?.access_until ?? null,
    graceUntil: row?.grace_until ?? null,
    canManagePaymentMethod: Boolean(row?.external_customer_id || row?.external_subscription_id),
    // Real counts and real plan caps, both from the one usage/entitlement
    // service the mutations use — never "1 / 1" just because the plan allows 1.
    usage: planUsage.usage,
    limits: planUsage.limits,
    invoices: invoices.data ?? [],
    transactions: transactions.data ?? [],
  };
}

async function priceFor(
  provider: BillingProvider,
  environment: "test" | "live",
  planId: string,
  interval: BillingInterval,
) {
  // Stripe prices are immutable and can be archived in the dashboard, so the
  // stored mapping is verified (and repaired) before checkout instead of letting
  // Stripe reject the session with a stale price id.
  if (provider === "stripe") {
    const { ensureStripePrice } = await import("@/lib/billing/stripe-sync.server");
    return ensureStripePrice(environment, planId, interval);
  }
  const db = await admin();
  const { data } = await db
    .from("billing_plan_prices")
    .select("external_price_id")
    .eq("provider", provider)
    .eq("environment", environment)
    .eq("plan_id", planId)
    .eq("billing_interval", interval)
    .maybeSingle();
  if (!data?.external_price_id)
    throw new Error("This plan is not available for checkout yet. Please contact support.");
  return data.external_price_id as string;
}

export async function createCheckoutSession(input: {
  workspaceId: string;
  planId: string;
  interval: BillingInterval;
  provider: BillingProvider;
  userId: string;
}) {
  const db = await admin();
  const settings = await getBillingSettings();
  const options = await availableProviders();
  const option = options.find((o) => o.provider === input.provider);
  if (!option?.available)
    throw new Error("This payment method is not available right now. Please try another option.");

  // Lifetime plans are charged once. The plan row is authoritative here so a
  // recurring interval can never be used to buy a lifetime deal (or vice versa).
  const { data: planRow } = await db
    .from("plans")
    .select("id, name, billing_type, is_active")
    .eq("id", input.planId)
    .maybeSingle();
  if (!planRow?.is_active) throw new Error("This plan is not available right now.");
  const lifetime = planRow.billing_type === "lifetime";
  if (lifetime && input.provider !== "stripe") throw new Error("Lifetime access uses Stripe checkout.");
  if (!lifetime && input.interval === "lifetime") throw new Error("This plan is not a lifetime offer.");
  const interval: BillingInterval = lifetime ? "lifetime" : input.interval;
  if (lifetime) {
    const entitlement = await getEntitlement(input.workspaceId);
    if (entitlement.planId === input.planId && entitlement.active)
      throw new Error("This workspace already has lifetime access.");
  }

  const priceId = await priceFor(input.provider, settings.environment, input.planId, interval);
  const { data: customer } = await db
    .from("billing_customers")
    .select("external_customer_id, email")
    .eq("workspace_id", input.workspaceId)
    .eq("provider", input.provider)
    .eq("environment", settings.environment)
    .maybeSingle();
  const { data: profile } = await db
    .from("profiles")
    .select("email")
    .eq("id", input.userId)
    .maybeSingle();

  const base = appUrl();
  const adapter = getBillingAdapter(input.provider);
  const checkoutArgs = {
    environment: settings.environment,
    priceId,
    workspaceId: input.workspaceId,
    planId: input.planId,
    interval,
    mode: lifetime ? ("payment" as const) : ("subscription" as const),
    email: customer?.email ?? profile?.email ?? null,
    customerId: customer?.external_customer_id ?? null,
    successUrl: lifetime ? `${base}/billing?plan=${encodeURIComponent(input.planId)}&checkout=success` : `${base}/settings?tab=billing&checkout=success`,
    cancelUrl: lifetime ? `${base}/billing?plan=${encodeURIComponent(input.planId)}&checkout=cancelled` : `${base}/settings?tab=billing&checkout=cancelled`,
  };

  let result: { url: string };
  try {
    result = await adapter.createCheckout(checkoutArgs);
  } catch (error: any) {
    // A stored provider customer created in the other mode (or since deleted)
    // makes the session fail; retrying without it lets checkout collect a fresh
    // customer instead of dead-ending the purchase.
    const detail = String(error?.detail ?? error?.message ?? "");
    console.error("[billing] checkout failed", {
      provider: input.provider,
      environment: settings.environment,
      planId: input.planId,
      interval,
      priceId,
      detail,
    });
    if (checkoutArgs.customerId && /customer/i.test(detail)) {
      result = await adapter.createCheckout({ ...checkoutArgs, customerId: null });
    } else {
      await writeAudit({
        workspaceId: input.workspaceId,
        userId: input.userId,
        provider: input.provider,
        environment: settings.environment,
        action: "checkout.failed",
        detail: { planId: input.planId, interval, priceId, error: detail },
      });
      throw error;
    }
  }

  await writeAudit({
    workspaceId: input.workspaceId,
    userId: input.userId,
    provider: input.provider,
    environment: settings.environment,
    action: "checkout.started",
    detail: { planId: input.planId, interval },
  });
  return result;
}

/**
 * The recurring subscription we can act on. Lifetime purchases are stored in the
 * same table but have no cancellable provider subscription, so they are excluded
 * here and reported with a clear, customer-safe message instead.
 */
async function activeSubscription(workspaceId: string, opts?: { recurringOnly?: boolean }) {
  const db = await admin();
  const settings = await getBillingSettings();
  const { data: rows } = await db
    .from("billing_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("environment", settings.environment)
    .order("updated_at", { ascending: false })
    .limit(10);
  const all = (rows ?? []) as Array<Record<string, unknown> & {
    id: string;
    provider: string;
    status: string | null;
    billing_interval: string | null;
    external_subscription_id: string;
    cancel_at_period_end: boolean | null;
    access_until: string | null;
    current_period_end: string | null;
  }>;
  if (all.length === 0) throw new Error("No active subscription for this workspace.");
  if (!opts?.recurringOnly) return all[0]!;

  const recurring = all.find(
    (r) =>
      r.billing_interval !== "lifetime" &&
      typeof r.external_subscription_id === "string" &&
      r.external_subscription_id.length > 0 &&
      !r.external_subscription_id.startsWith("lifetime_") &&
      r.status !== "cancelled" &&
      r.status !== "expired",
  );
  if (!recurring) {
    if (all.some((r) => r.billing_interval === "lifetime"))
      throw new Error("Lifetime access is a one-time purchase — there is no subscription to cancel.");
    throw new Error("No active subscription for this workspace.");
  }
  return recurring;
}

export async function changePlan(input: {
  workspaceId: string;
  planId: string;
  interval: BillingInterval;
  userId: string;
}) {
  const sub = await activeSubscription(input.workspaceId, { recurringOnly: true });
  const settings = await getBillingSettings();
  const provider = sub.provider as BillingProvider;
  const priceId = await priceFor(provider, settings.environment, input.planId, input.interval);
  await getBillingAdapter(provider).changePlan(
    settings.environment,
    sub.external_subscription_id,
    priceId,
  );
  await writeAudit({
    workspaceId: input.workspaceId,
    userId: input.userId,
    provider,
    environment: settings.environment,
    action: "subscription.plan_change_requested",
    detail: { planId: input.planId, interval: input.interval },
  });
  return { ok: true };
}

/**
 * Cancel a recurring subscription. Defaults to cancel-at-period-end so paid
 * access and entitlements are never revoked early — webhooks stay the source of
 * truth and flip the row to `cancelled` when the period actually ends. The local
 * flag is mirrored immediately so the billing page reflects the change without
 * waiting for the provider callback.
 */
export async function cancelForWorkspace(workspaceId: string, userId: string, immediately: boolean) {
  const sub = await activeSubscription(workspaceId, { recurringOnly: true });
  const settings = await getBillingSettings();
  const provider = sub.provider as BillingProvider;

  // Idempotent: a second click must not hit the provider again.
  if (!immediately && sub.cancel_at_period_end === true) {
    return {
      ok: true,
      alreadyScheduled: true,
      cancelAtPeriodEnd: true,
      accessUntil: (sub.access_until as string | null) ?? (sub.current_period_end as string | null),
    };
  }

  try {
    await getBillingAdapter(provider).cancel(
      settings.environment,
      sub.external_subscription_id,
      !immediately,
    );
  } catch (error) {
    console.error("[billing] cancel failed", {
      workspaceId,
      provider,
      environment: settings.environment,
      subscriptionId: sub.external_subscription_id,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error("We couldn't cancel your subscription. Please try again.");
  }

  const db = await admin();
  if (!immediately) {
    await db
      .from("billing_subscriptions")
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("id", sub.id);
  }

  await writeAudit({
    workspaceId,
    userId,
    provider,
    environment: settings.environment,
    action: immediately ? "subscription.cancel_now" : "subscription.cancel_at_period_end",
  });
  return {
    ok: true,
    alreadyScheduled: false,
    cancelAtPeriodEnd: !immediately,
    accessUntil: (sub.access_until as string | null) ?? (sub.current_period_end as string | null),
  };
}

/** Remove a scheduled cancellation. No-op when nothing is scheduled. */
export async function resumeForWorkspace(workspaceId: string, userId: string) {
  const sub = await activeSubscription(workspaceId, { recurringOnly: true });
  const settings = await getBillingSettings();
  const provider = sub.provider as BillingProvider;
  if (sub.cancel_at_period_end !== true) return { ok: true, alreadyActive: true };

  try {
    await getBillingAdapter(provider).resume(settings.environment, sub.external_subscription_id);
  } catch (error) {
    console.error("[billing] resume failed", {
      workspaceId,
      provider,
      environment: settings.environment,
      subscriptionId: sub.external_subscription_id,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error("We couldn't resume your subscription. Please try again.");
  }

  const db = await admin();
  await db
    .from("billing_subscriptions")
    .update({ cancel_at_period_end: false, updated_at: new Date().toISOString() })
    .eq("id", sub.id);

  await writeAudit({
    workspaceId,
    userId,
    provider,
    environment: settings.environment,
    action: "subscription.resume",
  });
  return { ok: true, alreadyActive: false };
}

export async function portalForWorkspace(workspaceId: string, returnUrl: string) {
  const sub = await activeSubscription(workspaceId);
  const settings = await getBillingSettings();
  const provider = sub.provider as BillingProvider;
  const url = await getBillingAdapter(provider).portalUrl(settings.environment, {
    customerId: (sub["external_customer_id"] as string | null) ?? null,
    subscriptionId: sub.external_subscription_id ?? null,
    returnUrl,
  });
  return { url };
}
