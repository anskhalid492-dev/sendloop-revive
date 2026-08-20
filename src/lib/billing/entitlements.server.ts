/**
 * Server-side entitlement checks: workspace → subscription → plan → limit.
 * Frontend gating is cosmetic; this is the enforcement point.
 */
import { ENTITLED_STATES, type SubscriptionState } from "@/lib/billing/model";
import { admin, getBillingSettings } from "@/lib/billing/core.server";

export type PlanLimitKey =
  | "max_users"
  | "max_leads"
  | "max_campaigns"
  | "max_emails_monthly"
  | "max_sending_accounts"
  | "max_workspaces"
  | "max_automations";

export type PlanFlagKey =
  | "warmup_enabled"
  | "unified_inbox_enabled"
  | "analytics_enabled"
  | "api_access"
  | "custom_branding"
  | "sso_enabled";

export type Entitlement = {
  workspaceId: string;
  planId: string | null;
  planName: string;
  state: SubscriptionState | "none";
  active: boolean;
  inGrace: boolean;
  accessUntil: string | null;
  limits: Record<PlanLimitKey, number | null>;
  flags: Record<PlanFlagKey, boolean>;
  /** Admin-managed plan × feature matrix, keyed by feature key. */
  features: Record<string, boolean>;
  credits: { included: number; balance: number };
};

export async function getEntitlement(workspaceId: string): Promise<Entitlement> {
  const db = await admin();
  const settings = await getBillingSettings();

  const { data: sub } = await db
    .from("billing_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("environment", settings.environment)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planId = sub?.plan_id ?? null;
  let plan: any = null;
  if (planId) {
    const { data } = await db.from("plans").select("*").eq("id", planId).maybeSingle();
    plan = data;
  }
  if (!plan) {
    const { data } = await db
      .from("plans")
      .select("*")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    plan = data;
  }

  const { data: creditRow } = await db
    .from("workspace_credits")
    .select("balance")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const creditBalance = Number(creditRow?.balance ?? 0);

  const rawState = (sub?.status as SubscriptionState | undefined) ?? null;
  const state: SubscriptionState | "none" = rawState ?? "none";
  const inGrace = Boolean(sub?.grace_until && new Date(sub.grace_until) > new Date());
  const active = rawState !== null && (ENTITLED_STATES.includes(rawState) || inGrace);

  return {
    workspaceId,
    planId: plan?.id ?? null,
    planName: plan?.name ?? "Free trial",
    state,
    active,
    inGrace,
    accessUntil: sub?.access_until ?? sub?.current_period_end ?? null,
    limits: {
      max_users: plan?.max_users ?? null,
      max_leads: plan?.max_leads ?? null,
      max_campaigns: plan?.max_campaigns ?? null,
      max_emails_monthly: plan?.max_emails_monthly ?? null,
      max_sending_accounts: plan?.max_sending_accounts ?? null,
      max_workspaces: plan?.max_workspaces ?? null,
      max_automations: plan?.max_automations ?? null,
    },
    flags: {
      warmup_enabled: Boolean(plan?.warmup_enabled),
      unified_inbox_enabled: Boolean(plan?.unified_inbox_enabled),
      analytics_enabled: Boolean(plan?.analytics_enabled),
      api_access: Boolean(plan?.api_access),
      custom_branding: Boolean(plan?.custom_branding),
      sso_enabled: Boolean(plan?.sso_enabled),
    },
    features: await resolveFeatures(plan),
    credits: {
      included: Number(plan?.monthly_credits ?? 0),
      balance: creditBalance,
    },
  };
}

/** Resolves the plan × feature matrix for one plan (columns + plan_features). */
async function resolveFeatures(plan: any): Promise<Record<string, boolean>> {
  const { FEATURE_CATALOG } = await import("@/lib/billing/features");
  const out: Record<string, boolean> = {};
  if (!plan?.id) {
    for (const feature of FEATURE_CATALOG) out[feature.key] = feature.fallback;
    return out;
  }
  const db = await admin();
  const { data: rows } = await db
    .from("plan_features")
    .select("feature_key, included")
    .eq("plan_id", plan.id)
    .not("feature_key", "is", null);
  for (const feature of FEATURE_CATALOG) {
    if (feature.column) {
      out[feature.key] = Boolean(plan[feature.column]);
      continue;
    }
    const row = (rows ?? []).find((r: any) => r.feature_key === feature.key);
    out[feature.key] = row ? Boolean(row.included) : feature.fallback;
  }
  return out;
}

/** Throws when the workspace has reached the plan limit for `key`. */
export async function assertWithinLimit(
  workspaceId: string,
  key: PlanLimitKey,
  currentUsage: number,
  label = "this plan limit",
) {
  const entitlement = await getEntitlement(workspaceId);
  const limit = entitlement.limits[key];
  if (limit !== null && currentUsage >= limit) {
    throw new Error(`You have reached ${label} on the ${entitlement.planName} plan. Upgrade to continue.`);
  }
  return entitlement;
}

/** Throws when the plan does not include a feature flag. */
export async function assertFeature(workspaceId: string, flag: PlanFlagKey, label: string) {
  const entitlement = await getEntitlement(workspaceId);
  if (!entitlement.flags[flag])
    throw new Error(`${label} is not included in the ${entitlement.planName} plan.`);
  return entitlement;
}

/**
 * Server-side enforcement for the admin-managed plan × feature matrix.
 * Frontend locking is cosmetic; this is what actually rejects access.
 */
export async function assertFeatureKey(workspaceId: string, featureKey: string) {
  const [{ featureDefinition }, entitlement] = await Promise.all([
    import("@/lib/billing/features"),
    getEntitlement(workspaceId),
  ]);
  const definition = featureDefinition(featureKey);
  const label = definition?.label ?? featureKey;
  // Workspaces without any subscription record are on the default trial plan
  // and keep their current access; gating only applies once a plan is attached.
  if (entitlement.state === "none") return entitlement;
  if (!entitlement.active)
    throw new Error(`Your subscription is ${entitlement.state}. Renew it to use ${label}.`);
  if (!entitlement.features[featureKey])
    throw new Error(`${label} is not included in the ${entitlement.planName} plan.`);
  return entitlement;
}

