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
const LIFETIME_ANCHOR = "1970-01-01";

export type MeteringPeriod = {
  /** `period_start` key used in workspace_usage_counters. */
  key: string;
  start: string;
  end: string | null;
  /** false = fixed total allowance (free trial), true = resets every cycle. */
  resets: boolean;
};

/**
 * Email/AI allowances reset on the BILLING CYCLE, not the calendar month.
 * Paid workspaces are metered against the subscription period; free-trial
 * workspaces get a single lifetime bucket that never resets.
 */
export async function getMeteringPeriod(workspaceId: string): Promise<MeteringPeriod> {
  const db = await admin();
  const { getBillingSettings } = await import("@/lib/billing/core.server");
  const settings = await getBillingSettings();
  const { data: sub } = await db
    .from("billing_subscriptions")
    .select("status, current_period_start, current_period_end, plan_id")
    .eq("workspace_id", workspaceId)
    .eq("environment", settings.environment)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const paidStates = ["trialing", "active", "past_due", "payment_failed", "paused"];
  if (sub && paidStates.includes(String(sub.status)) && sub.current_period_start) {
    const start = new Date(sub.current_period_start as string);
    const end = sub.current_period_end ? new Date(sub.current_period_end as string) : null;
    // Roll forward if the provider webhook is late so a stale cycle never
    // gives away a second allowance.
    if (end && end.getTime() < Date.now()) {
      return { key: periodStart(), start: `${periodStart()}T00:00:00.000Z`, end: null, resets: true };
    }
    return {
      key: start.toISOString().slice(0, 10),
      start: start.toISOString(),
      end: end ? end.toISOString() : null,
      resets: true,
    };
  }

  // No paid subscription → free trial: fixed total allowance, never resets.
  return {
    key: LIFETIME_ANCHOR,
    start: `${LIFETIME_ANCHOR}T00:00:00.000Z`,
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

async function meteredUsed(workspaceId: string, resource: UsageResource) {
  const db = await admin();
  const period = await getMeteringPeriod(workspaceId);
  const { data } = await db
    .from("workspace_usage_counters")
    .select("used")
    .eq("workspace_id", workspaceId)
    .eq("resource", resource)
    .eq("period_start", period.key)
    .maybeSingle();
  return Number(data?.used ?? 0);
}


/** Current usage for one resource. */
export async function getUsage(workspaceId: string, resource: UsageResource): Promise<number> {
  switch (resource) {
    case "leads":
      return countRows("leads", workspaceId);
    case "campaigns":
      return countRows("campaigns", workspaceId);
    case "active_campaigns":
      return countRows("campaigns", workspaceId, (q) => q.in("status", ["active", "scheduled"]));
    case "sending_accounts":
      return countRows("sending_accounts", workspaceId);
    case "domains":
      return countRows("sending_domains", workspaceId);
    case "team_members":
      return countRows("workspace_members", workspaceId);
    case "automations":
      return countRows("automations", workspaceId);
    case "emails_monthly":
    case "ai_monthly":
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

/**
 * Atomically reserves metered usage. Throws when the plan allowance is spent —
 * two concurrent jobs can never both slip past the cap.
 */
export async function consumeUsage(workspaceId: string, resource: UsageResource, amount = 1) {
  const def = resourceDefinition(resource);
  if (def.kind !== "metered") throw new Error(`Resource ${resource} is not metered`);
  if (amount <= 0) return { used: 0, limit: null as number | null, remaining: null as number | null };

  const entitlement = await getEntitlement(workspaceId);
  assertActive(entitlement, `keep using ${def.unit}`);
  const limit = limitFor(entitlement, resource);

  const db = await admin();
  const period = await getMeteringPeriod(workspaceId);
  const { data, error } = await db.rpc("consume_workspace_usage", {
    _workspace_id: workspaceId,
    _resource: resource,
    _period_start: period.key,
    _amount: Math.trunc(amount),
    _limit: limit,
  });

  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { allowed: boolean; used: number; limit: number | null; remaining: number | null };
  if (!result.allowed) {
    throw new EntitlementError({
      code: "limit_reached",
      planName: entitlement.planName,
      resource,
      used: Number(result.used ?? 0),
      limit,
      message:
        resource === "emails_monthly"
          ? emailLimitMessage(entitlement.planName, Number(result.used ?? 0), limit ?? 0)
          : limitMessage(def.label, entitlement.planName, Number(result.used ?? 0), limit ?? 0),
    });
  }
  return {
    used: Number(result.used ?? 0),
    limit,
    remaining: result.remaining === null || result.remaining === undefined ? null : Number(result.remaining),
  };
}

/** Gives back reserved usage when the downstream action failed. */
export async function releaseUsage(workspaceId: string, resource: UsageResource, amount = 1) {
  if (amount <= 0) return;
  const db = await admin();
  const period = await getMeteringPeriod(workspaceId);
  await db.rpc("release_workspace_usage", {
    _workspace_id: workspaceId,
    _resource: resource,
    _period_start: period.key,
    _amount: Math.trunc(amount),
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
  period: "total" | "month";
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
  };
}
