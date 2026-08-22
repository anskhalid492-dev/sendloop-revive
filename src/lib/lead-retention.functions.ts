/**
 * Lead retention (60 days).
 *
 * Deletion itself runs in the database on a daily pg_cron schedule, so it keeps
 * working when nobody is signed in. These functions only expose the cleanup log
 * to platform admins and allow a manual "run now".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RetentionRun = {
  id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  deleted_count: number;
  batches: number;
  status: string;
  error: string | null;
  started_at: string;
  finished_at: string;
};

export type RetentionOverview = {
  runs: RetentionRun[];
  expiringSoon: number;
  expiredPending: number;
  retentionDays: number;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
}

/** Admin: cleanup log plus upcoming purge counts. */
export const adminLeadRetentionOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RetentionOverview> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const [runsRes, workspacesRes, soonRes, pendingRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("lead_retention_runs")
        .select("id, workspace_id, deleted_count, batches, status, error, started_at, finished_at")
        .order("started_at", { ascending: false })
        .limit(100),
      (supabaseAdmin as any).from("workspaces").select("id, name"),
      (supabaseAdmin as any)
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gt("retention_expires_at", now)
        .lte("retention_expires_at", soon),
      (supabaseAdmin as any)
        .from("leads")
        .select("id", { count: "exact", head: true })
        .lte("retention_expires_at", now),
    ]);

    const names = new Map<string, string>(
      ((workspacesRes.data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]),
    );

    return {
      runs: ((runsRes.data ?? []) as any[]).map((r) => ({
        ...r,
        workspace_name: r.workspace_id ? (names.get(r.workspace_id) ?? null) : null,
      })) as RetentionRun[],
      expiringSoon: soonRes.count ?? 0,
      expiredPending: pendingRes.count ?? 0,
      retentionDays: 60,
    };
  });

/** Admin: run the purge immediately instead of waiting for the nightly job. */
export const adminRunLeadRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }): Promise<{ deleted: number }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("run_lead_retention_cleanup", {
      _batch_size: 500,
      _max_batches: 40,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { out_deleted_count: number }[];
    return { deleted: rows.reduce((sum, r) => sum + (r.out_deleted_count ?? 0), 0) };
  });
