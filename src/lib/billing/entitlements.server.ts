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

  const state: SubscriptionState | "none" = (sub?.status as SubscriptionState) ?? "none";
  const inGrace = Boolean(sub?.grace_until && new Date(sub.grace_until) > new Date());
  const active = state !== "none" && (ENTITLED_STATES.includes(state) || inGrace);

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
  };
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
