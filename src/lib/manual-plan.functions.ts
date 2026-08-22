/** Admin manual plan assignment. Thin server-function wrappers only. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWorkspacePlanAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { loadWorkspacePlanAdmin } = await import("@/lib/billing/manual-plan.server");
    await assertSuperAdmin(context);
    return loadWorkspacePlanAdmin(data.workspaceId);
  });

export const assignWorkspacePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      workspaceId: string;
      planId: string | null;
      interval?: "monthly" | "yearly";
      effect?: "immediate" | "next_cycle";
      reason?: string;
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          planId: z.string().uuid().nullable(),
          interval: z.enum(["monthly", "yearly"]).default("monthly"),
          effect: z.enum(["immediate", "next_cycle"]).default("immediate"),
          reason: z.string().max(500).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { assignPlanManually } = await import("@/lib/billing/manual-plan.server");
    await assertSuperAdmin(context);
    return assignPlanManually({
      workspaceId: data.workspaceId,
      planId: data.planId,
      interval: data.interval,
      effect: data.effect,
      reason: data.reason ?? null,
      actorId: context.userId,
    });
  });

export const cancelScheduledWorkspacePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { cancelScheduledPlan } = await import("@/lib/billing/manual-plan.server");
    await assertSuperAdmin(context);
    return cancelScheduledPlan(data.workspaceId, context.userId);
  });

/** Admin: grant any plan to a workspace without payment. */
export const grantWorkspacePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { workspaceId: string; planId: string; days: number | null; reason?: string }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          planId: z.string().uuid(),
          days: z.number().int().min(1).max(3650).nullable(),
          reason: z.string().max(500).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { grantPlan } = await import("@/lib/billing/plan-grants.server");
    const { loadWorkspacePlanAdmin } = await import("@/lib/billing/manual-plan.server");
    await assertSuperAdmin(context);
    await grantPlan({
      workspaceId: data.workspaceId,
      planId: data.planId,
      days: data.days,
      reason: data.reason ?? null,
      actorId: context.userId,
    });
    return loadWorkspacePlanAdmin(data.workspaceId);
  });

/** Admin: extend, shorten or remove the expiry of the active grant. */
export const updateWorkspaceGrantExpiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; days: number | null; reason?: string }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        days: z.number().int().min(1).max(3650).nullable(),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { updateGrantExpiry } = await import("@/lib/billing/plan-grants.server");
    const { loadWorkspacePlanAdmin } = await import("@/lib/billing/manual-plan.server");
    await assertSuperAdmin(context);
    await updateGrantExpiry({
      workspaceId: data.workspaceId,
      days: data.days,
      reason: data.reason ?? null,
      actorId: context.userId,
    });
    return loadWorkspacePlanAdmin(data.workspaceId);
  });

/** Admin: revoke the active grant; the workspace returns to its own plan. */
export const revokeWorkspacePlanGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; reason?: string }) =>
    z.object({ workspaceId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    const { revokeGrant } = await import("@/lib/billing/plan-grants.server");
    const { loadWorkspacePlanAdmin } = await import("@/lib/billing/manual-plan.server");
    await assertSuperAdmin(context);
    await revokeGrant({
      workspaceId: data.workspaceId,
      reason: data.reason ?? null,
      actorId: context.userId,
    });
    return loadWorkspacePlanAdmin(data.workspaceId);
  });
