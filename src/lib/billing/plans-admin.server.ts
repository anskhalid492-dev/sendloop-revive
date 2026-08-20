/**
 * Admin plans / features / subscriptions / payments data access. Server only.
 * Reuses the existing plans, plan_features and billing_* tables.
 */
import { FEATURE_CATALOG } from "@/lib/billing/features";
import { admin, getBillingSettings, writeAudit } from "@/lib/billing/core.server";

const PLAN_COLUMNS = [
  "id",
  "name",
  "slug",
  "description",
  "tagline",
  "sort_order",
  "monthly_price",
  "yearly_price",
  "is_popular",
  "is_enterprise",
  "is_active",
  "monthly_credits",
  "max_workspaces",
  "max_users",
  "max_leads",
  "max_campaigns",
  "max_emails_monthly",
  "max_sending_accounts",
  "max_automations",
  "warmup_enabled",
  "unified_inbox_enabled",
  "analytics_enabled",
  "api_access",
  "priority_support",
  "custom_branding",
  "sso_enabled",
  "created_at",
  "updated_at",
].join(", ");

export type AdminPlan = Record<string, any> & {
  id: string;
  name: string;
  activeSubscribers: number;
  mrrCents: number;
  creditsAllocated: number;
};

export async function loadPlansConsole() {
  const db = await admin();
  const settings = await getBillingSettings();

  const [plansRes, subsRes, creditsRes, pricesRes] = await Promise.all([
    db.from("plans").select(PLAN_COLUMNS).order("sort_order", { ascending: true }),
    db
      .from("billing_subscriptions")
      .select("plan_id, status, amount_cents, billing_interval, workspace_id, environment")
      .eq("environment", settings.environment),
    db.from("workspace_credits").select("workspace_id, balance, allocated_total"),
    db.from("billing_plan_prices").select("*"),
  ]);
  if (plansRes.error) throw new Error(plansRes.error.message);

  const subs = subsRes.data ?? [];
  const credits = creditsRes.data ?? [];

  const plans: AdminPlan[] = (plansRes.data ?? []).map((plan: any) => {
    const planSubs = subs.filter(
      (s: any) => s.plan_id === plan.id && ["active", "trialing", "past_due"].includes(s.status),
    );
    const mrrCents = planSubs.reduce(
      (sum: number, s: any) =>
        sum + (s.billing_interval === "yearly" ? Math.round(s.amount_cents / 12) : s.amount_cents),
      0,
    );
    const workspaceIds = new Set(planSubs.map((s: any) => s.workspace_id));
    const creditsAllocated = credits
      .filter((c: any) => workspaceIds.has(c.workspace_id))
      .reduce((sum: number, c: any) => sum + Number(c.allocated_total ?? 0), 0);
    return { ...plan, activeSubscribers: planSubs.length, mrrCents, creditsAllocated };
  });

  return { environment: settings.environment, plans, prices: pricesRes.data ?? [] };
}

const NUMERIC_FIELDS = [
  "sort_order",
  "monthly_price",
  "yearly_price",
  "monthly_credits",
  "max_workspaces",
  "max_users",
  "max_leads",
  "max_campaigns",
  "max_emails_monthly",
  "max_sending_accounts",
  "max_automations",
];
const BOOLEAN_FIELDS = [
  "is_popular",
  "is_enterprise",
  "is_active",
  "warmup_enabled",
  "unified_inbox_enabled",
  "analytics_enabled",
  "api_access",
  "priority_support",
  "custom_branding",
  "sso_enabled",
];
const TEXT_FIELDS = ["name", "slug", "description", "tagline"];

function sanitizePlanInput(patch: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (TEXT_FIELDS.includes(key)) out[key] = value === "" ? null : value;
    else if (NUMERIC_FIELDS.includes(key))
      out[key] = value === null || value === "" ? null : Number(value);
    else if (BOOLEAN_FIELDS.includes(key)) out[key] = Boolean(value);
  }
  if (typeof out["name"] === "string" && !out["name"].trim()) throw new Error("Plan name is required.");
  return out;
}

export async function createPlan(patch: Record<string, unknown>, userId: string) {
  const db = await admin();
  const audit = await import("@/lib/billing/change-audit.server");
  const values = sanitizePlanInput(patch);
  if (!values["name"]) throw new Error("Plan name is required.");
  if (!values["slug"]) throw new Error("Plan slug is required.");
  const { data, error } = await db.from("plans").insert(values).select("id").single();
  if (error) throw new Error(error.message);
  await writeAudit({ userId, action: "plan.created", detail: { planId: data.id, name: values["name"] } });
  await audit.recordAdminChange({
    actorId: userId,
    action: "plan.created",
    targetType: "plan",
    targetId: data.id,
    targetLabel: String(values["name"]),
    before: null,
    after: await audit.planSnapshot(data.id),
  });
  return { id: data.id as string };
}

export async function updatePlan(planId: string, patch: Record<string, unknown>, userId: string) {
  const db = await admin();
  const audit = await import("@/lib/billing/change-audit.server");
  const values = sanitizePlanInput(patch);
  const before = await audit.planSnapshot(planId);
  const { error } = await db.from("plans").update(values).eq("id", planId);
  if (error) throw new Error(error.message);
  const after = await audit.planSnapshot(planId);
  await writeAudit({ userId, action: "plan.updated", detail: { planId, fields: Object.keys(values) } });
  await audit.recordAdminChange({
    actorId: userId,
    action: "plan.updated",
    targetType: "plan",
    targetId: planId,
    targetLabel: (after?.["name"] as string | undefined) ?? null,
    before,
    after,
  });
  return { ok: true };
}

export async function setPlanActive(planId: string, active: boolean, userId: string) {
  const db = await admin();
  const audit = await import("@/lib/billing/change-audit.server");
  let subscribers = 0;
  if (!active) {
    const settings = await getBillingSettings();
    const { count } = await db
      .from("billing_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", planId)
      .eq("environment", settings.environment)
      .in("status", ["active", "trialing", "past_due"]);
    subscribers = count ?? 0;
    if (subscribers > 0) {
      // Deactivation only hides the plan from new checkouts; existing
      // subscriptions keep their entitlements until the provider changes them.
      await writeAudit({
        userId,
        action: "plan.deactivated_with_subscribers",
        detail: { planId, subscribers: count },
      });
    }
  }
  const before = await audit.planSnapshot(planId);
  const { error } = await db.from("plans").update({ is_active: active }).eq("id", planId);
  if (error) throw new Error(error.message);
  const after = await audit.planSnapshot(planId);
  await writeAudit({ userId, action: active ? "plan.activated" : "plan.deactivated", detail: { planId } });
  await audit.recordAdminChange({
    actorId: userId,
    action: active ? "plan.activated" : "plan.deactivated",
    targetType: "plan",
    targetId: planId,
    targetLabel: (after?.["name"] as string | undefined) ?? null,
    before,
    after,
    detail: { activeSubscribers: subscribers },
  });
  return { ok: true };
}


/* --------------------------------------------------------- feature matrix */

export async function loadFeatureMatrix() {
  const db = await admin();
  const [plansRes, featuresRes] = await Promise.all([
    db.from("plans").select(PLAN_COLUMNS).order("sort_order", { ascending: true }),
    db.from("plan_features").select("id, plan_id, feature_key, included, name, category, value"),
  ]);
  if (plansRes.error) throw new Error(plansRes.error.message);

  const rows = featuresRes.data ?? [];
  const plans = (plansRes.data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    isActive: p.is_active !== false,
  }));

  const matrix = FEATURE_CATALOG.map((feature) => ({
    key: feature.key,
    label: feature.label,
    category: feature.category,
    description: feature.description,
    backedByColumn: feature.column,
    values: Object.fromEntries(
      (plansRes.data ?? []).map((plan: any) => {
        if (feature.column) return [plan.id, Boolean(plan[feature.column])];
        const row = rows.find((r: any) => r.plan_id === plan.id && r.feature_key === feature.key);
        return [plan.id, row ? Boolean(row.included) : feature.fallback];
      }),
    ) as Record<string, boolean>,
  }));

  return { plans, matrix };
}

export async function setPlanFeature(
  input: { planId: string; featureKey: string; enabled: boolean },
  userId: string,
) {
  const feature = FEATURE_CATALOG.find((f) => f.key === input.featureKey);
  if (!feature) throw new Error(`Unknown feature: ${input.featureKey}`);
  const db = await admin();
  const audit = await import("@/lib/billing/change-audit.server");
  const before = await audit.featureSnapshot(input.planId, input.featureKey);

  if (feature.column) {
    const { error } = await db
      .from("plans")
      .update({ [feature.column]: input.enabled })
      .eq("id", input.planId);
    if (error) throw new Error(error.message);
  } else {
    const { data: existing } = await db
      .from("plan_features")
      .select("id")
      .eq("plan_id", input.planId)
      .eq("feature_key", input.featureKey)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await db
        .from("plan_features")
        .update({ included: input.enabled })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("plan_features").insert({
        plan_id: input.planId,
        feature_key: input.featureKey,
        name: feature.label,
        category: feature.category,
        included: input.enabled,
        sort_order: 100,
      });
      if (error) throw new Error(error.message);
    }
  }

  await writeAudit({
    userId,
    action: input.enabled ? "plan_feature.enabled" : "plan_feature.disabled",
    detail: { planId: input.planId, featureKey: input.featureKey },
  });
  const { data: plan } = await db.from("plans").select("name").eq("id", input.planId).maybeSingle();
  await audit.recordAdminChange({
    actorId: userId,
    action: input.enabled ? "plan_feature.enabled" : "plan_feature.disabled",
    targetType: "plan_feature",
    targetId: input.planId,
    targetLabel: `${plan?.name ?? "Plan"} · ${feature.label}`,
    before,
    after: await audit.featureSnapshot(input.planId, input.featureKey),
  });
  return { ok: true };


}

/* ---------------------------------------------------------- subscriptions */

export async function loadSubscriptions(filter: {
  status?: string | null;
  provider?: string | null;
  search?: string | null;
}) {
  const db = await admin();
  let q = db
    .from("billing_subscriptions")
    .select("*, workspaces(id, name, slug, owner_id), plans(name, slug)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.provider) q = q.eq("provider", filter.provider);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const ownerIds = Array.from(
    new Set((data ?? []).map((r: any) => r.workspaces?.owner_id).filter(Boolean)),
  );
  const owners = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profiles } = await db.from("profiles").select("id, email").in("id", ownerIds);
    for (const p of profiles ?? []) owners.set(p.id, p.email);
  }

  const term = (filter.search ?? "").trim().toLowerCase();
  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    workspaceName: r.workspaces?.name ?? "—",
    customerEmail: r.workspaces?.owner_id ? (owners.get(r.workspaces.owner_id) ?? null) : null,
    planId: r.plan_id,
    planName: r.plans?.name ?? "—",
    status: r.status,
    interval: r.billing_interval,
    amountCents: r.amount_cents ?? 0,
    currency: r.currency ?? "usd",
    provider: r.provider,
    environment: r.environment,
    externalSubscriptionId: r.external_subscription_id,
    startedAt: r.created_at,
    currentPeriodEnd: r.current_period_end,
    trialEndsAt: r.trial_ends_at,
    cancelAtPeriodEnd: r.cancel_at_period_end,
    cancelledAt: r.cancelled_at,
    updatedAt: r.updated_at,
  }));

  return term
    ? rows.filter((r: any) =>
        [r.workspaceName, r.customerEmail, r.externalSubscriptionId, r.planName]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : rows;
}

export async function loadSubscriptionDetail(subscriptionId: string) {
  const db = await admin();
  const { data: sub, error } = await db
    .from("billing_subscriptions")
    .select("*, workspaces(id, name, slug), plans(name, slug)")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sub) throw new Error("Subscription not found");

  const [tx, invoices, audit] = await Promise.all([
    db
      .from("billing_transactions")
      .select("*")
      .eq("workspace_id", sub.workspace_id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    db
      .from("billing_invoices")
      .select("*")
      .eq("workspace_id", sub.workspace_id)
      .order("issued_at", { ascending: false })
      .limit(50),
    db
      .from("billing_audit_log")
      .select("*")
      .eq("workspace_id", sub.workspace_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    subscription: {
      id: sub.id,
      workspaceId: sub.workspace_id,
      workspaceName: sub.workspaces?.name ?? "—",
      planName: sub.plans?.name ?? "—",
      planId: sub.plan_id,
      status: sub.status,
      interval: sub.billing_interval,
      amountCents: sub.amount_cents ?? 0,
      currency: sub.currency ?? "usd",
      provider: sub.provider,
      environment: sub.environment,
      externalSubscriptionId: sub.external_subscription_id,
      externalCustomerId: sub.external_customer_id,
      startedAt: sub.created_at,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      trialEndsAt: sub.trial_ends_at,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      cancelledAt: sub.cancelled_at,
      accessUntil: sub.access_until,
      graceUntil: sub.grace_until,
    },
    transactions: tx.data ?? [],
    invoices: invoices.data ?? [],
    history: audit.data ?? [],
  };
}

/* ------------------------------------------------------- payments console */

export async function loadPayments(filter: {
  status?: string | null;
  provider?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
}) {
  const db = await admin();
  const settings = await getBillingSettings();

  let q = db
    .from("billing_transactions")
    .select("*, workspaces(name, owner_id)")
    .eq("environment", settings.environment)
    .order("occurred_at", { ascending: false })
    .limit(300);
  if (filter.provider) q = q.eq("provider", filter.provider);
  if (filter.status === "refunded") q = q.eq("kind", "refund");
  else if (filter.status) q = q.eq("status", filter.status);
  if (filter.from) q = q.gte("occurred_at", filter.from);
  if (filter.to) q = q.lte("occurred_at", filter.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const ownerIds = Array.from(
    new Set((data ?? []).map((r: any) => r.workspaces?.owner_id).filter(Boolean)),
  );
  const owners = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profiles } = await db.from("profiles").select("id, email").in("id", ownerIds);
    for (const p of profiles ?? []) owners.set(p.id, p.email);
  }

  const invoiceIds = Array.from(new Set((data ?? []).map((r: any) => r.subscription_id).filter(Boolean)));
  const invoices = invoiceIds.length
    ? ((
        await db
          .from("billing_invoices")
          .select("id, subscription_id, number, hosted_url")
          .in("subscription_id", invoiceIds)
      ).data ?? [])
    : [];

  const term = (filter.search ?? "").trim().toLowerCase();
  const rows = (data ?? []).map((r: any) => {
    const invoice = invoices.find((i: any) => i.subscription_id === r.subscription_id);
    return {
      id: r.id,
      occurredAt: r.occurred_at,
      workspaceId: r.workspace_id,
      workspaceName: r.workspaces?.name ?? "—",
      customerEmail: r.workspaces?.owner_id ? (owners.get(r.workspaces.owner_id) ?? null) : null,
      amountCents: r.amount_cents ?? 0,
      currency: r.currency ?? "usd",
      status: r.status,
      kind: r.kind,
      provider: r.provider,
      externalTransactionId: r.external_transaction_id,
      description: r.description ?? null,
      invoiceNumber: invoice?.number ?? null,
      invoiceUrl: invoice?.hosted_url ?? null,
      refunded: r.kind === "refund",
    };
  });

  const filtered = term
    ? rows.filter((r: any) =>
        [r.workspaceName, r.customerEmail, r.externalTransactionId, r.invoiceNumber]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : rows;

  const { count: activeSubs } = await db
    .from("billing_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("environment", settings.environment)
    .in("status", ["active", "trialing", "past_due"]);

  const totals = {
    revenueCents: filtered
      .filter((r: any) => r.status !== "failed")
      .reduce((s: number, r: any) => s + (r.refunded ? -r.amountCents : r.amountCents), 0),
    successful: filtered.filter((r: any) => r.status === "succeeded" || r.status === "paid").length,
    failed: filtered.filter((r: any) => r.status === "failed").length,
    refunds: filtered.filter((r: any) => r.refunded).length,
    refundedCents: filtered
      .filter((r: any) => r.refunded)
      .reduce((s: number, r: any) => s + r.amountCents, 0),
    activeSubscriptions: activeSubs ?? 0,
  };

  return { environment: settings.environment, rows: filtered, totals };
}
