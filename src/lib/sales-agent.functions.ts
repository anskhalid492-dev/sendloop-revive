/**
 * AI Sales Agent settings + admin monitoring. No provider credentials are
 * ever read or returned here — customers never configure an AI key for the
 * Sales Agent.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeSettings } from "@/lib/sales-agent";

const ws = z.object({ workspaceId: z.string().uuid() });

async function memberRole(context: { supabase: any; userId: string }, workspaceId: string): Promise<string | null> {
  const { data } = await context.supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", context.userId)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

export const getSalesAgentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ws.parse(input))
  .handler(async ({ data, context }) => {
    if (!(await memberRole(context, data.workspaceId))) throw new Error("Workspace not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadSalesAgentSettings } = await import("@/lib/sales-agent.server");
    return loadSalesAgentSettings(supabaseAdmin, data.workspaceId);
  });

export const saveSalesAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    ws
      .extend({
        settings: z.object({
          enabled: z.boolean(),
          defaultTone: z.string().max(120),
          globalInstructions: z.string().max(2000),
          extraRules: z.string().max(2000),
          defaultThreshold: z.number().min(0.5).max(1),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await memberRole(context, data.workspaceId);
    if (!role || !["owner", "admin"].includes(role)) throw new Error("Only workspace owners and admins can change AI Sales Agent settings.");
    const value = normalizeSettings(data.settings);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { settingsKey } = await import("@/lib/sales-agent.server");
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ key: settingsKey(data.workspaceId), value: value as never }, { onConflict: "key" });
    if (error) throw new Error("Could not save AI Sales Agent settings.");
    return value;
  });

/** Admin-only: AI Sales Agent usage over the last N days (from workflow run history). */
export const adminSalesAgentAiMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ days: z.number().int().min(1).max(90).default(7) }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("automation_run_steps")
      .select("workspace_id, output")
      .gte("created_at", since)
      .not("output->ai", "is", null)
      .limit(5000);
    const { summarizeAiMetrics } = await import("@/lib/sales-agent-metrics");
    return summarizeAiMetrics((rows ?? []) as { workspace_id: string; output: Record<string, unknown> }[]);
  });

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Admin-only AI Sales Agent monitoring for a UTC date range. Reads only the
 * AI Sales Agent step outputs (bounded, paged reads), aggregates on the
 * server and returns counts — never prompts, replies, provider payloads or
 * credentials.
 */
export const adminSalesAgentMonitoring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        from: day,
        to: day,
        search: z.string().max(200).nullable().default(null),
        page: z.number().int().min(1).max(100_000).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
      })
      .refine((r) => r.from <= r.to, "Start date must be on or before end date")
      .refine((r) => Date.parse(r.to) - Date.parse(r.from) <= 366 * 86_400_000, "Range is limited to one year")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMonitoringRows } = await import("@/lib/sales-agent-monitoring.server");
    const { aggregateAiMonitoring, pageWorkspaces } = await import("@/lib/sales-agent-metrics");
    const { rows, truncated } = await loadMonitoringRows(supabaseAdmin, data.from, data.to);
    const m = aggregateAiMonitoring(rows);
    const ids = m.workspaces.map((w) => w.workspaceId);
    const names = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: ws } = await supabaseAdmin.from("workspaces").select("id, name").in("id", ids.slice(i, i + 200));
      for (const w of (ws ?? []) as { id: string; name: string | null }[]) names.set(w.id, w.name || "Untitled workspace");
    }
    const named = m.workspaces.map((w) => ({ ...w, name: names.get(w.workspaceId) ?? "Deleted workspace" }));
    return { totals: m.totals, outcomes: m.outcomes, failures: m.failures, workspaces: pageWorkspaces(named, data.search, data.page, data.pageSize), truncated };
  });
