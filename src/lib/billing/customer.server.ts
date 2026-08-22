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
    const available = Boolean(state?.enabled && state.ready);
    return {
      provider,
      environment: settings.environment,
      available,
      reason: !state?.enabled
        ? "Not enabled"
        : !state.credentials.ok
          ? "Credentials missing"
          : !state.planIdsOk
            ? "Plan IDs incomplete"
            : null,
    };
  });
}


export async function loadCustomerBilling(workspaceId: string) {
  const db = await admin();
  const settings = await getBillingSettings();
  const entitlement = await getEntitlement(workspaceId);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [sub, invoices, transactions, accounts, leads, campaigns, members, sent] = await Promise.all([
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
    db.from("sending_accounts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    db.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    db.from("campaigns").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    db.from("workspace_members").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    db
      .from("campaign_messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "sent")
      .gte("sent_at", monthStart.toISOString()),
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
    usage: {
      emailsThisMonth: sent.count ?? 0,
      sendingAccounts: accounts.count ?? 0,
      leads: leads.count ?? 0,
      campaigns: campaigns.count ?? 0,
      users: members.count ?? 0,
    },
    limits: {
      emailsMonthly: entitlement.limits.max_emails_monthly,
      sendingAccounts: entitlement.limits.max_sending_accounts,
      leads: entitlement.limits.max_leads,
      campaigns: entitlement.limits.max_campaigns,
      users: entitlement.limits.max_users,
    },
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

  const priceId = await priceFor(input.provider, settings.environment, input.planId, input.interval);
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
  const result = await adapter.createCheckout({
    environment: settings.environment,
    priceId,
    workspaceId: input.workspaceId,
    planId: input.planId,
    interval: input.interval,
    email: customer?.email ?? profile?.email ?? null,
    customerId: customer?.external_customer_id ?? null,
    successUrl: `${base}/settings?tab=billing&checkout=success`,
    cancelUrl: `${base}/settings?tab=billing&checkout=cancelled`,
  });

  await writeAudit({
    workspaceId: input.workspaceId,
    userId: input.userId,
    provider: input.provider,
    environment: settings.environment,
    action: "checkout.started",
    detail: { planId: input.planId, interval: input.interval },
  });
  return result;
}

async function activeSubscription(workspaceId: string) {
  const db = await admin();
  const settings = await getBillingSettings();
  const { data } = await db
    .from("billing_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("environment", settings.environment)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No active subscription for this workspace.");
  return data;
}

export async function changePlan(input: {
  workspaceId: string;
  planId: string;
  interval: BillingInterval;
  userId: string;
}) {
  const sub = await activeSubscription(input.workspaceId);
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

export async function cancelForWorkspace(workspaceId: string, userId: string, immediately: boolean) {
  const sub = await activeSubscription(workspaceId);
  const settings = await getBillingSettings();
  const provider = sub.provider as BillingProvider;
  await getBillingAdapter(provider).cancel(
    settings.environment,
    sub.external_subscription_id,
    !immediately,
  );
  await writeAudit({
    workspaceId,
    userId,
    provider,
    environment: settings.environment,
    action: immediately ? "subscription.cancel_now" : "subscription.cancel_at_period_end",
  });
  return { ok: true };
}

export async function resumeForWorkspace(workspaceId: string, userId: string) {
  const sub = await activeSubscription(workspaceId);
  const settings = await getBillingSettings();
  const provider = sub.provider as BillingProvider;
  await getBillingAdapter(provider).resume(settings.environment, sub.external_subscription_id);
  await writeAudit({
    workspaceId,
    userId,
    provider,
    environment: settings.environment,
    action: "subscription.resume",
  });
  return { ok: true };
}

export async function portalForWorkspace(workspaceId: string, returnUrl: string) {
  const sub = await activeSubscription(workspaceId);
  const settings = await getBillingSettings();
  const provider = sub.provider as BillingProvider;
  const url = await getBillingAdapter(provider).portalUrl(settings.environment, {
    customerId: sub.external_customer_id ?? null,
    subscriptionId: sub.external_subscription_id ?? null,
    returnUrl,
  });
  return { url };
}
