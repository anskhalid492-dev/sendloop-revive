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
