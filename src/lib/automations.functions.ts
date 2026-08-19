/**
 * Automations server functions.
 *
 * Reads and writes run through `requireSupabaseAuth`, so Postgres RLS enforces
 * workspace isolation and role permissions on every call — a customer can
 * never read or execute another workspace's automation, even by crafting a
 * direct request.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AutomationListItem,
  AutomationRow,
  AutomationRun,
  AutomationRunStep,
  AutomationStats,
  AutomationStep,
} from "@/lib/automation-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const sel = (s: string) => s;

const AUTOMATION_COLUMNS =
  "id, workspace_id, name, description, status, trigger_type, trigger_config, condition_logic, version, webhook_token, last_run_at, created_by, created_at, updated_at";

const stepInput = z.object({
  kind: z.enum(["condition", "action", "wait", "branch"]),
  branch: z.enum(["yes", "no"]).nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

/* ----------------------------------------------------------------- list */

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;

    const [{ data: automations, error }, { data: steps }, { data: runs }] = await Promise.all([
      client
        .from("automations")
        .select(sel(AUTOMATION_COLUMNS))
        .eq("workspace_id", data.workspaceId)
        .order("created_at", { ascending: false }),
      client.from("automation_steps").select(sel("automation_id")).eq("workspace_id", data.workspaceId),
      client.from("automation_runs").select(sel("automation_id, status")).eq("workspace_id", data.workspaceId),
    ]);
    if (error) throw new Error(error.message);

    const stepCounts = new Map<string, number>();
    for (const s of (steps ?? []) as { automation_id: string }[]) {
      stepCounts.set(s.automation_id, (stepCounts.get(s.automation_id) ?? 0) + 1);
    }

    const runRows = (runs ?? []) as { automation_id: string; status: string }[];
    const stats: AutomationStats = {
      total: (automations ?? []).length,
      active: 0,
      paused: 0,
      drafts: 0,
      archived: 0,
      runs: runRows.length,
      successful: runRows.filter((r) => r.status === "completed").length,
      failed: runRows.filter((r) => r.status === "failed").length,
      waiting: runRows.filter((r) => r.status === "waiting" || r.status === "queued" || r.status === "running").length,
    };

    const items: AutomationListItem[] = ((automations ?? []) as AutomationRow[]).map((a) => {
      if (a.status === "active") stats.active += 1;
      else if (a.status === "paused") stats.paused += 1;
      else if (a.status === "draft") stats.drafts += 1;
      else stats.archived += 1;
      const mine = runRows.filter((r) => r.automation_id === a.id);
      return {
        ...a,
        steps: stepCounts.get(a.id) ?? 0,
        runs: mine.length,
        successful: mine.filter((r) => r.status === "completed").length,
        failed: mine.filter((r) => r.status === "failed").length,
        waiting: mine.filter((r) => ["waiting", "queued", "running"].includes(r.status)).length,
      };
    });

    // Plan limit, read from the workspace's real subscription.
    const { data: subscription } = await client
      .from("workspace_subscriptions")
      .select(sel("status, plans:plan_id(name, slug, max_automations)"))
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const plan = (subscription as { plans?: { name: string; slug: string; max_automations: number | null } } | null)
      ?.plans;

    return {
      items,
      stats,
      limit: {
        planName: plan?.name ?? "Free",
        planSlug: plan?.slug ?? null,
        max: plan?.max_automations ?? null,
        used: items.filter((i) => i.status !== "archived").length,
        active: items.filter((i) => i.status === "active").length,
      },
    };
  });

/* ------------------------------------------------------------ detail */

export const getAutomation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), automationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: automation, error } = await client
      .from("automations")
      .select(sel(AUTOMATION_COLUMNS))
      .eq("id", data.automationId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!automation) throw new Error("Automation not found");

    const { data: steps } = await client
      .from("automation_steps")
      .select(sel("id, automation_id, workspace_id, position, kind, branch, config"))
      .eq("automation_id", data.automationId)
      .order("position", { ascending: true });

    return { automation: automation as AutomationRow, steps: (steps ?? []) as AutomationStep[] };
  });

/* ------------------------------------------------------------ mutate */

async function planMaxAutomations(client: Client, workspaceId: string): Promise<number | null> {
  const { data: subscription } = await client
    .from("workspace_subscriptions")
    .select(sel("plans:plan_id(name, max_automations)"))
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return (subscription as { plans?: { max_automations: number | null } } | null)?.plans?.max_automations ?? null;
}

async function assertLimit(client: Client, workspaceId: string) {
  const max = await planMaxAutomations(client, workspaceId);
  if (max === null) return;
  const { count } = await client
    .from("automations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("status", "archived");
  if ((count ?? 0) >= max) {
    throw new Error(`Your plan includes ${max} automations. Upgrade to add more.`);
  }
}

/** Blocks activating more live automations than the plan allows. */
async function assertActiveLimit(client: Client, workspaceId: string, automationId: string) {
  const max = await planMaxAutomations(client, workspaceId);
  if (max === null) return;
  const { count } = await client
    .from("automations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .neq("id", automationId);
  if ((count ?? 0) >= max) {
    throw new Error(`Your plan runs ${max} active automations. Upgrade to publish more.`);
  }
}

export const createAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().max(400).optional(),
        triggerType: z.string().trim().min(2).max(60),
        steps: z.array(stepInput).max(40).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // Server-side plan enforcement: an API caller cannot bypass this.
    await assertLimit(client, data.workspaceId);

    const token = crypto.randomUUID().replace(/-/g, "");
    const secret = crypto.randomUUID().replace(/-/g, "");

    const { data: created, error } = await client
      .from("automations")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        description: data.description ?? null,
        trigger_type: data.triggerType,
        status: "draft",
        webhook_token: token,
        webhook_secret: secret,
        created_by: context.userId,
      })
      .select(sel(AUTOMATION_COLUMNS))
      .single();
    if (error) throw new Error(error.message);

    if (data.steps.length) {
      const rows = data.steps.map((s, index) => ({
        automation_id: created.id,
        workspace_id: data.workspaceId,
        position: index,
        kind: s.kind,
        branch: s.branch ?? null,
        config: s.config,
      }));
      const { error: stepError } = await client.from("automation_steps").insert(rows);
      if (stepError) throw new Error(stepError.message);
    }

    return created as AutomationRow;
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        automationId: z.string().uuid(),
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().max(400).nullable().optional(),
        triggerType: z.string().trim().min(2).max(60),
        triggerConfig: z.record(z.string(), z.unknown()).default({}),
        conditionLogic: z.enum(["and", "or"]).default("and"),
        steps: z.array(stepInput).max(40).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;

    // Version bump: runs already in flight keep their frozen definition, so
    // editing a live automation cannot corrupt them.
    const { data: current } = await client
      .from("automations")
      .select(sel("version"))
      .eq("id", data.automationId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!current) throw new Error("Automation not found");

    const { error } = await client
      .from("automations")
      .update({
        name: data.name,
        description: data.description ?? null,
        trigger_type: data.triggerType,
        trigger_config: data.triggerConfig,
        condition_logic: data.conditionLogic,
        version: (current.version ?? 1) + 1,
      })
      .eq("id", data.automationId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);

    await client.from("automation_steps").delete().eq("automation_id", data.automationId);
    if (data.steps.length) {
      const rows = data.steps.map((s, index) => ({
        automation_id: data.automationId,
        workspace_id: data.workspaceId,
        position: index,
        kind: s.kind,
        branch: s.branch ?? null,
        config: s.config,
      }));
      const { error: stepError } = await client.from("automation_steps").insert(rows);
      if (stepError) throw new Error(stepError.message);
    }
    return { ok: true };
  });

export const setAutomationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        automationId: z.string().uuid(),
        status: z.enum(["draft", "active", "paused", "archived"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;

    if (data.status === "active") {
      // Publishing requires a workflow that can actually do something.
      const { count } = await client
        .from("automation_steps")
        .select("id", { count: "exact", head: true })
        .eq("automation_id", data.automationId)
        .in("kind", ["action", "wait"]);
      if ((count ?? 0) === 0) throw new Error("Add at least one action before publishing.");
      // Publishing consumes a live automation slot, so the plan limit is
      // enforced here too — not only at creation time.
      await assertActiveLimit(client, data.workspaceId, data.automationId);
    }

    const { error } = await client
      .from("automations")
      .update({ status: data.status })
      .eq("id", data.automationId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), automationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    await assertLimit(client, data.workspaceId);

    const { data: source } = await client
      .from("automations")
      .select(sel(AUTOMATION_COLUMNS))
      .eq("id", data.automationId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!source) throw new Error("Automation not found");

    const { data: created, error } = await client
      .from("automations")
      .insert({
        workspace_id: data.workspaceId,
        name: `${source.name} (copy)`.slice(0, 120),
        description: source.description,
        trigger_type: source.trigger_type,
        trigger_config: source.trigger_config,
        condition_logic: source.condition_logic,
        status: "draft",
        webhook_token: crypto.randomUUID().replace(/-/g, ""),
        webhook_secret: crypto.randomUUID().replace(/-/g, ""),
        created_by: context.userId,
      })
      .select(sel("id"))
      .single();
    if (error) throw new Error(error.message);

    const { data: steps } = await client
      .from("automation_steps")
      .select(sel("position, kind, branch, config"))
      .eq("automation_id", data.automationId)
      .order("position", { ascending: true });
    const rows = ((steps ?? []) as AutomationStep[]).map((s) => ({
      automation_id: created.id,
      workspace_id: data.workspaceId,
      position: s.position,
      kind: s.kind,
      branch: s.branch,
      config: s.config,
    }));
    if (rows.length) await client.from("automation_steps").insert(rows);

    return { id: created.id as string };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), automationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { error } = await client
      .from("automations")
      .delete()
      .eq("id", data.automationId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ----------------------------------------------------------- activity */

export const listAutomationRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        automationId: z.string().uuid().optional(),
        status: z.enum(["all", "completed", "failed", "waiting", "running", "cancelled"]).default("all"),
        /** ISO cut-off; runs created before it are excluded. */
        since: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(200).default(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    let query = client
      .from("automation_runs")
      .select(
        sel(
          "id, automation_id, workspace_id, lead_id, campaign_id, trigger_type, status, current_step, resume_at, attempts, error, result, metadata, started_at, completed_at, created_at",
        ),
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.automationId) query = query.eq("automation_id", data.automationId);
    if (data.since) query = query.gte("created_at", data.since);
    if (data.status === "waiting") query = query.in("status", ["waiting", "queued"]);
    else if (data.status !== "all") query = query.eq("status", data.status);

    const { data: runs, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (runs ?? []) as AutomationRun[];

    const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];
    const automationIds = [...new Set(rows.map((r) => r.automation_id))];
    const [{ data: leads }, { data: automations }] = await Promise.all([
      leadIds.length
        ? client.from("leads").select(sel("id, email, first_name, last_name, company")).in("id", leadIds)
        : Promise.resolve({ data: [] }),
      automationIds.length
        ? client.from("automations").select(sel("id, name")).in("id", automationIds)
        : Promise.resolve({ data: [] }),
    ]);

    const leadMap = new Map(
      ((leads ?? []) as { id: string; email: string }[]).map((l) => [l.id, l]),
    );
    const nameMap = new Map(((automations ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));

    return rows.map((r) => ({
      ...r,
      automationName: nameMap.get(r.automation_id) ?? "Automation",
      leadEmail: r.lead_id ? (leadMap.get(r.lead_id)?.email ?? null) : null,
    }));
  });

export const getAutomationRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid(), runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: run, error } = await client
      .from("automation_runs")
      .select(
        sel(
          "id, automation_id, workspace_id, lead_id, campaign_id, trigger_type, status, current_step, resume_at, attempts, error, result, metadata, started_at, completed_at, created_at",
        ),
      )
      .eq("id", data.runId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("Run not found");

    const { data: steps } = await client
      .from("automation_run_steps")
      .select(sel("id, run_id, position, kind, label, status, output, error, started_at, finished_at"))
      .eq("run_id", data.runId)
      .order("position", { ascending: true });

    return { run: run as AutomationRun, steps: (steps ?? []) as AutomationRunStep[] };
  });

export const retryAutomationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid(), runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // RLS-checked read proves membership before the privileged retry.
    const { data: run } = await client
      .from("automation_runs")
      .select(sel("id, status"))
      .eq("id", data.runId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!run) throw new Error("Run not found");
    if (!["failed", "cancelled"].includes(run.status)) throw new Error("Only failed runs can be retried.");

    const { retryRun } = await import("@/lib/automation-engine.server");
    await retryRun(data.runId, data.workspaceId);
    return { ok: true };
  });

/* -------------------------------------------------- builder reference */

export const getAutomationOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const [{ data: campaigns }, { data: stages }, { data: members }, { data: slack }] = await Promise.all([
      client
        .from("campaigns")
        .select(sel("id, name, status"))
        .eq("workspace_id", data.workspaceId)
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      client
        .from("crm_stages")
        .select(sel("id, name, position"))
        .eq("workspace_id", data.workspaceId)
        .order("position", { ascending: true }),
      client
        .from("workspace_members")
        .select(sel("user_id, profiles:user_id(email, full_name)"))
        .eq("workspace_id", data.workspaceId),
      client
        .from("integration_connections")
        .select(sel("slug, status"))
        .eq("workspace_id", data.workspaceId)
        .eq("slug", "slack")
        .maybeSingle(),
    ]);

    return {
      campaigns: (campaigns ?? []) as { id: string; name: string; status: string }[],
      stages: (stages ?? []) as { id: string; name: string }[],
      members: ((members ?? []) as { user_id: string; profiles: { email: string; full_name: string | null } | null }[]).map(
        (m) => ({ id: m.user_id, label: m.profiles?.full_name || m.profiles?.email || "Member" }),
      ),
      slackConnected: Boolean(slack),
    };
  });

export const getAutomationWebhook = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), automationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // Only the public token is ever returned — the signing secret stays server side.
    const { data: automation } = await client
      .from("automations")
      .select(sel("webhook_token"))
      .eq("id", data.automationId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!automation) throw new Error("Automation not found");
    return { path: `/api/public/automations/${automation.webhook_token}` };
  });
