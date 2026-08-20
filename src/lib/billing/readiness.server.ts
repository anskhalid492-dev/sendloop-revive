/**
 * Provider setup readiness + test-mode/live-mode checklist. Server only.
 *
 * A provider may only be enabled — and may only be offered to customers at
 * checkout — when its credentials exist for that exact environment AND every
 * paid plan has a correctly formatted provider ID for both billing cycles in
 * that same environment. Test and live are validated independently so a live
 * rollout can never inherit test IDs.
 */
import type { BillingEnvironment, BillingProvider } from "@/lib/billing/model";
import {
  BILLING_ENVIRONMENTS,
  BILLING_PROVIDERS,
  BILLING_TEST_FLOWS,
  PROVIDER_ID_RULES,
  PROVIDER_REQUIREMENTS,
  PROVIDER_TEST_EVENTS,
  secretName,
} from "@/lib/billing/model";
import { admin, providerCredentials } from "@/lib/billing/core.server";

export type PlanIdCheck = {
  planId: string;
  planName: string;
  monthly: { value: string | null; ok: boolean; problem: string | null };
  yearly: { value: string | null; ok: boolean; problem: string | null };
};

export type ProviderReadiness = {
  provider: BillingProvider;
  environment: BillingEnvironment;
  enabled: boolean;
  credentials: { ok: boolean; missing: string[] };
  webhook: { path: string; lastReceivedAt: string | null; verifiedEver: boolean };
  plans: PlanIdCheck[];
  planIdsOk: boolean;
  ready: boolean;
  blockers: string[];
};

async function paidPlans() {
  const db = await admin();
  const { data } = await db
    .from("plans")
    .select("id, name, monthly_price, yearly_price, is_enterprise, sort_order")
    .order("sort_order");
  return (data ?? []).filter(
    (p: any) => !p.is_enterprise && ((p.monthly_price ?? 0) > 0 || (p.yearly_price ?? 0) > 0),
  );
}

function checkId(provider: BillingProvider, value: string | null | undefined) {
  const rule = PROVIDER_ID_RULES[provider];
  if (!value || !value.trim())
    return { value: null, ok: false, problem: `Missing ${rule.label.toLowerCase()}` };
  if (!rule.test(value))
    return { value, ok: false, problem: `Invalid format — ${rule.hint}` };
  return { value, ok: true, problem: null };
}

/** Validates one provider/environment pair. */
export async function evaluateProvider(
  provider: BillingProvider,
  environment: BillingEnvironment,
  ctx?: { plans?: any[]; providerRows?: any[]; prices?: any[]; hooks?: any[] },
): Promise<ProviderReadiness> {
  const db = await admin();
  const plans = ctx?.plans ?? (await paidPlans());
  const providerRows =
    ctx?.providerRows ?? ((await db.from("billing_providers").select("*")).data ?? []);
  const prices =
    ctx?.prices ??
    ((
      await db
        .from("billing_plan_prices")
        .select("plan_id, provider, environment, billing_interval, external_price_id")
    ).data ?? []);
  const hooks =
    ctx?.hooks ??
    ((
      await db
        .from("billing_webhook_events")
        .select("provider, environment, event_type, status, signature_ok, received_at")
        .order("received_at", { ascending: false })
        .limit(1000)
    ).data ?? []);

  const creds = providerCredentials(provider, environment);
  const required = PROVIDER_REQUIREMENTS[provider];
  const missing: string[] = [];
  if (!creds.apiKey) missing.push(secretName(required.secrets[0]!.name, environment));
  if (!creds.webhookSecret) missing.push(secretName(required.secrets[1]!.name, environment));
  if (provider === "lemonsqueezy" && !creds.storeId)
    missing.push(secretName("LEMONSQUEEZY_STORE_ID", environment));

  const planChecks: PlanIdCheck[] = plans.map((plan: any) => {
    const find = (interval: "monthly" | "yearly") =>
      prices.find(
        (p: any) =>
          p.plan_id === plan.id &&
          p.provider === provider &&
          p.environment === environment &&
          p.billing_interval === interval,
      )?.external_price_id ?? null;
    const monthly =
      (plan.monthly_price ?? 0) > 0
        ? checkId(provider, find("monthly"))
        : { value: null, ok: true, problem: null };
    const yearly =
      (plan.yearly_price ?? 0) > 0
        ? checkId(provider, find("yearly"))
        : { value: null, ok: true, problem: null };
    return { planId: plan.id, planName: plan.name, monthly, yearly };
  });

  const scopedHooks = hooks.filter(
    (h: any) => h.provider === provider && h.environment === environment,
  );
  const row = providerRows.find(
    (r: any) => r.provider === provider && r.environment === environment,
  );

  const planIdsOk = planChecks.length > 0 && planChecks.every((p) => p.monthly.ok && p.yearly.ok);
  const blockers: string[] = [];
  if (missing.length) blockers.push(`Missing credentials: ${missing.join(", ")}`);
  if (planChecks.length === 0) blockers.push("No paid plans configured yet.");
  for (const p of planChecks) {
    if (!p.monthly.ok) blockers.push(`${p.planName} · monthly — ${p.monthly.problem}`);
    if (!p.yearly.ok) blockers.push(`${p.planName} · yearly — ${p.yearly.problem}`);
  }

  return {
    provider,
    environment,
    enabled: row?.enabled === true,
    credentials: { ok: missing.length === 0, missing },
    webhook: {
      path: required.webhookPath,
      lastReceivedAt: row?.last_webhook_at ?? scopedHooks[0]?.received_at ?? null,
      verifiedEver: scopedHooks.some((h: any) => h.signature_ok),
    },
    plans: planChecks,
    planIdsOk,
    ready: missing.length === 0 && planIdsOk,
    blockers,
  };
}

/** All provider/environment combinations, evaluated from one set of reads. */
export async function loadReadiness() {
  const db = await admin();
  const [plans, providerRows, prices, hooks] = await Promise.all([
    paidPlans(),
    db.from("billing_providers").select("*"),
    db
      .from("billing_plan_prices")
      .select("plan_id, provider, environment, billing_interval, external_price_id"),
    db
      .from("billing_webhook_events")
      .select("provider, environment, event_type, status, signature_ok, received_at")
      .order("received_at", { ascending: false })
      .limit(1000),
  ]);

  const ctx = {
    plans,
    providerRows: providerRows.data ?? [],
    prices: prices.data ?? [],
    hooks: hooks.data ?? [],
  };
  const out: ProviderReadiness[] = [];
  for (const provider of BILLING_PROVIDERS)
    for (const environment of BILLING_ENVIRONMENTS)
      out.push(await evaluateProvider(provider, environment, ctx));
  return out;
}

/** Throws when a provider is not fully configured for the given environment. */
export async function assertProviderReady(
  provider: BillingProvider,
  environment: BillingEnvironment,
) {
  const state = await evaluateProvider(provider, environment);
  if (!state.ready)
    throw new Error(
      `${provider} is not ready for ${environment} mode:\n• ${state.blockers.join("\n• ")}`,
    );
  return state;
}

/* ------------------------------------------------------------- checklist */

export type ProviderChecklist = {
  provider: BillingProvider;
  environment: BillingEnvironment;
  events: {
    type: string;
    label: string;
    processed: boolean;
    failed: boolean;
    lastAt: string | null;
    error: string | null;
  }[];
  flows: { key: string; label: string; detail: string; done: boolean }[];
  completion: number;
};

export async function loadTestChecklist(): Promise<ProviderChecklist[]> {
  const db = await admin();
  const [hooks, subs, tx, invoices] = await Promise.all([
    db
      .from("billing_webhook_events")
      .select("provider, environment, event_type, status, error, signature_ok, received_at")
      .order("received_at", { ascending: false })
      .limit(2000),
    db.from("billing_subscriptions").select("provider, environment, status"),
    db.from("billing_transactions").select("provider, environment, kind, status"),
    db.from("billing_invoices").select("provider, environment"),
  ]);

  const hookRows = hooks.data ?? [];
  const subRows = subs.data ?? [];
  const txRows = tx.data ?? [];
  const invoiceRows = invoices.data ?? [];

  const result: ProviderChecklist[] = [];
  for (const provider of BILLING_PROVIDERS) {
    for (const environment of BILLING_ENVIRONMENTS) {
      const scoped = hookRows.filter(
        (h: any) => h.provider === provider && h.environment === environment,
      );
      const events = PROVIDER_TEST_EVENTS[provider].map((e) => {
        const matches = scoped.filter((h: any) => (h.event_type ?? "").startsWith(e.type));
        const ok = matches.find((h: any) => h.status === "processed" && h.signature_ok);
        const bad = matches.find((h: any) => h.status === "failed" || !h.signature_ok);
        return {
          type: e.type,
          label: e.label,
          processed: Boolean(ok),
          failed: !ok && Boolean(bad),
          lastAt: matches[0]?.received_at ?? null,
          error: bad?.error ?? null,
        };
      });

      const s = subRows.filter(
        (r: any) => r.provider === provider && r.environment === environment,
      );
      const t = txRows.filter((r: any) => r.provider === provider && r.environment === environment);
      const done: Record<string, boolean> = {
        checkout: s.length > 0,
        active: s.some((r: any) => ["active", "trialing"].includes(r.status)),
        payment: t.some((r: any) => r.kind === "payment" && r.status !== "failed"),
        invoice: invoiceRows.some(
          (r: any) => r.provider === provider && r.environment === environment,
        ),
        failed:
          t.some((r: any) => r.status === "failed") ||
          events.some((e) => e.processed && e.type.includes("fail")),
        refund: t.some((r: any) => r.kind === "refund"),
        cancel: s.some((r: any) => ["cancelled", "expired"].includes(r.status)),
      };
      const flows = BILLING_TEST_FLOWS.map((f) => ({ ...f, done: done[f.key] === true }));

      const total = events.length + flows.length;
      const passed = events.filter((e) => e.processed).length + flows.filter((f) => f.done).length;
      result.push({
        provider,
        environment,
        events,
        flows,
        completion: total ? Math.round((passed / total) * 100) : 0,
      });
    }
  }
  return result;
}
