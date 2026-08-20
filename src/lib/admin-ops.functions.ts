/**
 * Phase 8/9 operations server functions: platform usage and the live
 * production readiness checklist. Both re-verify the platform admin role
 * server-side before touching anything.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const usageInput = z.object({
  from: z.string().min(4),
  to: z.string().min(4),
  workspaceId: z.string().uuid().optional(),
});

export const adminLoadUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => usageInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    await assertSuperAdmin(context);
    const { loadUsage } = await import("@/lib/admin-ops.server");
    return loadUsage({
      from: data.from,
      to: data.to,
      ...(data.workspaceId ? { workspaceId: data.workspaceId } : {}),
    });
  });

export const adminRunProductionChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ deep: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    await assertSuperAdmin(context);
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    const { runProductionChecks, scoreChecks } = await import("@/lib/production-checks.server");

    let origin: string | null = null;
    try {
      origin = new URL(getRequestUrl()).origin;
    } catch {
      origin = null;
    }

    const result = await runProductionChecks({ deep: data.deep, origin });
    const summary = scoreChecks(result.checks);

    // Deep runs execute real writes (throwaway account, storage object) and
    // provider API calls, so they are recorded in the admin audit trail.
    if (data.deep) {
      await context.supabase.from("admin_audit_log").insert({
        actor_id: context.userId,
        action: "production.deep_check",
        target_type: "platform",
        target_label: "Production checklist (deep)",
        detail: { score: summary.score, failed: summary.failed, warnings: summary.warnings, result: "success" },
      });
    }

    return { ...result, summary };
  });
