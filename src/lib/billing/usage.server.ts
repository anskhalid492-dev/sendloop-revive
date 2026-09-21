/**
 * Centralized entitlement + usage enforcement. Server only.
 *
 * Every usage-consuming operation goes through this module:
 *   requireEntitlement(workspaceId, featureKey)
 *   checkUsageLimit(workspaceId, resource, amount)
 *   consumeUsage(workspaceId, resource, amount)      // atomic, metered
 *   getUsageSnapshot(workspaceId)                    // dashboard + diagnostics
 *
 * Derived resources are counted from live rows; metered resources use the
 * `consume_workspace_usage` database function so concurrent jobs can never
 * push a workspace past its plan allowance.
 */
import { admin } from "@/lib/billing/core.server";
import { getEntitlement, type Entitlement } from "@/lib/billing/entitlements.server";
import {
  RESOURCE_CATALOG,
  resourceDefinition,
  limitMessage,
  emailLimitMessage,
  type UsageResource,
} from "@/lib/billing/limits";

export class EntitlementError extends Error {
  code: "limit_reached" | "feature_locked" | "subscription_inactive" | "no_credits";
  resource: string | null;
  planName: string;
  used: number | null;
  limit: number | null;
  constructor(input: {
    message: string;
    code: EntitlementError["code"];
    planName: string;
    resource?: string | null;
    used?: number | null;
    limit?: number | null;
  }) {
    super(input.message);
    this.name = "EntitlementError";
    this.code = input.code;
    this.planName = input.planName;
    this.resource = input.resource ?? null;
    this.used = input.used ?? null;
    this.limit = input.limit ?? null;
  }
}

/** UTC month start — fallback metering anchor when there is no billing cycle. */
export function periodStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return d.toISOString().slice(0, 10);
}

/** Anchor used for allowances that never reset (free trial totals). */
const FREE_TRIAL_ANCHOR = "1970-01-01";

export type MeteringPeriod = {
  /** `period_start` key used in workspace_usage_counters. */
  key: string;
  start: string;
  end: string | null;
  /** false = fixed total allowance (free trial), true = resets every cycle. */
  resets: boolean;
};

/**
 * Email/AI allowances use the same period semantics as the database meter:
 * free trial is one fixed bucket, monthly subscriptions use the provider cycle,
 * and yearly/lifetime plans reset on each UTC calendar month.
 */
export async function getMeteringPeriod(workspaceId: string): Promise<MeteringPeriod> {
  const db = await admin();
  const { getBillingSettings } = await import("@/lib/billing/core.server");
  const settings = await getBillingSettings();
  const { data: sub } = await db
    .from("billing_subscriptions")
    .select("status, current_period_start, current_period_end, plan_id, billing_interval")
    .eq("workspace_id", workspaceId)
    .eq("environment", settings.environment)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A free plan is always metered as a single fixed allowance, even once a
  // subscription row exists — otherwise the trial cap would silently reset.
  let freePlan = true;
  let lifetimePlan = false;
  let yearlyPlan = false;
  if (sub?.plan_id) {
    const { data: plan } = await db
      .from("plans")
      .select("monthly_price, billing_type")
      .eq("id", sub.plan_id as string)
      .maybeSingle();
    lifetimePlan = plan?.billing_type === "lifetime" || sub.billing_interval === "lifetime";
    yearlyPlan = sub.billing_interval === "yearly";
    freePlan = !lifetimePlan && Number(plan?.monthly_price ?? 0) === 0;
  }

  const paidStates = ["trialing", "active", "past_due", "payment_failed", "paused"];
  if (sub && !freePlan && paidStates.includes(String(sub.status))) {
    if (lifetimePlan || yearlyPlan || !sub.current_period_start) {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return {
        key: start.toISOString().slice(0, 10),
        start: start.toISOString(),
        end: end.toISOString(),
        resets: true,
      };
    }


    const start = new Date(sub.current_period_start as string);
    const end = sub.current_period_end ? new Date(sub.current_period_end as string) : null;
    // An expired cycle HOLDS its usage bucket. Rolling into a fresh calendar
    // month here would hand out a second allowance whenever a provider webhook
    // is late, and would look to the customer like their usage had reset.
    // The bucket only moves when the subscription itself reports a new period.
    return {
      key: start.toISOString().slice(0, 10),
      start: start.toISOString(),
      end: end ? end.toISOString() : null,
      resets: true,
    };
  }

  // No paid subscription → free trial: fixed total allowance, never resets.
  return {
    key: FREE_TRIAL_ANCHOR,
    start: `${FREE_TRIAL_ANCHOR}T00:00:00.000Z`,
    end: null,
    resets: false,
  };
}

async function countRows(table: string, workspaceId: string, extra?: (q: any) => any) {
  const db = await admin();
  let q = db
    .from(table as any)
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (extra) q = extra(q);
  const { count } = await q;
  return count ?? 0;
}

/** UTC day key used for daily caps. */
function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function counterValue(workspaceId: string, resource: string, periodKey: string) {
  const db = await admin();
  const { data } = await db
    .from("workspace_usage_counters")
    .select("used")
    .eq("workspace_id", workspaceId)
    .eq("resource", resource)
    .eq("period_start", periodKey)
    .maybeSingle();
  return Number(data?.used ?? 0);
}

async function meteredUsed(workspaceId: string, resource: UsageResource) {
  if (resource === "emails_daily" || resource === "warmup_daily") {
    return counterValue(workspaceId, resource, dayKey());
  }
  const period = await getMeteringPeriod(workspaceId);
  return counterValue(workspaceId, resource, period.key);
}


/**
 * Current usage for one resource.
 *
 * Derived resources are ALWAYS counted from live rows, so deleting a lead,
 * mailbox, domain or campaign frees capacity immediately and no counter can
 * drift away from reality.
 */
export async function getUsage(workspaceId: string, resource: UsageResource): Promise<number> {
  switch (resource) {
    case "leads":
      return countRows("leads", workspaceId);
    case "campaigns":
      return countRows("campaigns", workspaceId);
    case "active_campaigns":
      // Only campaigns that are actually consuming an active slot. Completed,
      // archived, paused and draft campaigns release the slot immediately.
      return countRows("campaigns", workspaceId, (q) => q.in("status", ["active", "scheduled"]));
    case "sending_accounts": {
      // Counted across both mailbox tables so the figure matches what the
      // customer actually has connected, and matches the add-mailbox gate.
      const { countMailboxes } = await import("@/lib/billing/gates.server");
      return countMailboxes(workspaceId);
    }
    case "domains":
      return countRows("sending_domains", workspaceId);
    case "team_members":
      return countRows("workspace_members", workspaceId);
    case "automations":
      return countRows("automations", workspaceId);
    case "emails_monthly":
    case "emails_daily":
    case "ai_monthly":
    case "warmup_daily":
      return meteredUsed(workspaceId, resource);
    default:
      return 0;
  }
}


/**
 * Workspace count is billed per owner, not per workspace, so it cannot live in
 * the resource catalog. The most generous plan the owner holds wins.
 */
export async function checkWorkspaceQuota(userId: string): Promise<void> {
  const db = await admin();
  const { data: owned } = await db
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId);
  const workspaces = (owned ?? []) as { id: string }[];
  if (workspaces.length === 0) return;

  const entitlements = await Promise.all(workspaces.map((w) => getEntitlement(w.id)));
  let limit: number | null = 0;
  let planName = entitlements[0]?.planName ?? "current";
  for (const ent of entitlements) {
    const value = ent.limits["max_workspaces"];
    if (value === null || value === undefined) return; // unlimited on some plan
    if (limit !== null && Number(value) > limit) {
      limit = Number(value);
      planName = ent.planName;
    }
  }
  if (limit !== null && workspaces.length + 1 > limit) {
    throw new EntitlementError({
      code: "limit_reached",
      planName,
      resource: "workspaces",
      used: workspaces.length,
      limit,
      message: limitMessage("Workspaces", planName, workspaces.length, limit),
    });
  }
}


function limitFor(entitlement: Entitlement, resource: UsageResource): number | null {
  const def = resourceDefinition(resource);
  const value = entitlement.limits[def.limitKey];
  return value === null || value === undefined ? null : Number(value);
}

function assertActive(entitlement: Entitlement, action: string) {
  if (entitlement.state === "none") return; // default trial plan, no subscription yet
  if (!entitlement.active) {
    throw new EntitlementError({
      code: "subscription_inactive",
      planName: entitlement.planName,
      message: `Your ${entitlement.planName} subscription is ${entitlement.stateLabel.toLowerCase()}. Reactivate your plan to ${action}.`,
    });
  }
}

/**
 * Throws when the workspace cannot fit `amount` more of `resource`.
 * Use before creating a resource; pair with consumeUsage for metered ones.
 */
export async function checkUsageLimit(
  workspaceId: string,
  resource: UsageResource,
  amount = 1,
): Promise<{ entitlement: Entitlement; used: number; limit: number | null; remaining: number | null }> {
  const def = resourceDefinition(resource);
  const entitlement = await getEntitlement(workspaceId);
  assertActive(entitlement, `add more ${def.unit}`);

  // Metered resources are evaluated in the database so the monthly allowance,
  // the daily cap and the billing period all come from one authoritative place.
  if (def.kind === "metered") {
    const decision = await evaluateEntitlement(workspaceId, resource, amount);
    if (!decision.allowed) throw meterError(resource, { ...decision, planName: entitlement.planName });
    return {
      entitlement,
      used: decision.used,
      limit: decision.limit,
      remaining: decision.remaining,
    };
  }

  const limit = limitFor(entitlement, resource);
  const used = await getUsage(workspaceId, resource);

  if (limit !== null && used + amount > limit) {
    throw new EntitlementError({
      code: "limit_reached",
      planName: entitlement.planName,
      resource,
      used,
      limit,
      message:
        resource === "emails_monthly"
          ? emailLimitMessage(entitlement.planName, used, limit)
          : limitMessage(def.label, entitlement.planName, used, limit),
    });
  }
  return {
    entitlement,
    used,
    limit,
    remaining: limit === null ? null : Math.max(limit - used, 0),
  };
}

export type MeterDecision = {
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  dailyUsed: number;
  dailyLimit: number | null;
  periodStart: string;
  resets: boolean;
  resetAt: string | null;
  planName: string;
  reason: "plan_limit" | "daily_limit" | null;
};

function toDecision(raw: unknown, fallbackPlan: string): MeterDecision {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    allowed: Boolean(r["allowed"]),
    used: Number(r["used"] ?? 0),
    limit: num(r["limit"]),
    remaining: num(r["remaining"]),
    dailyUsed: Number(r["daily_used"] ?? 0),
    dailyLimit: num(r["daily_limit"]),
    periodStart: String(r["period_start"] ?? ""),
    resets: r["resets"] !== false,
    resetAt: (r["reset_at"] as string | null) ?? null,
    planName: (r["plan_name"] as string | null) ?? fallbackPlan,
    reason: (r["reason"] as MeterDecision["reason"]) ?? null,
  };
}

function meterError(resource: UsageResource, decision: MeterDecision): EntitlementError {
  const def = resourceDefinition(resource);
  const daily = decision.reason === "daily_limit";
  const used = daily ? decision.dailyUsed : decision.used;
  const limit = (daily ? decision.dailyLimit : decision.limit) ?? 0;
  const message = daily
    ? `You've reached your daily sending limit for the ${decision.planName} plan (${used.toLocaleString()} of ${limit.toLocaleString()} emails today). Sending resumes tomorrow, or upgrade your plan for a higher daily cap.`
    : resource === "emails_monthly"
      ? emailLimitMessage(decision.planName, used, limit)
      : limitMessage(def.label, decision.planName, used, limit);
  return new EntitlementError({
    code: "limit_reached",
    planName: decision.planName,
    resource,
    used,
    limit,
    message,
  });
}

/**
 * Reserves metered usage directly when the database meter refused under a plan
 * it resolved itself. Used only by the grant-aware override below.
 */
async function reserveCounter(
  workspaceId: string,
  resource: string,
  periodStart: string,
  used: number,
  amount: number,
) {
  const db = await admin();
  await db
    .from("workspace_usage_counters")
    .upsert(
      {
        workspace_id: workspaceId,
        resource,
        period_start: periodStart,
        used: used + amount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,resource,period_start" },
    );
}

/**
 * The database meter resolves the plan from the workspace subscription only, so
 * it never sees a plan a staff member granted manually. `getEntitlement` does.
 * When the two disagree we widen (never tighten) the allowance to the granted
 * plan, and reserve the usage ourselves if the meter had refused to.
 */
async function applyGrantAwareLimits(
  workspaceId: string,
  resource: UsageResource,
  amount: number,
  dryRun: boolean,
  decision: MeterDecision,
): Promise<MeterDecision> {
  const entitlement = await getEntitlement(workspaceId);
  const def = resourceDefinition(resource);
  const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const limit = toNum(entitlement.limits[def.limitKey]);
  const dailyLimit =
    resource === "emails_monthly" ? toNum(entitlement.limits["max_emails_daily"]) : decision.dailyLimit;

  // The entitlement is authoritative whenever it disagrees with the database
  // meter — that happens for admin-granted plans, which the meter cannot see.
  const differs =
    limit !== decision.limit ||
    dailyLimit !== decision.dailyLimit ||
    entitlement.planName !== decision.planName;
  if (!differs) return { ...decision, planName: entitlement.planName };

  const withinMonthly = limit === null || decision.used + amount <= limit;
  const withinDaily =
    resource !== "emails_monthly" || dailyLimit === null || decision.dailyUsed + amount <= dailyLimit;
  const allowed = withinMonthly && withinDaily;


  const next: MeterDecision = {
    ...decision,
    limit,
    dailyLimit,
    planName: entitlement.planName,
    allowed,
    reason: allowed ? null : !withinMonthly ? "plan_limit" : "daily_limit",
  };

  if (!dryRun && amount > 0 && allowed && !decision.allowed) {
    await reserveCounter(workspaceId, resource, decision.periodStart, decision.used, amount);
    next.used = decision.used + amount;
    if (resource === "emails_monthly") {
      await reserveCounter(workspaceId, "emails_daily", dayKey(), decision.dailyUsed, amount);
      next.dailyUsed = decision.dailyUsed + amount;
    }
  }
  next.remaining = limit === null ? null : Math.max(limit - next.used, 0);
  return next;
}

async function callMeter(
  workspaceId: string,
  resource: UsageResource,
  amount: number,
  dryRun: boolean,
  reason?: string | null,
): Promise<MeterDecision> {
  const db = await admin();
  const { getBillingSettings } = await import("@/lib/billing/core.server");
  const settings = await getBillingSettings();
  const { data, error } = await db.rpc("consume_workspace_usage_v2", {
    _workspace_id: workspaceId,
    _resource: resource,
    _amount: Math.trunc(amount),
    _environment: settings.environment,
    _dry_run: dryRun,
    _reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  return applyGrantAwareLimits(
    workspaceId,
    resource,
    Math.trunc(amount),
    dryRun,
    toDecision(data, "current"),
  );
}


/**
 * Read-only entitlement evaluation for a metered resource. The plan, billing
 * period and both caps are resolved inside the database, so no caller can ever
 * meter against a stale limit.
 */
export async function evaluateEntitlement(
  workspaceId: string,
  resource: UsageResource,
  amount = 1,
): Promise<MeterDecision> {
  return callMeter(workspaceId, resource, amount, true);
}

/**
 * Atomically reserves metered usage. Throws when the plan allowance is spent —
 * two concurrent jobs can never both slip past the cap. Monthly and daily caps
 * are checked and reserved in the same database call.
 */
export async function consumeUsage(
  workspaceId: string,
  resource: UsageResource,
  amount = 1,
  reason?: string,
) {
  const def = resourceDefinition(resource);
  if (def.kind !== "metered") throw new Error(`Resource ${resource} is not metered`);
  if (amount <= 0) return { used: 0, limit: null as number | null, remaining: null as number | null };

  const entitlement = await getEntitlement(workspaceId);
  assertActive(entitlement, `keep using ${def.unit}`);

  const decision = await callMeter(workspaceId, resource, amount, false, reason ?? null);
  if (!decision.allowed) throw meterError(resource, { ...decision, planName: entitlement.planName });
  return { used: decision.used, limit: decision.limit, remaining: decision.remaining };
}

/** Gives back reserved usage when the downstream action failed. */
export async function releaseUsage(
  workspaceId: string,
  resource: UsageResource,
  amount = 1,
  reason?: string,
) {
  if (amount <= 0) return;
  const db = await admin();
  const { getBillingSettings } = await import("@/lib/billing/core.server");
  const settings = await getBillingSettings();
  await db.rpc("release_workspace_usage_v2", {
    _workspace_id: workspaceId,
    _resource: resource,
    _amount: Math.trunc(amount),
    _environment: settings.environment,
    _reason: reason ?? null,
  });
}



/** Feature gate: throws unless the active plan includes `featureKey`. */
export async function requireEntitlement(workspaceId: string, featureKey: string) {
  const [{ featureDefinition }, entitlement] = await Promise.all([
    import("@/lib/billing/features"),
    getEntitlement(workspaceId),
  ]);
  const label = featureDefinition(featureKey)?.label ?? featureKey;
  if (entitlement.state !== "none" && !entitlement.active) {
    throw new EntitlementError({
      code: "subscription_inactive",
      planName: entitlement.planName,
      message: `Your ${entitlement.planName} subscription is ${entitlement.stateLabel.toLowerCase()}. Reactivate your plan to use ${label}.`,
    });
  }
  if (!entitlement.features[featureKey]) {
    throw new EntitlementError({
      code: "feature_locked",
      planName: entitlement.planName,
      resource: featureKey,
      message: `${label} isn't included in your ${entitlement.planName} plan. Upgrade to unlock it.`,
    });
  }
  return entitlement;
}

/** Credits gate: never allows a negative balance. */
export async function requireCredits(workspaceId: string, needed: number) {
  const { getCreditBalance } = await import("@/lib/billing/credits.server");
  const entitlement = await getEntitlement(workspaceId);
  const balance = await getCreditBalance(workspaceId);
  if (needed > 0 && balance.balance < needed) {
    throw new EntitlementError({
      code: "no_credits",
      planName: entitlement.planName,
      resource: "credits",
      used: balance.balance,
      limit: needed,
      message: `You have ${balance.balance.toLocaleString()} credits left on the ${entitlement.planName} plan and this action needs ${needed.toLocaleString()}. Upgrade or top up to continue.`,
    });
  }
  return balance;
}

export type UsageSnapshotRow = {
  key: UsageResource;
  label: string;
  unit: string;
  period: "total" | "month" | "day";
  used: number;
  limit: number | null;
  remaining: number | null;
  percent: number | null;
  overLimit: boolean;
  nearLimit: boolean;
};

export type UsageSnapshot = {
  workspaceId: string;
  plan: {
    id: string | null;
    name: string;
    state: string;
    stateLabel: string;
    active: boolean;
    inGrace: boolean;
    accessUntil: string | null;
  };
  period: { start: string; end: string | null; resets: boolean };
  credits: { included: number; balance: number };
  features: { key: string; label: string; category: string; enabled: boolean }[];
  usage: UsageSnapshotRow[];
  overLimitResources: string[];
  /** Resources currently exceeding the plan after a downgrade. */
  overages: { key: UsageResource; label: string; used: number; limit: number; excess: number }[];
};

/** Everything the customer usage dashboard renders. */
export async function getUsageSnapshot(workspaceId: string): Promise<UsageSnapshot> {
  const { FEATURE_CATALOG } = await import("@/lib/billing/features");
  const entitlement = await getEntitlement(workspaceId);
  const values = await Promise.all(RESOURCE_CATALOG.map((r) => getUsage(workspaceId, r.key)));

  const usage: UsageSnapshotRow[] = RESOURCE_CATALOG.map((def, index) => {
    const limit = limitFor(entitlement, def.key);
    const used = values[index] ?? 0;
    const percent = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      period: def.period,
      used,
      limit,
      remaining: limit === null ? null : Math.max(limit - used, 0),
      percent,
      overLimit: limit !== null && used >= limit,
      nearLimit: percent !== null && percent >= 80,
    };
  });

  const meter = await getMeteringPeriod(workspaceId);

  return {
    workspaceId,
    plan: {
      id: entitlement.planId,
      name: entitlement.planName,
      state: entitlement.state,
      stateLabel: entitlement.stateLabel,
      active: entitlement.active,
      inGrace: entitlement.inGrace,
      accessUntil: entitlement.accessUntil,
    },
    period: { start: meter.start, end: meter.end, resets: meter.resets },

    credits: entitlement.credits,
    features: FEATURE_CATALOG.map((f) => ({
      key: f.key,
      label: f.label,
      category: f.category,
      enabled: Boolean(entitlement.features[f.key]),
    })),
    usage,
    overLimitResources: usage.filter((u) => u.overLimit).map((u) => u.key),
    overages: usage
      .filter((u) => u.limit !== null && u.used > u.limit && u.period === "total")
      .map((u) => ({
        key: u.key,
        label: u.label,
        used: u.used,
        limit: u.limit as number,
        excess: u.used - (u.limit as number),
      })),
  };
}

