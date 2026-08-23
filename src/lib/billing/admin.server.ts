/** Admin billing console data access. Server only. */
import type { BillingEnvironment, BillingInterval, BillingProvider } from "@/lib/billing/model";
import { BILLING_ENVIRONMENTS, BILLING_PROVIDERS, PROVIDER_ID_RULES } from "@/lib/billing/model";
import { admin, getBillingSettings, isConfigured, writeAudit } from "@/lib/billing/core.server";

export async function loadConsole() {
  const db = await admin();
  const settings = await getBillingSettings();

  const [providerRows, plans, prices, subs, tx, invoices, hooks] = await Promise.all([
    db.from("billing_providers").select("*"),
    db.from("plans").select("id, name, slug, monthly_price, yearly_price, sort_order").order("sort_order"),
    db.from("billing_plan_prices").select("*"),
    db.from("billing_subscriptions").select("id, status, amount_cents, currency, billing_interval, environment, current_period_start, created_at"),
    db
      .from("billing_transactions")
      .select("amount_cents, kind, status, occurred_at, environment, subscription_id")
      .gte("occurred_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    db.from("billing_invoices").select("id", { count: "exact", head: true }),
    db
      .from("billing_webhook_events")
      .select("status, signature_ok, received_at")
      .order("received_at", { ascending: false })
      .limit(200),
  ]);

  const activeSubs = (subs.data ?? []).filter(
    (s: any) => s.environment === settings.environment && ["active", "trialing", "past_due"].includes(s.status),
  );
  const mrrCents = activeSubs.reduce(
    (sum: number, s: any) =>
      sum + (s.billing_interval === "yearly" ? Math.round(s.amount_cents / 12) : s.amount_cents),
    0,
  );
  const windowStart = Date.now() - 30 * 864e5;
  const collected = (tx.data ?? []).filter(
    (t: any) => t.environment === settings.environment && t.status !== "failed",
  );
  const collectedCents = collected.reduce(
    (sum: number, t: any) => sum + (t.kind === "refund" ? -t.amount_cents : t.amount_cents),
    0,
  );
  // Manually granted plans never create a payment transaction, so recognise the
  // portion of their subscription value that falls inside the 30-day window.
  const collectedSubIds = new Set(
    collected.map((t: any) => t.subscription_id).filter(Boolean) as string[],
  );
  const recognizedCents = activeSubs
    .filter((s: any) => s.status !== "past_due" && !collectedSubIds.has(s.id))
    .reduce((sum: number, s: any) => {
      const monthly =
        s.billing_interval === "yearly" ? s.amount_cents / 12 : (s.amount_cents ?? 0);
      const periodStart = new Date(s.current_period_start ?? s.created_at).getTime();
      // Periods charged up-front inside the window count in full.
      if (periodStart >= windowStart) return sum + (s.amount_cents ?? 0);
      const overlapDays = (Date.now() - windowStart) / 864e5;
      return sum + (monthly * Math.min(overlapDays, 30.436875)) / 30.436875;
    }, 0);
  const revenue30 = Math.round(collectedCents + recognizedCents);

  const providers = [];
  for (const provider of BILLING_PROVIDERS) {
    for (const environment of BILLING_ENVIRONMENTS) {
      const row = (providerRows.data ?? []).find(
        (r: any) => r.provider === provider && r.environment === environment,
      );
      providers.push({
        provider,
        environment,
        enabled: row?.is_enabled === true,
        configured: await isConfigured(provider, environment),
        lastWebhookAt: row?.last_webhook_at ?? null,
        lastError: row?.last_error ?? null,
      });
    }
  }

  const recentHooks = hooks.data ?? [];
  return {
    settings,
    providers,
    plans: plans.data ?? [],
    prices: prices.data ?? [],
    stats: {
      mrrCents,
      activeSubscriptions: activeSubs.length,
      revenue30Cents: revenue30,
      invoices: invoices.count ?? 0,
      failedWebhooks: recentHooks.filter((h: any) => h.status === "failed" || !h.signature_ok).length,
      lastWebhookAt: recentHooks[0]?.received_at ?? null,
    },
  };
}

export async function setProviderEnabled(
  provider: BillingProvider,
  environment: BillingEnvironment,
  enabled: boolean,
  userId: string,
) {
  if (enabled) {
    const { assertProviderReady } = await import("@/lib/billing/readiness.server");
    await assertProviderReady(provider, environment);
  }
  const db = await admin();
  const { error } = await db
    .from("billing_providers")
    .upsert({ provider, environment, is_enabled: enabled }, { onConflict: "provider,environment" });
  if (error) throw new Error(error.message);
  await writeAudit({
    userId,
    provider,
    environment,
    action: enabled ? "provider.enabled" : "provider.disabled",
  });
  return { ok: true };
}

export async function savePlanPrice(
  input: {
    planId: string;
    provider: BillingProvider;
    environment: BillingEnvironment;
    interval: BillingInterval;
    externalPriceId: string;
    currency?: string | undefined;
  },
  userId: string,
) {
  const rule = PROVIDER_ID_RULES[input.provider];
  if (!rule.test(input.externalPriceId))
    throw new Error(`Invalid ${rule.label} for ${input.provider}: ${rule.hint}`);

  // A lifetime plan may only be mapped to a genuinely one-time Stripe price —
  // saving a recurring price here would silently turn the deal into a
  // subscription at checkout.
  if (input.provider === "stripe" && input.interval === "lifetime") {
    const { stripeCall } = await import("@/lib/billing/providers.server");
    const price = await stripeCall(
      input.environment,
      `prices/${encodeURIComponent(input.externalPriceId)}`,
      undefined,
      "GET",
    );
    if (price?.recurring)
      throw new Error(
        "That Stripe price is recurring. The lifetime plan needs a one-time (non-recurring) price.",
      );
    if (price?.active === false) throw new Error("That Stripe price is archived in Stripe.");
  }

  const db = await admin();
  const { error } = await db.from("billing_plan_prices").upsert(
    {
      plan_id: input.planId,
      provider: input.provider,
      environment: input.environment,
      billing_interval: input.interval,
      external_price_id: input.externalPriceId,
      currency: input.currency ?? "usd",
    },
    { onConflict: "plan_id,provider,environment,billing_interval" },
  );
  if (error) throw new Error(error.message);
  await writeAudit({
    userId,
    provider: input.provider,
    environment: input.environment,
    action: "plan_price.saved",
    detail: { planId: input.planId, interval: input.interval },
  });
  return { ok: true };
}

export async function removePlanPrice(id: string, userId: string) {
  const db = await admin();
  const { error } = await db.from("billing_plan_prices").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await writeAudit({ userId, action: "plan_price.deleted", detail: { id } });
  return { ok: true };
}

export async function listRecords(
  kind: "subscriptions" | "transactions" | "invoices" | "webhooks" | "audit",
  search: string,
) {
  const db = await admin();
  const term = search.trim();

  if (kind === "subscriptions") {
    let q = db
      .from("billing_subscriptions")
      .select("*, workspaces(name), plans(name)")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (term) q = q.ilike("external_subscription_id", `%${term}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  if (kind === "transactions") {
    let q = db
      .from("billing_transactions")
      .select("*, workspaces(name)")
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (term) q = q.ilike("external_transaction_id", `%${term}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  if (kind === "invoices") {
    let q = db
      .from("billing_invoices")
      .select("*, workspaces(name)")
      .order("issued_at", { ascending: false })
      .limit(200);
    if (term) q = q.ilike("external_invoice_id", `%${term}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  if (kind === "webhooks") {
    let q = db
      .from("billing_webhook_events")
      .select("id, provider, environment, event_id, event_type, signature_ok, status, error, received_at, processed_at, retry_count")
      .order("received_at", { ascending: false })
      .limit(200);
    if (term) q = q.ilike("event_id", `%${term}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  const { data, error } = await db
    .from("billing_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}
