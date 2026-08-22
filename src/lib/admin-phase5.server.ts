/**
 * Admin Phase 5 read models: platform-wide CRM, Automations and Analytics.
 *
 * Runs with the service-role client so the console can inspect every tenant,
 * but every entry point in `admin-phase5.functions.ts` first verifies the
 * caller holds the platform super admin role using their own RLS-bound
 * client. Customers keep their normal workspace-scoped paths untouched.
 *
 * Nothing here duplicates the CRM or automation engines: the CRM tables
 * (`leads`, `crm_stages`, `lead_tasks`, `lead_notes`, `lead_activities`) and
 * the automation engine tables (`automations`, `automation_steps`,
 * `automation_runs`, `automation_run_steps`) are the single source of truth.
 * Admin actions only flip automation status — the existing worker keeps all
 * safety controls. No credential, key or secret column is selected anywhere.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = () => supabaseAdmin as any;

type Dict<T> = Record<string, T>;

async function workspaceNames(ids: (string | null | undefined)[]): Promise<Dict<string>> {
  const unique = Array.from(new Set(ids.filter(Boolean) as string[]));
  if (!unique.length) return {};
  const { data } = await db().from("workspaces").select("id, name").in("id", unique);
  const out: Dict<string> = {};
  for (const w of data ?? []) out[w.id] = w.name;
  return out;
}

/* ================================================================== CRM */

export type AdminCrmFilters = {
  workspaceId?: string | null | undefined;
  stageId?: string | null | undefined;
  search?: string | null | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

export async function adminCrmOverview(filters: AdminCrmFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(filters.pageSize ?? 50, 200);

  let q = db()
    .from("leads")
    .select(
      "id, workspace_id, email, first_name, last_name, company, job_title, status, stage_id, owner_id, lead_source, deal_value, tags, archived, last_activity_at, created_at",
      { count: "exact" },
    )
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (filters.workspaceId) q = q.eq("workspace_id", filters.workspaceId);
  if (filters.stageId) q = q.eq("stage_id", filters.stageId);
  const term = (filters.search ?? "").trim();
  if (term) {
    const like = `%${term}%`;
    q = q.or(
      `email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like}`,
    );
  }
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];

  // Stage catalogue + platform-wide roll-ups come from real rows only.
  let stageQuery = db()
    .from("crm_stages")
    .select("id, workspace_id, key, name, color, position, is_won, is_lost")
    .order("position");
  if (filters.workspaceId) stageQuery = stageQuery.eq("workspace_id", filters.workspaceId);
  const { data: stages } = await stageQuery;

  const scope = filters.workspaceId ? { workspace_id: filters.workspaceId } : null;
  const countOf = async (table: string, apply?: (q: any) => any) => {
    let c = db().from(table).select("id", { count: "exact", head: true });
    if (scope) c = c.eq("workspace_id", scope.workspace_id);
    if (apply) c = apply(c);
    const { count: n } = await c;
    return n ?? 0;
  };

  const wonIds = (stages ?? []).filter((s: any) => s.is_won).map((s: any) => s.id);
  const lostIds = (stages ?? []).filter((s: any) => s.is_lost).map((s: any) => s.id);
  const openIds = (stages ?? [])
    .filter((s: any) => !s.is_won && !s.is_lost)
    .map((s: any) => s.id);

  const [contacts, active, won, lost, open, tasksOpen, tasksDone, notes, activities] =
    await Promise.all([
      countOf("leads"),
      countOf("leads", (c) => c.eq("archived", false)),
      wonIds.length ? countOf("leads", (c) => c.in("stage_id", wonIds)) : Promise.resolve(0),
      lostIds.length ? countOf("leads", (c) => c.in("stage_id", lostIds)) : Promise.resolve(0),
      openIds.length ? countOf("leads", (c) => c.in("stage_id", openIds)) : Promise.resolve(0),
      countOf("lead_tasks", (c) => c.eq("completed", false)),
      countOf("lead_tasks", (c) => c.eq("completed", true)),
      countOf("lead_notes"),
      countOf("lead_activities"),
    ]);

  let recentQuery = db()
    .from("lead_activities")
    .select("id, lead_id, workspace_id, campaign_id, type, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(25);
  if (filters.workspaceId) recentQuery = recentQuery.eq("workspace_id", filters.workspaceId);
  const { data: recent } = await recentQuery;

  const recentLeadIds = Array.from(
    new Set(((recent ?? []) as any[]).map((r) => r.lead_id).filter(Boolean)),
  );
  const { data: recentLeads } = recentLeadIds.length
    ? await db().from("leads").select("id, email").in("id", recentLeadIds)
    : { data: [] };
  const leadEmail: Dict<string> = {};
  for (const l of recentLeads ?? []) leadEmail[l.id] = l.email;

  const names = await workspaceNames([
    ...rows.map((r) => r.workspace_id),
    ...((recent ?? []) as any[]).map((r) => r.workspace_id),
  ]);
  const stageById: Dict<any> = {};
  for (const s of stages ?? []) stageById[s.id] = s;

  // Per-page task counts, so the table never shows an invented number.
  const ids = rows.map((r) => r.id);
  const { data: pageTasks } = ids.length
    ? await db().from("lead_tasks").select("lead_id, completed, due_at").in("lead_id", ids)
    : { data: [] };
  const openTasks: Dict<number> = {};
  for (const t of (pageTasks ?? []) as any[]) {
    if (!t.completed) openTasks[t.lead_id] = (openTasks[t.lead_id] ?? 0) + 1;
  }

  return {
    stats: {
      contacts,
      active,
      openDeals: open,
      wonDeals: won,
      lostDeals: lost,
      openTasks: tasksOpen,
      completedTasks: tasksDone,
      notes,
      activities,
    },
    stages: (stages ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      workspaceId: s.workspace_id,
      isWon: s.is_won,
      isLost: s.is_lost,
    })),
    recent: ((recent ?? []) as any[]).map((r) => ({
      id: r.id,
      type: r.type,
      detail: r.detail,
      at: r.created_at,
      leadEmail: leadEmail[r.lead_id] ?? null,
      leadId: r.lead_id,
      workspaceName: names[r.workspace_id] ?? "—",
    })),
    total: count ?? rows.length,
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
      company: r.company,
      jobTitle: r.job_title,
      status: r.status,
      stageName: r.stage_id ? (stageById[r.stage_id]?.name ?? null) : null,
      dealValue: r.deal_value,
      source: r.lead_source,
      archived: r.archived,
      tags: r.tags ?? [],
      workspaceId: r.workspace_id,
      workspaceName: names[r.workspace_id] ?? "—",
      openTasks: openTasks[r.id] ?? 0,
      lastActivityAt: r.last_activity_at,
      createdAt: r.created_at,
    })),
  };
}

export async function getAdminCrmContact(leadId: string) {
  const { data: lead, error } = await db()
    .from("leads")
    .select(
      "id, workspace_id, email, first_name, last_name, company, job_title, phone, website, city, state, country, linkedin_url, status, stage_id, owner_id, lead_source, deal_value, tags, archived, last_activity_at, created_at",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) throw new Error("Contact not found");

  const [stage, notes, tasks, activities, recipients, messages, replies, engagement, names] =
    await Promise.all([
      lead.stage_id
        ? db().from("crm_stages").select("id, name, is_won, is_lost").eq("id", lead.stage_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db()
        .from("lead_notes")
        .select("id, body, author_id, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(50),
      db()
        .from("lead_tasks")
        .select("id, title, due_at, completed, created_at")
        .eq("lead_id", leadId)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(50),
      db()
        .from("lead_activities")
        .select("id, type, detail, campaign_id, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(100),
      db()
        .from("campaign_recipients")
        .select("campaign_id, status, created_at")
        .eq("lead_id", leadId)
        .limit(100),
      db()
        .from("campaign_messages")
        .select("id, campaign_id, subject, status, sent_at, scheduled_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(100),
      db()
        .from("campaign_replies")
        .select("id, campaign_id, subject, sentiment, received_at")
        .eq("lead_id", leadId)
        .order("received_at", { ascending: false })
        .limit(50),
      db()
        .from("email_engagement_events")
        .select("id, event_type, campaign_id, occurred_at, url")
        .eq("lead_id", leadId)
        .order("occurred_at", { ascending: false })
        .limit(200),
      workspaceNames([lead.workspace_id]),
    ]);

  const campaignIds = Array.from(
    new Set(
      [
        ...((recipients as any).data ?? []).map((r: any) => r.campaign_id),
        ...((messages as any).data ?? []).map((m: any) => m.campaign_id),
      ].filter(Boolean),
    ),
  );
  const { data: campaigns } = campaignIds.length
    ? await db().from("campaigns").select("id, name, status").in("id", campaignIds)
    : { data: [] };
  const campaignById: Dict<any> = {};
  for (const c of campaigns ?? []) campaignById[c.id] = c;

  return {
    contact: {
      id: lead.id,
      email: lead.email,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null,
      company: lead.company,
      jobTitle: lead.job_title,
      phone: lead.phone,
      website: lead.website,
      linkedin: lead.linkedin_url,
      location: [lead.city, lead.state, lead.country].filter(Boolean).join(", ") || null,
      status: lead.status,
      source: lead.lead_source,
      dealValue: lead.deal_value,
      tags: lead.tags ?? [],
      archived: lead.archived,
      workspaceId: lead.workspace_id,
      workspaceName: (names as Dict<string>)[lead.workspace_id] ?? "—",
      stageName: (stage as any).data?.name ?? null,
      lastActivityAt: lead.last_activity_at,
      createdAt: lead.created_at,
    },
    notes: ((notes as any).data ?? []).map((n: any) => ({
      id: n.id,
      body: n.body,
      at: n.created_at,
    })),
    tasks: ((tasks as any).data ?? []).map((t: any) => ({
      id: t.id,
      title: t.title,
      dueAt: t.due_at,
      completed: t.completed,
    })),
    activities: ((activities as any).data ?? []).map((a: any) => ({
      id: a.id,
      type: a.type,
      detail: a.detail,
      at: a.created_at,
      campaignName: a.campaign_id ? (campaignById[a.campaign_id]?.name ?? null) : null,
    })),
    campaigns: ((recipients as any).data ?? []).map((r: any) => ({
      campaignId: r.campaign_id,
      campaignName: campaignById[r.campaign_id]?.name ?? "—",
      campaignStatus: campaignById[r.campaign_id]?.status ?? "—",
      status: r.status,
      addedAt: r.created_at,
    })),
    emails: ((messages as any).data ?? []).map((m: any) => ({
      id: m.id,
      subject: m.subject,
      status: m.status,
      at: m.sent_at ?? m.scheduled_at,
      campaignName: campaignById[m.campaign_id]?.name ?? "—",
    })),
    replies: ((replies as any).data ?? []).map((r: any) => ({
      id: r.id,
      subject: r.subject,
      sentiment: r.sentiment,
      at: r.received_at,
    })),
    engagement: ((engagement as any).data ?? []).map((e: any) => ({
      id: e.id,
      type: e.event_type,
      url: e.url,
      at: e.occurred_at,
    })),
  };
}

/* ========================================================== automations */

export type AdminAutomationFilters = {
  workspaceId?: string | null | undefined;
  status?: string | null | undefined;
  trigger?: string | null | undefined;
  from?: string | null | undefined;
  to?: string | null | undefined;
  search?: string | null | undefined;
};

export async function listAdminAutomations(filters: AdminAutomationFilters = {}) {
  let q = db()
    .from("automations")
    .select(
      "id, workspace_id, name, description, status, trigger_type, version, last_run_at, created_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (filters.workspaceId) q = q.eq("workspace_id", filters.workspaceId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.trigger) q = q.eq("trigger_type", filters.trigger);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as any[];
  const term = (filters.search ?? "").trim().toLowerCase();
  if (term) rows = rows.filter((r) => String(r.name).toLowerCase().includes(term));
  if (!rows.length) return [] as any[];

  const ids = rows.map((r) => r.id);
  const [runs, steps, names] = await Promise.all([
    db()
      .from("automation_runs")
      .select("id, automation_id, status, created_at, completed_at")
      .in("automation_id", ids)
      .limit(20000),
    db().from("automation_steps").select("id, automation_id").in("automation_id", ids),
    workspaceNames(rows.map((r) => r.workspace_id)),
  ]);

  const stats: Dict<{ runs: number; ok: number; failed: number; running: number; last: string | null }> =
    {};
  for (const r of ((runs as any).data ?? []) as any[]) {
    const s = (stats[r.automation_id] ??= { runs: 0, ok: 0, failed: 0, running: 0, last: null });
    s.runs += 1;
    if (r.status === "completed") s.ok += 1;
    if (r.status === "failed") s.failed += 1;
    if (["queued", "running", "waiting"].includes(r.status)) s.running += 1;
    const at = r.completed_at ?? r.created_at;
    if (at && (!s.last || at > s.last)) s.last = at;
  }
  const stepCount: Dict<number> = {};
  for (const s of ((steps as any).data ?? []) as any[]) {
    stepCount[s.automation_id] = (stepCount[s.automation_id] ?? 0) + 1;
  }

  return rows.map((r) => {
    const s = stats[r.id];
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      triggerType: r.trigger_type,
      version: r.version,
      steps: stepCount[r.id] ?? 0,
      runs: s?.runs ?? 0,
      successful: s?.ok ?? 0,
      failed: s?.failed ?? 0,
      inFlight: s?.running ?? 0,
      lastRunAt: r.last_run_at ?? s?.last ?? null,
      workspaceId: r.workspace_id,
      workspaceName: names[r.workspace_id] ?? "—",
      createdAt: r.created_at,
    };
  });
}

export async function getAdminAutomation(automationId: string) {
  // webhook_secret / webhook_token are deliberately never selected.
  const { data: automation, error } = await db()
    .from("automations")
    .select(
      "id, workspace_id, name, description, status, trigger_type, trigger_config, condition_logic, version, last_run_at, created_at, updated_at",
    )
    .eq("id", automationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!automation) throw new Error("Automation not found");

  const [steps, runs, names] = await Promise.all([
    db()
      .from("automation_steps")
      .select("id, position, kind, branch, config")
      .eq("automation_id", automationId)
      .order("position"),
    db()
      .from("automation_runs")
      .select(
        "id, status, trigger_type, current_step, branch, attempts, error, result, resume_at, started_at, completed_at, created_at, lead_id, campaign_id",
      )
      .eq("automation_id", automationId)
      .order("created_at", { ascending: false })
      .limit(50),
    workspaceNames([automation.workspace_id]),
  ]);

  const runIds = ((runs as any).data ?? []).map((r: any) => r.id);
  const { data: runSteps } = runIds.length
    ? await db()
        .from("automation_run_steps")
        .select("id, run_id, position, kind, label, status, error, started_at, finished_at")
        .in("run_id", runIds)
        .order("position")
    : { data: [] };
  const byRun: Dict<any[]> = {};
  for (const s of runSteps ?? []) (byRun[s.run_id] ??= []).push(s);

  const leadIds = Array.from(
    new Set(((runs as any).data ?? []).map((r: any) => r.lead_id).filter(Boolean)),
  );
  const { data: leads } = leadIds.length
    ? await db().from("leads").select("id, email").in("id", leadIds)
    : { data: [] };
  const leadEmail: Dict<string> = {};
  for (const l of leads ?? []) leadEmail[l.id] = l.email;

  const all = ((runs as any).data ?? []) as any[];
  return {
    automation: {
      id: automation.id,
      name: automation.name,
      description: automation.description,
      status: automation.status,
      triggerType: automation.trigger_type,
      triggerConfig: automation.trigger_config ?? {},
      conditionLogic: automation.condition_logic,
      version: automation.version,
      workspaceId: automation.workspace_id,
      workspaceName: (names as Dict<string>)[automation.workspace_id] ?? "—",
      lastRunAt: automation.last_run_at,
      createdAt: automation.created_at,
      updatedAt: automation.updated_at,
    },
    steps: ((steps as any).data ?? []).map((s: any) => ({
      id: s.id,
      position: s.position,
      kind: s.kind,
      branch: s.branch,
      config: s.config ?? {},
    })),
    runs: all.map((r) => ({
      id: r.id,
      status: r.status,
      triggerType: r.trigger_type,
      currentStep: r.current_step,
      attempts: r.attempts,
      error: r.error,
      result: r.result,
      resumeAt: r.resume_at,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
      leadEmail: r.lead_id ? (leadEmail[r.lead_id] ?? null) : null,
      steps: (byRun[r.id] ?? []).map((s: any) => ({
        id: s.id,
        position: s.position,
        kind: s.kind,
        label: s.label,
        status: s.status,
        error: s.error,
        startedAt: s.started_at,
        finishedAt: s.finished_at,
      })),
    })),
    errors: all
      .filter((r) => r.status === "failed" && r.error)
      .slice(0, 20)
      .map((r) => ({ id: r.id, error: r.error as string, at: r.completed_at ?? r.created_at })),
  };
}

/**
 * Enable, disable or pause a customer automation.
 *
 * This only writes `automations.status`, exactly like the customer-facing
 * control does — the existing engine, queue and worker keep every safety
 * control. No run is forced, replayed or skipped from here.
 */
export async function adminAutomationAction(
  actorId: string,
  automationId: string,
  action: "enable" | "disable" | "pause",
) {
  const { data: automation, error } = await db()
    .from("automations")
    .select("id, name, status, workspace_id")
    .eq("id", automationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!automation) throw new Error("Automation not found");

  const status = action === "enable" ? "active" : action === "pause" ? "paused" : "draft";
  if (automation.status === "archived") throw new Error("Archived automations cannot be changed");

  const { error: uErr } = await db()
    .from("automations")
    .update({ status })
    .eq("id", automationId);
  if (uErr) throw new Error(uErr.message);

  await db().from("admin_audit_log").insert({
    actor_id: actorId,
    action: `automation.${action}`,
    target_type: "automation",
    target_id: automationId,
    target_label: automation.name,
    detail: { workspaceId: automation.workspace_id, from: automation.status, to: status },
  });

  return { ok: true, status };
}

/* ============================================================ analytics */

export type AdminAnalyticsFilters = {
  from: string;
  to: string;
  workspaceId?: string | null | undefined;
  campaignId?: string | null | undefined;
  sendingAccountId?: string | null | undefined;
  planId?: string | null | undefined;
};

const EVENT_LIMIT = 50000;

/**
 * Platform analytics from the source-of-truth tables.
 *
 * - Sends come from `campaign_messages.sent_at` (one row per email).
 * - Opens/clicks/bounces/unsubscribes come from `email_engagement_events`,
 *   deduplicated by event id, and opens/clicks additionally deduplicated by
 *   message so repeat pixel loads never inflate the number.
 * - Replies come from `campaign_replies` (one row per received reply).
 * Every filter is applied in SQL, so a workspace filter cannot leak rows of
 * another workspace into a total.
 */
export async function adminPlatformAnalytics(filters: AdminAnalyticsFilters) {
  const { from, to } = filters;

  // Plan filter resolves to the set of workspaces on that plan.
  let planWorkspaces: string[] | null = null;
  if (filters.planId) {
    const { data } = await db()
      .from("billing_subscriptions")
      .select("workspace_id")
      .eq("plan_id", filters.planId)
      .limit(5000);
    planWorkspaces = Array.from(new Set((data ?? []).map((r: any) => r.workspace_id)));
    if (filters.workspaceId) {
      planWorkspaces = planWorkspaces.filter((id) => id === filters.workspaceId);
    }
    if (!planWorkspaces.length) planWorkspaces = ["00000000-0000-0000-0000-000000000000"];
  }

  const scope = (q: any, column = "workspace_id") => {
    if (planWorkspaces) q = q.in(column, planWorkspaces);
    else if (filters.workspaceId) q = q.eq(column, filters.workspaceId);
    return q;
  };
  const outreachScope = (q: any) => {
    let out = scope(q);
    if (filters.campaignId) out = out.eq("campaign_id", filters.campaignId);
    if (filters.sendingAccountId) out = out.eq("sending_account_id", filters.sendingAccountId);
    return out;
  };

  const [messages, events, replies, campaigns, transactions, subscriptions] = await Promise.all([
    outreachScope(
      db()
        .from("campaign_messages")
        .select("id, status, sent_at, campaign_id, workspace_id")
        .gte("sent_at", from)
        .lte("sent_at", to)
        .limit(EVENT_LIMIT),
    ),
    outreachScope(
      db()
        .from("email_engagement_events")
        .select("id, event_type, message_id, campaign_id, occurred_at")
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .limit(EVENT_LIMIT),
    ),
    outreachScope(
      db()
        .from("campaign_replies")
        .select("id, campaign_id, received_at")
        .gte("received_at", from)
        .lte("received_at", to)
        .limit(EVENT_LIMIT),
    ),
    scope(db().from("campaigns").select("id, status, created_at").limit(5000)),
    scope(
      db()
        .from("billing_transactions")
        .select("id, kind, status, amount_cents, currency, occurred_at")
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .limit(EVENT_LIMIT),
    ),
    scope(
      db()
        .from("billing_subscriptions")
        .select(
          "id, status, amount_cents, currency, billing_interval, manual_override, current_period_start, current_period_end, created_at, cancelled_at, plan_id",
        )
        .limit(5000),
    ),
  ]);

  for (const r of [messages, events, replies, campaigns, transactions, subscriptions] as any[]) {
    if (r.error) throw new Error(r.error.message);
  }

  const messageRows = (messages.data ?? []) as any[];
  const sent = messageRows.filter((m) => m.status === "sent").length;
  const failedSends = messageRows.filter((m) => m.status === "failed").length;

  // Dedupe: unique event ids, and unique message per open/click.
  const seenEvent = new Set<string>();
  const uniqueByMessage: Dict<Set<string>> = {};
  const totals: Dict<number> = {};
  for (const e of (events.data ?? []) as any[]) {
    if (seenEvent.has(e.id)) continue;
    seenEvent.add(e.id);
    const type = String(e.event_type);
    totals[type] = (totals[type] ?? 0) + 1;
    const key = e.message_id ?? e.id;
    ((uniqueByMessage[type] ??= new Set<string>())).add(key);
  }
  const uniq = (type: string) => uniqueByMessage[type]?.size ?? 0;

  const email = {
    sent,
    delivered: uniq("delivered"),
    opens: uniq("open") + uniq("opened"),
    openEvents: (totals["open"] ?? 0) + (totals["opened"] ?? 0),
    clicks: uniq("click") + uniq("clicked"),
    clickEvents: (totals["click"] ?? 0) + (totals["clicked"] ?? 0),
    replies: new Set(((replies.data ?? []) as any[]).map((r) => r.id)).size,
    bounces: uniq("bounce") + uniq("bounced"),
    unsubscribes: uniq("unsubscribe") + uniq("unsubscribed"),
    complaints: uniq("complaint") + uniq("complained"),
    failedSends,
  };

  const campaignRows = (campaigns.data ?? []) as any[];
  const campaignStats = {
    active: campaignRows.filter((c) => c.status === "active").length,
    paused: campaignRows.filter((c) => c.status === "paused").length,
    completed: campaignRows.filter((c) => c.status === "completed").length,
    draft: campaignRows.filter((c) => c.status === "draft").length,
    createdInRange: campaignRows.filter((c) => c.created_at >= from && c.created_at <= to).length,
  };

  // Per-campaign performance in range, derived from the same deduped events.
  const perCampaign: Dict<{ sent: number; replies: number }> = {};
  for (const m of messageRows) {
    if (m.status !== "sent" || !m.campaign_id) continue;
    (perCampaign[m.campaign_id] ??= { sent: 0, replies: 0 }).sent += 1;
  }
  for (const r of (replies.data ?? []) as any[]) {
    if (!r.campaign_id) continue;
    (perCampaign[r.campaign_id] ??= { sent: 0, replies: 0 }).replies += 1;
  }
  const topIds = Object.keys(perCampaign)
    .sort((a, b) => perCampaign[b]!.sent - perCampaign[a]!.sent)
    .slice(0, 10);
  const { data: topCampaignRows } = topIds.length
    ? await db().from("campaigns").select("id, name, status, workspace_id").in("id", topIds)
    : { data: [] };
  const topNames: Dict<any> = {};
  for (const c of topCampaignRows ?? []) topNames[c.id] = c;
  const topCampaigns = topIds.map((id) => ({
    id,
    name: topNames[id]?.name ?? "—",
    status: topNames[id]?.status ?? "—",
    sent: perCampaign[id]!.sent,
    replies: perCampaign[id]!.replies,
  }));

  // Customers: profiles/workspaces are platform-level, so the workspace or
  // plan filter narrows them to the selected scope instead of guessing.
  let workspaceQuery = db().from("workspaces").select("id, created_at, status").limit(5000);
  workspaceQuery = scope(workspaceQuery, "id");
  const { data: workspaceRows } = await workspaceQuery;
  const workspaceIds = (workspaceRows ?? []).map((w: any) => w.id);

  const activeWorkspaceIds = new Set(
    messageRows.map((m) => m.workspace_id).filter(Boolean) as string[],
  );

  let newUsers = 0;
  let activeUsers = 0;
  if (planWorkspaces || filters.workspaceId) {
    const { data: members } = workspaceIds.length
      ? await db()
          .from("workspace_members")
          .select("user_id, created_at")
          .in("workspace_id", workspaceIds)
          .limit(5000)
      : { data: [] };
    const ids = Array.from(new Set((members ?? []).map((m: any) => m.user_id)));
    activeUsers = ids.length;
    const { count } = ids.length
      ? await db()
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .in("id", ids)
          .gte("created_at", from)
          .lte("created_at", to)
      : { count: 0 };
    newUsers = count ?? 0;
  } else {
    const [{ count: created }, { count: total }] = await Promise.all([
      db()
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", from)
        .lte("created_at", to),
      db().from("profiles").select("id", { count: "exact", head: true }),
    ]);
    newUsers = created ?? 0;
    activeUsers = total ?? 0;
  }

  const customers = {
    newUsers,
    totalUsers: activeUsers,
    newWorkspaces: (workspaceRows ?? []).filter(
      (w: any) => w.created_at >= from && w.created_at <= to,
    ).length,
    totalWorkspaces: (workspaceRows ?? []).length,
    activeWorkspaces: activeWorkspaceIds.size,
  };

  const txRows = (transactions.data ?? []) as any[];
  const succeeded = txRows.filter(
    (t) => t.status === "succeeded" || t.status === "paid" || t.status === "completed",
  );
  const revenueCents = succeeded
    .filter((t) => t.kind !== "refund")
    .reduce((sum, t) => sum + (t.amount_cents ?? 0), 0);
  const refundCents = succeeded
    .filter((t) => t.kind === "refund")
    .reduce((sum, t) => sum + (t.amount_cents ?? 0), 0);
  const subRows = (subscriptions.data ?? []) as any[];

  // Recurring revenue. Manually granted / admin-assigned plans never produce a
  // payment transaction, so cash alone reports $0 while a paid plan is live.
  // We normalise every live subscription to a monthly amount (MRR) and
  // recognise the share of it that falls inside the selected range.
  const DAY = 24 * 60 * 60 * 1000;
  const AVG_MONTH_DAYS = 30.436875;
  const rangeStart = new Date(from).getTime();
  const rangeEnd = new Date(to).getTime();
  const monthlyAmount = (s: any) => {
    const amount = s.amount_cents ?? 0;
    switch (s.billing_interval) {
      case "yearly":
        return amount / 12;
      case "quarterly":
        return amount / 3;
      case "weekly":
        return (amount * 52) / 12;
      case "daily":
        return (amount * 365) / 12;
      default:
        return amount;
    }
  };
  const liveSubs = subRows.filter((s) => s.status === "active" || s.status === "trialing");
  const billableSubs = liveSubs.filter((s) => s.status === "active");
  const mrrCents = Math.round(billableSubs.reduce((sum, s) => sum + monthlyAmount(s), 0));

  let recognizedCents = 0;
  for (const s of billableSubs) {
    const startedAt = new Date(s.current_period_start ?? s.created_at).getTime();
    const endedAt = s.cancelled_at ? new Date(s.cancelled_at).getTime() : rangeEnd;
    const overlapMs = Math.min(rangeEnd, endedAt) - Math.max(rangeStart, startedAt);
    if (overlapMs <= 0) continue;
    recognizedCents += (monthlyAmount(s) * (overlapMs / DAY)) / AVG_MONTH_DAYS;
  }
  recognizedCents = Math.round(recognizedCents);

  // Cash collected through a payment provider for those same subscriptions, so
  // recognised revenue is only added where no transaction already covers it.
  const collectedSubIds = new Set(
    succeeded.filter((t) => t.subscription_id).map((t) => t.subscription_id as string),
  );
  let uncollectedRecognizedCents = 0;
  for (const s of billableSubs) {
    if (collectedSubIds.has(s.id)) continue;
    const startedAt = new Date(s.current_period_start ?? s.created_at).getTime();
    const endedAt = s.cancelled_at ? new Date(s.cancelled_at).getTime() : rangeEnd;
    const overlapMs = Math.min(rangeEnd, endedAt) - Math.max(rangeStart, startedAt);
    if (overlapMs <= 0) continue;
    uncollectedRecognizedCents += (monthlyAmount(s) * (overlapMs / DAY)) / AVG_MONTH_DAYS;
  }
  uncollectedRecognizedCents = Math.round(uncollectedRecognizedCents);

  const grossCents = revenueCents + uncollectedRecognizedCents;
  const revenue = {
    revenueCents: grossCents - refundCents,
    grossCents,
    refundCents,
    collectedCents: revenueCents - refundCents,
    recognizedCents,
    mrrCents,
    arrCents: mrrCents * 12,
    currency: succeeded[0]?.currency ?? billableSubs[0]?.currency ?? "usd",
    transactions: txRows.length,
    failedPayments: txRows.filter((t) => t.status === "failed" || t.status === "payment_failed")
      .length,
    activeSubscriptions: liveSubs.length,
    newSubscriptions: subRows.filter((s) => s.created_at >= from && s.created_at <= to).length,
    cancellations: subRows.filter(
      (s) => s.cancelled_at && s.cancelled_at >= from && s.cancelled_at <= to,
    ).length,
    pastDue: subRows.filter((s) => s.status === "past_due" || s.status === "payment_failed").length,
  };

  const [webhookFailures, automationFailures, providerErrors, inboundFailures] = await Promise.all([
    db()
      .from("billing_webhook_events")
      .select("id", { count: "exact", head: true })
      .neq("status", "processed")
      .gte("received_at", from)
      .lte("received_at", to),
    scope(
      db()
        .from("automation_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", from)
        .lte("created_at", to),
    ),
    scope(
      db()
        .from("sending_accounts")
        .select("id", { count: "exact", head: true })
        .not("last_error", "is", null),
    ),
    scope(
      db()
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", from)
        .lte("created_at", to),
    ),
  ]);

  const system = {
    failedSends,
    failedWebhooks: webhookFailures.count ?? 0,
    automationFailures: automationFailures.count ?? 0,
    providerErrors: providerErrors.count ?? 0,
    inboundFailures: inboundFailures.count ?? 0,
  };

  return {
    range: { from, to },
    email,
    campaigns: campaignStats,
    topCampaigns,
    customers,
    revenue,
    system,
    truncated: messageRows.length >= EVENT_LIMIT || seenEvent.size >= EVENT_LIMIT,
  };
}

/** Workspace/campaign/mailbox/plan options for the analytics filter bar. */
export async function adminAnalyticsFilterOptions() {
  const [workspaces, campaigns, accounts, plans, triggers] = await Promise.all([
    db().from("workspaces").select("id, name").order("name").limit(500),
    db().from("campaigns").select("id, name, workspace_id").order("name").limit(500),
    db()
      .from("sending_accounts")
      .select("id, from_email, workspace_id")
      .order("from_email")
      .limit(500),
    db().from("plans").select("id, name").order("sort_order").limit(100),
    db().from("automations").select("trigger_type").limit(1000),
  ]);
  return {
    workspaces: (workspaces.data ?? []).map((w: any) => ({ id: w.id, name: w.name })),
    campaigns: (campaigns.data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      workspaceId: c.workspace_id,
    })),
    sendingAccounts: (accounts.data ?? []).map((a: any) => ({
      id: a.id,
      email: a.from_email,
      workspaceId: a.workspace_id,
    })),
    plans: (plans.data ?? []).map((p: any) => ({ id: p.id, name: p.name })),
    triggers: Array.from(
      new Set(((triggers.data ?? []) as any[]).map((t) => t.trigger_type).filter(Boolean)),
    ),
  };
}
