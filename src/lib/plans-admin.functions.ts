/**
 * Admin plans / features / subscriptions / payments / credits server functions.
 *
 * Thin wrappers only: every helper is imported inside the handler so the
 * server-fn splitter never strips a runtime sibling. Every handler re-checks
 * the platform admin role — the route guard is convenience only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREDIT_ENTRY_TYPES } from "@/lib/billing/features";

const planPatch = z.record(z.string(), z.unknown());

/* ------------------------------------------------------------------ plans */

export const getAdminPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { loadPlansConsole } = await import("@/lib/billing/plans-admin.server");
    await assertSuperAdmin(context);
    return loadPlansConsole();
  });

export const createAdminPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { patch: Record<string, unknown> }) =>
    z.object({ patch: planPatch }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { createPlan } = await import("@/lib/billing/plans-admin.server");
    await assertSuperAdmin(context);
    return createPlan(data.patch, context.userId);
  });

export const updateAdminPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string; patch: Record<string, unknown> }) =>
    z.object({ planId: z.string().uuid(), patch: planPatch }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { updatePlan } = await import("@/lib/billing/plans-admin.server");
    await assertSuperAdmin(context);
    return updatePlan(data.planId, data.patch, context.userId);
  });

export const setAdminPlanActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string; active: boolean }) =>
    z.object({ planId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { setPlanActive } = await import("@/lib/billing/plans-admin.server");
    await assertSuperAdmin(context);
    return setPlanActive(data.planId, data.active, context.userId);
  });

/* --------------------------------------------------------------- features */

export const getFeatureMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { loadFeatureMatrix } = await import("@/lib/billing/plans-admin.server");
    await assertSuperAdmin(context);
    return loadFeatureMatrix();
  });

export const setPlanFeatureEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string; featureKey: string; enabled: boolean }) =>
    z
      .object({ planId: z.string().uuid(), featureKey: z.string().min(1), enabled: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { setPlanFeature } = await import("@/lib/billing/plans-admin.server");
    await assertSuperAdmin(context);
    return setPlanFeature(data, context.userId);
  });

/* ---------------------------------------------------------- subscriptions */

export const listAdminSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string; provider?: string; search?: string }) =>
    z
      .object({
        status: z.string().optional(),
        provider: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { loadSubscriptions } = await import("@/lib/billing/plans-admin.server");
    await assertSuperAdmin(context);
    return loadSubscriptions({
      status: data.status ?? null,
      provider: data.provider ?? null,
      search: data.search ?? null,
    });
  });

export const getAdminSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subscriptionId: string }) =>
    z.object({ subscriptionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { loadSubscriptionDetail } = await import("@/lib/billing/plans-admin.server");
    await assertSuperAdmin(context);
    return loadSubscriptionDetail(data.subscriptionId);
  });

/**
 * Admin subscription lifecycle actions. These call the configured payment
 * provider through the existing adapters — the local record is only updated by
 * the provider webhook, never by hand.
 */
export const adminSubscriptionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      workspaceId: string;
      action: "cancel" | "cancel_now" | "resume" | "change_plan";
      planId?: string;
      interval?: "monthly" | "yearly";
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          action: z.enum(["cancel", "cancel_now", "resume", "change_plan"]),
          planId: z.string().uuid().optional(),
          interval: z.enum(["monthly", "yearly"]).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const customer = await import("@/lib/billing/customer.server");
    const audit = await import("@/lib/billing/change-audit.server");
    await assertSuperAdmin(context);

    const before = await audit.subscriptionSnapshot(data.workspaceId);
    const run = async () => {
      if (data.action === "resume")
        return customer.resumeForWorkspace(data.workspaceId, context.userId);
      if (data.action === "cancel" || data.action === "cancel_now")
        return customer.cancelForWorkspace(
          data.workspaceId,
          context.userId,
          data.action === "cancel_now",
        );
      if (!data.planId || !data.interval)
        throw new Error("A target plan and billing interval are required.");
      return customer.changePlan({
        workspaceId: data.workspaceId,
        planId: data.planId,
        interval: data.interval,
        userId: context.userId,
      });
    };

    const result = await run();
    await audit.recordAdminChange({
      actorId: context.userId,
      action: `subscription.${data.action}`,
      targetType: "subscription",
      targetId: data.workspaceId,
      targetLabel: await audit.workspaceLabel(data.workspaceId),
      workspaceId: data.workspaceId,
      before,
      after: await audit.subscriptionSnapshot(data.workspaceId),
      detail: { requestedPlanId: data.planId ?? null, requestedInterval: data.interval ?? null },
    });
    return result;
  });


/* -------------------------------------------------------------- payments */

export const listAdminPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { status?: string; provider?: string; from?: string; to?: string; search?: string }) =>
      z
        .object({
          status: z.string().optional(),
          provider: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          search: z.string().optional(),
        })
        .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { loadPayments } = await import("@/lib/billing/plans-admin.server");
    await assertSuperAdmin(context);
    return loadPayments({
      status: data.status ?? null,
      provider: data.provider ?? null,
      from: data.from ?? null,
      to: data.to ?? null,
      search: data.search ?? null,
    });
  });

/* --------------------------------------------------------------- credits */

export const searchAdminCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string }) => z.object({ search: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { searchWorkspaceCredits } = await import("@/lib/billing/credits.server");
    await assertSuperAdmin(context);
    return searchWorkspaceCredits(data.search ?? "");
  });

export const adjustWorkspaceCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { workspaceId: string; mode: "add" | "remove" | "set"; amount: number; reason: string; entryType?: string }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          mode: z.enum(["add", "remove", "set"]),
          amount: z.number().int().min(0),
          reason: z.string().trim().min(3, "An adjustment reason is required."),
          entryType: z.enum(CREDIT_ENTRY_TYPES).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const credits = await import("@/lib/billing/credits.server");
    const audit = await import("@/lib/billing/change-audit.server");
    await assertSuperAdmin(context);

    const before = await audit.creditSnapshot(data.workspaceId);
    let result: { ok: boolean; unchanged?: boolean };
    if (data.mode === "set") {
      result = (await credits.setCreditBalance({
        workspaceId: data.workspaceId,
        target: data.amount,
        reason: data.reason,
        actorUserId: context.userId,
      })) as { ok: boolean; unchanged?: boolean };
    } else {
      if (data.amount === 0) throw new Error("Enter a credit amount greater than zero.");
      await credits.applyCreditChange({
        workspaceId: data.workspaceId,
        amount: data.mode === "add" ? data.amount : -data.amount,
        entryType: (data.entryType as any) ?? "admin_adjustment",
        reason: data.reason,
        actor: "admin",
        actorUserId: context.userId,
      });
      result = { ok: true };
    }

    await audit.recordAdminChange({
      actorId: context.userId,
      action: `credits.${data.mode}`,
      targetType: "credits",
      targetId: data.workspaceId,
      targetLabel: await audit.workspaceLabel(data.workspaceId),
      workspaceId: data.workspaceId,
      before,
      after: await audit.creditSnapshot(data.workspaceId),
      detail: { amount: data.amount, reason: data.reason, entryType: data.entryType ?? null },
    });
    return result;
  });

/* ------------------------------------------------------------ change log */

export const listAdminChangeLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetType?: string; search?: string }) =>
    z.object({ targetType: z.string().optional(), search: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { listAdminChanges } = await import("@/lib/billing/change-audit.server");
    await assertSuperAdmin(context);
    return listAdminChanges({
      targetType: data.targetType && data.targetType !== "all" ? data.targetType : null,
      search: data.search ?? null,
    });
  });


export const listCreditLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId?: string; entryType?: string; search?: string }) =>
    z
      .object({
        workspaceId: z.string().uuid().optional(),
        entryType: z.enum(CREDIT_ENTRY_TYPES).optional(),
        search: z.string().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { listLedger } = await import("@/lib/billing/credits.server");
    await assertSuperAdmin(context);
    return listLedger({
      workspaceId: data.workspaceId ?? null,
      entryType: (data.entryType as any) ?? null,
      search: data.search ?? null,
    });
  });
