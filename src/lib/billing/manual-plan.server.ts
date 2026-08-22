/**
 * Manual (staff-assigned) plan management.
 *
 * Admins can attach, upgrade, downgrade or remove a paid plan for a workspace
 * without going through a payment provider. This writes to the SAME
 * `billing_subscriptions` record the entitlement system reads, so limits,
 * feature flags and metering all follow automatically — there is no separate
 * admin-only plan store.
 *
 * Server only. Every entry point is guarded by `assertSuperAdmin` in the
 * calling server function.
 */
import { admin, getBillingSettings } from "@/lib/billing/core.server";
import { getEntitlement } from "@/lib/billing/entitlements.server";
import { getUsageSnapshot } from "@/lib/billing/usage.server";
import { recordAdminChange } from "@/lib/billing/change-audit.server";

export type ManualPlanEffect = "immediate" | "next_cycle";

export type ManualPlanOption = {
  id: string;
  name: string;
  slug: string;
  monthlyPrice: number;
  yearlyPrice: number;
  isFree: boolean;
  limits: Record<string, number | null>;
};

const LIMIT_COLUMNS = [
  "max_emails_monthly",
  "max_emails_daily",
  "max_leads",
  "max_sending_accounts",
  "max_domains",
  "max_campaigns",
  "max_active_campaigns",
  "max_automations",
  "max_ai_monthly",
  "max_warmup_daily",
  "max_users",
  "max_workspaces",
] as const;

function planOption(plan: any): ManualPlanOption {
  const limits: Record<string, number | null> = {};
  for (const key of LIMIT_COLUMNS) limits[key] = plan[key] ?? null;
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    monthlyPrice: Number(plan.monthly_price ?? 0),
    yearlyPrice: Number(plan.yearly_price ?? 0),
    isFree: Number(plan.monthly_price ?? 0) === 0,
    limits,
  };
}

async function currentSubscription(workspaceId: string) {
  const db = await admin();
  const settings = await getBillingSettings();
  const { data } = await db
    .from("billing_subscriptions")
    .select("*, plans(id, name, slug, monthly_price)")
    .eq("workspace_id", workspaceId)
    .eq("environment", settings.environment)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { db, settings, sub: data as any | null };
}

/** Free/default plan used when a paid plan is removed. */
async function freePlan() {
  const db = await admin();
  const { data } = await db
    .from("plans")
    .select("*")
    .eq("monthly_price", 0)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as any | null;
}

function addPeriod(from: Date, interval: "monthly" | "yearly") {
  const d = new Date(from);
  if (interval === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/**
 * Applies a scheduled ("next billing cycle") manual plan change once its
 * effective date has passed. Safe to call on every read.
 */
export async function applyDuePendingPlan(workspaceId: string) {
  const { db, sub } = await currentSubscription(workspaceId);
  if (!sub?.pending_plan_id || !sub.pending_effective_at) return false;
  if (new Date(sub.pending_effective_at) > new Date()) return false;

  const { data: plan } = await db
    .from("plans")
    .select("*")
    .eq("id", sub.pending_plan_id)
    .maybeSingle();
  if (!plan) return false;

  const interval = (sub.pending_interval ?? sub.billing_interval ?? "monthly") as
    | "monthly"
    | "yearly";
  const start = new Date(sub.pending_effective_at);
  await db
    .from("billing_subscriptions")
    .update({
      plan_id: plan.id,
      billing_interval: interval,
      amount_cents:
        interval === "yearly" ? Number(plan.yearly_price ?? 0) : Number(plan.monthly_price ?? 0),
      status: Number(plan.monthly_price ?? 0) === 0 ? "trialing" : "active",
      current_period_start: start.toISOString(),
      current_period_end: addPeriod(start, interval).toISOString(),
      pending_plan_id: null,
      pending_interval: null,
      pending_effective_at: null,
      manual_override: true,
    })
    .eq("id", sub.id);
  return true;
}

export async function loadWorkspacePlanAdmin(workspaceId: string) {
  await applyDuePendingPlan(workspaceId);
  const { db, sub } = await currentSubscription(workspaceId);

  const [{ data: plans }, entitlement, usage, { data: workspace }] = await Promise.all([
    db.from("plans").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    getEntitlement(workspaceId),
    getUsageSnapshot(workspaceId),
    db.from("workspaces").select("id, name, owner_id").eq("id", workspaceId).maybeSingle(),
  ]);

  let assignedByEmail: string | null = null;
  if (sub?.manual_assigned_by) {
    const { data: p } = await db
      .from("profiles")
      .select("email")
      .eq("id", sub.manual_assigned_by)
      .maybeSingle();
    assignedByEmail = p?.email ?? null;
  }

  let pendingPlanName: string | null = null;
  if (sub?.pending_plan_id) {
    const { data: p } = await db
      .from("plans")
      .select("name")
      .eq("id", sub.pending_plan_id)
      .maybeSingle();
    pendingPlanName = p?.name ?? null;
  }

  const { data: history } = await db
    .from("admin_audit_log")
    .select("id, action, target_label, detail, created_at, actor_id")
    .eq("target_type", "subscription")
    .eq("target_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { listGrants } = await import("@/lib/billing/plan-grants.server");
  const grants = await listGrants(workspaceId);
  const activeGrant = grants.find((g) => g.status === "active") ?? null;

  return {
    workspace: { id: workspaceId, name: (workspace as any)?.name ?? "Workspace" },
    plans: (plans ?? []).map(planOption),
    grant: activeGrant,
    grants,

    current: {
      subscriptionId: sub?.id ?? null,
      planId: sub?.plan_id ?? entitlement.planId,
      planName: sub?.plans?.name ?? entitlement.planName,
      status: sub?.status ?? "none",
      statusLabel: entitlement.stateLabel,
      active: entitlement.active,
      interval: sub?.billing_interval ?? null,
      amountCents: sub?.amount_cents ?? 0,
      currency: sub?.currency ?? "usd",
      provider: sub?.provider ?? null,
      currentPeriodStart: sub?.current_period_start ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
      manualOverride: Boolean(sub?.manual_override),
      manualAssignedAt: sub?.manual_assigned_at ?? null,
      manualAssignedByEmail: assignedByEmail,
      manualNote: sub?.manual_note ?? null,
      pendingPlanId: sub?.pending_plan_id ?? null,
      pendingPlanName,
      pendingEffectiveAt: sub?.pending_effective_at ?? null,
    },
    limits: entitlement.limits as Record<string, number | null>,
    usage: usage.usage,
    period: usage.period,
    credits: entitlement.credits,
    history: (history ?? []).map((h: any) => ({
      id: h.id,
      action: h.action,
      at: h.created_at,
      note: (h.detail ?? {})?.reason ?? null,
      fromPlan: (h.detail ?? {})?.fromPlan ?? null,
      toPlan: (h.detail ?? {})?.toPlan ?? null,
      effect: (h.detail ?? {})?.effect ?? null,
    })),
  };
}

export type ManualAssignInput = {
  workspaceId: string;
  /** null = remove the paid plan and return the workspace to the free trial. */
  planId: string | null;
  interval: "monthly" | "yearly";
  effect: ManualPlanEffect;
  reason?: string | null;
  actorId: string;
};

export async function assignPlanManually(input: ManualAssignInput) {
  const { db, settings, sub } = await currentSubscription(input.workspaceId);

  const target = input.planId
    ? ((await db.from("plans").select("*").eq("id", input.planId).maybeSingle()).data as any)
    : await freePlan();
  if (!target) throw new Error("Plan not found");

  const before = sub
    ? {
        planId: sub.plan_id,
        planName: sub.plans?.name ?? null,
        status: sub.status,
        interval: sub.billing_interval,
        amountCents: sub.amount_cents,
        manualOverride: sub.manual_override,
      }
    : null;

  const isFree = Number(target.monthly_price ?? 0) === 0;
  const scheduled =
    input.effect === "next_cycle" &&
    sub?.current_period_end &&
    new Date(sub.current_period_end) > new Date();

  if (scheduled && sub) {
    await db
      .from("billing_subscriptions")
      .update({
        pending_plan_id: target.id,
        pending_interval: input.interval,
        pending_effective_at: sub.current_period_end,
        manual_assigned_by: input.actorId,
        manual_assigned_at: new Date().toISOString(),
        manual_note: input.reason ?? null,
      })
      .eq("id", sub.id);
  } else {
    const now = new Date();
    const patch = {
      plan_id: target.id,
      billing_interval: input.interval,
      amount_cents: isFree
        ? 0
        : input.interval === "yearly"
          ? Number(target.yearly_price ?? 0)
          : Number(target.monthly_price ?? 0),
      status: isFree ? "trialing" : "active",
      current_period_start: now.toISOString(),
      current_period_end: addPeriod(now, input.interval).toISOString(),
      cancel_at_period_end: false,
      cancelled_at: null,
      access_until: null,
      grace_until: null,
      pending_plan_id: null,
      pending_interval: null,
      pending_effective_at: null,
      manual_override: true,
      manual_assigned_by: input.actorId,
      manual_assigned_at: now.toISOString(),
      manual_note: input.reason ?? null,
      last_event_at: now.toISOString(),
    };

    if (sub) {
      const { error } = await db.from("billing_subscriptions").update(patch).eq("id", sub.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("billing_subscriptions").insert({
        workspace_id: input.workspaceId,
        provider: "manual",
        environment: settings.environment,
        external_subscription_id: `manual_${input.workspaceId}_${Date.now()}`,
        currency: "usd",
        ...patch,
      });
      if (error) throw new Error(error.message);
    }
  }

  const { sub: after } = await currentSubscription(input.workspaceId);
  const action = scheduled ? "subscription.manual_plan_scheduled" : "subscription.manual_plan_set";

  await Promise.all([
    recordAdminChange({
      actorId: input.actorId,
      action,
      targetType: "subscription",
      targetId: input.workspaceId,
      targetLabel: target.name,
      workspaceId: input.workspaceId,
      before,
      after: after
        ? {
            planId: after.plan_id,
            planName: after.plans?.name ?? target.name,
            status: after.status,
            interval: after.billing_interval,
            amountCents: after.amount_cents,
            manualOverride: after.manual_override,
          }
        : null,
      detail: {
        reason: input.reason ?? null,
        effect: scheduled ? "next_cycle" : "immediate",
        fromPlan: before?.planName ?? "Free Trial",
        toPlan: target.name,
        effectiveAt: scheduled ? (sub?.current_period_end ?? null) : new Date().toISOString(),
        charged: false,
      },
    }),
    db.from("billing_audit_log").insert({
      workspace_id: input.workspaceId,
      user_id: input.actorId,
      environment: settings.environment,
      action,
      detail: {
        fromPlan: before?.planName ?? "Free Trial",
        toPlan: target.name,
        effect: scheduled ? "next_cycle" : "immediate",
        reason: input.reason ?? null,
      },
    }),
  ]);

  return loadWorkspacePlanAdmin(input.workspaceId);
}

/** Clears a scheduled manual plan change. */
export async function cancelScheduledPlan(workspaceId: string, actorId: string) {
  const { db, sub } = await currentSubscription(workspaceId);
  if (!sub?.pending_plan_id) return loadWorkspacePlanAdmin(workspaceId);
  await db
    .from("billing_subscriptions")
    .update({ pending_plan_id: null, pending_interval: null, pending_effective_at: null })
    .eq("id", sub.id);
  await recordAdminChange({
    actorId,
    action: "subscription.manual_plan_schedule_cancelled",
    targetType: "subscription",
    targetId: workspaceId,
    workspaceId,
    before: { pendingPlanId: sub.pending_plan_id },
    after: { pendingPlanId: null },
  });
  return loadWorkspacePlanAdmin(workspaceId);
}
