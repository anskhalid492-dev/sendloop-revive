/**
 * Server-only automation workflow engine.
 *
 * Design rules:
 *  - every run is a database row, so a page refresh, browser close, worker
 *    restart or deployment never loses an execution;
 *  - waits are persisted as `resume_at` and resumed by the cron worker — there
 *    are no timers anywhere;
 *  - events carry an idempotency key, so a webhook retry never executes the
 *    same workflow twice;
 *  - a run freezes the workflow definition at enqueue time, so editing a live
 *    automation cannot corrupt in-flight executions;
 *  - actions never send prospect email directly. They operate on the real
 *    campaign, CRM, task and notification tables and always respect
 *    suppression, unsubscribe and bounce state.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ConditionConfig, OperatorId, WaitConfig } from "@/lib/automation-model";

type Db = typeof supabaseAdmin;

export type EmitArgs = {
  workspaceId: string;
  type: string;
  /** Stable per real-world event; the same key never executes twice. */
  idempotencyKey: string;
  leadId?: string | null;
  campaignId?: string | null;
  conversationId?: string | null;
  payload?: Record<string, unknown>;
};

type StepDef = {
  id: string | null;
  position: number;
  kind: "condition" | "action" | "wait" | "branch";
  branch: "yes" | "no" | null;
  config: Record<string, unknown>;
};

type RunRow = {
  id: string;
  automation_id: string;
  workspace_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  trigger_type: string;
  current_step: number;
  attempts: number;
  branch: string | null;
  metadata: Record<string, unknown>;
  definition: { steps?: StepDef[]; logic?: string; name?: string };
};

/* ------------------------------------------------------------ emitting */

/**
 * Records a real event and enqueues one run per matching active automation.
 * Safe to call from any server path; failures never propagate to the caller.
 */
export async function emitAutomationEvent(args: EmitArgs): Promise<{ runs: number }> {
  try {
    return await emitInner(args);
  } catch (error) {
    console.error("automation emit failed", args.type, error);
    return { runs: 0 };
  }
}

async function emitInner(args: EmitArgs): Promise<{ runs: number }> {
  const db = supabaseAdmin;

  const { data: automations } = await db
    .from("automations")
    .select("id, workspace_id, name, trigger_type, trigger_config, condition_logic, version, status")
    .eq("workspace_id", args.workspaceId)
    .eq("trigger_type", args.type)
    .eq("status", "active");

  const matched = (automations ?? []) as {
    id: string;
    name: string;
    trigger_config: Record<string, unknown>;
    condition_logic: string;
    version: number;
  }[];

  // The event is always logged (even with no listener) so the activity view
  // shows what the backend actually received.
  const { data: event, error } = await db
    .from("automation_events")
    .insert({
      workspace_id: args.workspaceId,
      event_type: args.type,
      idempotency_key: args.idempotencyKey.slice(0, 400),
      lead_id: args.leadId ?? null,
      campaign_id: args.campaignId ?? null,
      conversation_id: args.conversationId ?? null,
      payload: (args.payload ?? {}) as never,
      matched_automations: matched.length,
    })
    .select("id")
    .maybeSingle();

  // 23505 = this exact event was already recorded: a duplicate webhook or a
  // retried provider callback. Do nothing.
  if (error) return { runs: 0 };
  if (!event || matched.length === 0) return { runs: 0 };

  let created = 0;
  for (const automation of matched) {
    // Trigger-level filters (e.g. only for one campaign) run before enqueue.
    if (!triggerMatches(automation.trigger_config, args)) continue;

    const steps = await loadSteps(db, automation.id);
    const { error: runError } = await db.from("automation_runs").insert({
      automation_id: automation.id,
      workspace_id: args.workspaceId,
      event_id: event.id,
      lead_id: args.leadId ?? null,
      campaign_id: args.campaignId ?? null,
      trigger_type: args.type,
      status: "queued",
      metadata: { event: args.payload ?? {} } as never,
      definition: { steps, logic: automation.condition_logic, name: automation.name } as never,
      automation_version: automation.version,
    });
    if (!runError) created += 1;
  }

  if (created > 0) {
    await db
      .from("automations")
      .update({ last_run_at: new Date().toISOString() })
      .in("id", matched.map((a) => a.id));
    // Execute straight away so the UI reflects reality within a second; the
    // cron worker still picks up anything left behind.
    void runAutomationCycle(20).catch(() => undefined);
  }
  return { runs: created };
}

function triggerMatches(config: Record<string, unknown>, args: EmitArgs): boolean {
  const campaignId = typeof config["campaignId"] === "string" ? (config["campaignId"] as string) : "";
  if (campaignId && campaignId !== args.campaignId) return false;
  return true;
}

async function loadSteps(db: Db, automationId: string): Promise<StepDef[]> {
  const { data } = await db
    .from("automation_steps")
    .select("id, position, kind, branch, config")
    .eq("automation_id", automationId)
    .order("position", { ascending: true });
  return ((data ?? []) as StepDef[]).map((s) => ({
    id: s.id,
    position: s.position,
    kind: s.kind,
    branch: s.branch ?? null,
    config: s.config ?? {},
  }));
}

/* ------------------------------------------------------------- worker */

export async function runAutomationCycle(limit = 50): Promise<{
  claimed: number;
  completed: number;
  waiting: number;
  failed: number;
}> {
  const db = supabaseAdmin;
  const worker = `worker-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await db.rpc("claim_automation_runs", { _worker: worker, _limit: limit });
  if (error) throw new Error(error.message);

  const runs = (data ?? []) as RunRow[];
  let completed = 0;
  let waiting = 0;
  let failed = 0;

  for (const run of runs) {
    const outcome = await executeRun(run);
    if (outcome === "waiting") waiting += 1;
    else if (outcome === "failed") failed += 1;
    else completed += 1;
  }

  return { claimed: runs.length, completed, waiting, failed };
}

type Outcome = "completed" | "waiting" | "failed";

async function executeRun(run: RunRow): Promise<Outcome> {
  const db = supabaseAdmin;
  const steps = (run.definition?.steps ?? []).slice().sort((a, b) => a.position - b.position);
  const logic = run.definition?.logic === "or" ? "or" : "and";

  let context: RunContext;
  try {
    context = await loadContext(db, run);
  } catch (error) {
    return finishRun(db, run, "failed", (error as Error).message);
  }

  // Conditions gate the whole workflow and are evaluated together with the
  // configured AND/OR logic before any action runs.
  const conditionSteps = steps.filter((s) => s.kind === "condition");
  if (run.current_step === 0 && conditionSteps.length > 0) {
    const results = conditionSteps.map((s) => evaluateCondition(s.config as unknown as ConditionConfig, context));
    const pass = logic === "or" ? results.some(Boolean) : results.every(Boolean);
    for (let i = 0; i < conditionSteps.length; i += 1) {
      const step = conditionSteps[i]!;
      await recordStep(db, run, step, results[i] ? "completed" : "skipped", { passed: results[i] });
    }
    if (!pass) {
      return finishRun(db, run, "completed", null, "Conditions not met");
    }
  }

  const executable = steps.filter((s) => s.kind !== "condition");
  const activeBranch = run.branch ?? null;

  for (let index = run.current_step; index < executable.length; index += 1) {
    const step = executable[index]!;

    // Branch steps split the flow; only the matching side executes afterwards.
    if (step.kind === "branch") {
      const passed = evaluateCondition(step.config as unknown as ConditionConfig, context);
      await recordStep(db, run, step, "completed", { branch: passed ? "yes" : "no" });
      await db
        .from("automation_runs")
        .update({ branch: passed ? "yes" : "no", current_step: index + 1 })
        .eq("id", run.id);
      run.branch = passed ? "yes" : "no";
      continue;
    }

    // Steps that belong to the other side of a branch are skipped.
    if (step.branch && run.branch && step.branch !== run.branch) {
      await recordStep(db, run, step, "skipped", { reason: "other branch" });
      continue;
    }
    if (step.branch && !run.branch && !activeBranch) {
      await recordStep(db, run, step, "skipped", { reason: "branch not taken" });
      continue;
    }

    if (step.kind === "wait") {
      const resumeAt = computeResume(step.config as unknown as WaitConfig, context.timezone, context.window);
      await recordStep(db, run, step, "waiting", { resume_at: resumeAt });
      await db
        .from("automation_runs")
        .update({ status: "waiting", resume_at: resumeAt, current_step: index + 1, locked_by: null, locked_at: null })
        .eq("id", run.id);
      return "waiting";
    }

    const type = String((step.config as { type?: string }).type ?? "");
    if (type === "end") {
      await recordStep(db, run, step, "completed", { ended: true });
      return finishRun(db, run, "completed", null, "Ended by step");
    }

    try {
      const output = await runAction(db, type, step.config, run, context);
      await recordStep(db, run, step, "completed", output);
      await db.from("automation_runs").update({ current_step: index + 1 }).eq("id", run.id);
    } catch (error) {
      const message = (error as Error).message;
      await recordStep(db, run, step, "failed", {}, message);
      const retryable = isRetryable(message) && run.attempts < 4;
      if (retryable) {
        // Exponential backoff, preserving the run and its position so no
        // completed action is ever repeated.
        const delayMinutes = Math.min(30, 2 ** run.attempts);
        await db
          .from("automation_runs")
          .update({
            status: "waiting",
            resume_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
            error: message,
            current_step: index,
            locked_by: null,
            locked_at: null,
          })
          .eq("id", run.id);
        return "waiting";
      }
      return finishRun(db, run, "failed", message);
    }
  }

  return finishRun(db, run, "completed", null, "All steps executed");
}

function isRetryable(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("network") ||
    m.includes("fetch failed") ||
    m.includes("rate limit") ||
    m.includes("503") ||
    m.includes("502") ||
    m.includes("429")
  );
}

async function finishRun(
  db: Db,
  run: RunRow,
  status: "completed" | "failed",
  error: string | null,
  result?: string,
): Promise<Outcome> {
  await db
    .from("automation_runs")
    .update({
      status,
      error,
      result: result ?? (error ? "Failed" : null),
      completed_at: new Date().toISOString(),
      locked_by: null,
      locked_at: null,
    })
    .eq("id", run.id);
  return status === "failed" ? "failed" : "completed";
}

async function recordStep(
  db: Db,
  run: RunRow,
  step: StepDef,
  status: "completed" | "skipped" | "waiting" | "failed",
  output: Record<string, unknown>,
  error?: string,
) {
  const label =
    step.kind === "wait"
      ? "Wait"
      : step.kind === "condition" || step.kind === "branch"
        ? `${step.kind === "branch" ? "Branch" : "Condition"}: ${(step.config as { field?: string }).field ?? ""}`
        : String((step.config as { type?: string }).type ?? step.kind);

  // Unique on (run_id, position, kind): a resumed run never double-logs.
  await db.from("automation_run_steps").upsert(
    {
      run_id: run.id,
      workspace_id: run.workspace_id,
      step_id: step.id,
      position: step.position,
      kind: step.kind,
      label,
      status,
      output: output as never,
      error: error ?? null,
      finished_at: status === "waiting" ? null : new Date().toISOString(),
    },
    { onConflict: "run_id,position,kind" },
  );
}

/* ------------------------------------------------------------ context */

type RunContext = {
  workspaceId: string;
  timezone: string;
  window: { days: number[]; start: number; end: number };
  lead: Record<string, unknown> | null;
  stageKey: string | null;
  stageName: string | null;
  campaign: { id: string; name: string; status: string; stop_on_reply: boolean } | null;
  activity: { emails_sent: number; opens: number; clicks: number; replies: number; bounced: number; open_tasks: number };
  event: Record<string, unknown>;
};

async function loadContext(db: Db, run: RunRow): Promise<RunContext> {
  const { data: workspace } = await db
    .from("workspaces")
    .select("timezone, sending_timezone, send_days, send_start_hour, send_end_hour")
    .eq("id", run.workspace_id)
    .maybeSingle();

  const ws = workspace as {
    timezone: string | null;
    sending_timezone: string | null;
    send_days: number[] | null;
    send_start_hour: number | null;
    send_end_hour: number | null;
  } | null;

  let lead: Record<string, unknown> | null = null;
  let stageKey: string | null = null;
  let stageName: string | null = null;
  if (run.lead_id) {
    const { data } = await db.from("leads").select("*").eq("id", run.lead_id).maybeSingle();
    lead = (data as Record<string, unknown>) ?? null;
    const stageId = lead?.["stage_id"] as string | null | undefined;
    if (stageId) {
      const { data: stage } = await db.from("crm_stages").select("key, name").eq("id", stageId).maybeSingle();
      stageKey = (stage as { key?: string } | null)?.key ?? null;
      stageName = (stage as { name?: string } | null)?.name ?? null;
    }
  }

  let campaign: RunContext["campaign"] = null;
  if (run.campaign_id) {
    const { data } = await db
      .from("campaigns")
      .select("id, name, status, stop_on_reply")
      .eq("id", run.campaign_id)
      .maybeSingle();
    campaign = (data as RunContext["campaign"]) ?? null;
  }

  const activity = { emails_sent: 0, opens: 0, clicks: 0, replies: 0, bounced: 0, open_tasks: 0 };
  if (run.lead_id) {
    const [sent, events, replies, tasks] = await Promise.all([
      db.from("campaign_messages").select("id", { count: "exact", head: true }).eq("lead_id", run.lead_id).eq("status", "sent"),
      db.from("email_engagement_events").select("event_type").eq("lead_id", run.lead_id),
      db.from("campaign_replies").select("id", { count: "exact", head: true }).eq("lead_id", run.lead_id),
      db.from("lead_tasks").select("id", { count: "exact", head: true }).eq("lead_id", run.lead_id).eq("completed", false),
    ]);
    activity.emails_sent = sent.count ?? 0;
    activity.replies = replies.count ?? 0;
    activity.open_tasks = tasks.count ?? 0;
    for (const row of (events.data ?? []) as { event_type: string }[]) {
      if (row.event_type === "opened") activity.opens += 1;
      if (row.event_type === "clicked") activity.clicks += 1;
      if (row.event_type === "bounced") activity.bounced += 1;
    }
  }

  return {
    workspaceId: run.workspace_id,
    timezone: ws?.sending_timezone || ws?.timezone || "UTC",
    window: {
      days: ws?.send_days?.length ? ws.send_days : [1, 2, 3, 4, 5],
      start: ws?.send_start_hour ?? 9,
      end: ws?.send_end_hour ?? 17,
    },
    lead,
    stageKey,
    stageName,
    campaign,
    activity,
    event: (run.metadata?.["event"] as Record<string, unknown>) ?? {},
  };
}

/* ---------------------------------------------------------- conditions */

function fieldValue(field: string, ctx: RunContext): unknown {
  const [group, key] = field.split(".");
  if (group === "lead") return ctx.lead?.[key ?? ""] ?? null;
  if (group === "crm") {
    if (key === "stage") return ctx.stageKey ?? ctx.stageName;
    if (key === "open_tasks") return ctx.activity.open_tasks;
  }
  if (group === "campaign") return ctx.campaign ? (ctx.campaign as Record<string, unknown>)[key ?? ""] : null;
  if (group === "activity") return (ctx.activity as unknown as Record<string, number>)[key ?? ""] ?? 0;
  if (group === "reply") return ctx.event["sentiment"] ?? null;
  if (group === "mailbox") return ctx.event[key === "email" ? "mailbox" : "warmupStatus"] ?? null;
  if (group === "meeting") return ctx.event["meetingStatus"] ?? null;
  if (group === "event") return ctx.event["type"] ?? null;
  return null;
}

export function evaluateCondition(condition: ConditionConfig, ctx: RunContext): boolean {
  const raw = fieldValue(condition.field ?? "", ctx);
  const operator = condition.operator as OperatorId;
  const expected = (condition.value ?? "").trim();

  const asArray = Array.isArray(raw) ? (raw as unknown[]).map((v) => String(v).toLowerCase()) : null;
  const text = raw === null || raw === undefined ? "" : Array.isArray(raw) ? asArray!.join(",") : String(raw);
  const lower = text.toLowerCase();
  const wanted = expected.toLowerCase();

  switch (operator) {
    case "equals":
      return asArray ? asArray.includes(wanted) : lower === wanted;
    case "not_equals":
      return asArray ? !asArray.includes(wanted) : lower !== wanted;
    case "contains":
      return lower.includes(wanted);
    case "not_contains":
      return !lower.includes(wanted);
    case "is_empty":
      return text.trim().length === 0;
    case "is_not_empty":
      return text.trim().length > 0;
    case "greater_than":
      return Number(raw) > Number(expected);
    case "less_than":
      return Number(raw) < Number(expected);
    default:
      return false;
  }
}

/* ---------------------------------------------------------------- wait */

/** Local wall-clock parts of `date` in `timezone`. */
function zonedParts(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: dayMap[parts["weekday"] ?? "Mon"] ?? 1,
    hour: Number(parts["hour"] ?? "0") % 24,
    minute: Number(parts["minute"] ?? "0"),
  };
}

export function computeResume(
  config: WaitConfig,
  timezone: string,
  window: { days: number[]; start: number; end: number },
): string {
  const now = Date.now();
  const amount = Math.max(1, Number(config.amount ?? 1));

  if (config.mode === "minutes") return new Date(now + amount * 60_000).toISOString();
  if (config.mode === "hours") return new Date(now + amount * 3_600_000).toISOString();
  if (config.mode === "days") return new Date(now + amount * 86_400_000).toISOString();

  if (config.mode === "until_time") {
    const [h, m] = (config.time ?? "09:00").split(":").map((v) => Number(v));
    // Step forward in 15-minute slices until the workspace-local clock matches.
    for (let i = 1; i <= 96 * 2; i += 1) {
      const candidate = new Date(now + i * 15 * 60_000);
      const p = zonedParts(candidate, timezone);
      if (p.hour === (h ?? 9) && Math.abs(p.minute - (m ?? 0)) < 15) return candidate.toISOString();
    }
    return new Date(now + 86_400_000).toISOString();
  }

  // business_hours: the next slot inside the workspace's own sending window.
  for (let i = 0; i <= 24 * 14; i += 1) {
    const candidate = new Date(now + i * 3_600_000);
    const p = zonedParts(candidate, timezone);
    if (window.days.includes(p.weekday) && p.hour >= window.start && p.hour < window.end) {
      return candidate.toISOString();
    }
  }
  return new Date(now + 3_600_000).toISOString();
}

/* -------------------------------------------------------------- actions */

function interpolate(template: string, ctx: RunContext): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const value = fieldValue(path, ctx);
    return value === null || value === undefined ? "" : String(value);
  });
}

/** True when the lead must never receive another campaign email. */
async function isSuppressed(db: Db, workspaceId: string, email: string): Promise<boolean> {
  const { data } = await db
    .from("email_suppressions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return Boolean(data);
}

async function runAction(
  db: Db,
  type: string,
  config: Record<string, unknown>,
  run: RunRow,
  ctx: RunContext,
): Promise<Record<string, unknown>> {
  const leadId = run.lead_id;
  const workspaceId = run.workspace_id;
  const str = (key: string) => String(config[key] ?? "").trim();

  switch (type) {
    case "campaign.add": {
      const campaignId = str("campaignId") || run.campaign_id;
      if (!campaignId || !leadId) return { skipped: "No campaign or lead" };
      const email = String(ctx.lead?.["email"] ?? "");
      const status = String(ctx.lead?.["status"] ?? "");
      // Never enroll someone we are not allowed to email.
      if (["unsubscribed", "bounced"].includes(status)) return { skipped: `Lead is ${status}` };
      if (email && (await isSuppressed(db, workspaceId, email))) return { skipped: "Lead is suppressed" };
      const { error } = await db.from("campaign_recipients").upsert(
        { campaign_id: campaignId, workspace_id: workspaceId, lead_id: leadId, status: "pending" },
        { onConflict: "campaign_id,lead_id", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
      await emitAutomationEvent({
        workspaceId,
        type: "lead.entered_campaign",
        idempotencyKey: `enter:${campaignId}:${leadId}`,
        leadId,
        campaignId,
        payload: { source: "automation" },
      });
      return { enrolled: true, campaignId };
    }

    case "campaign.remove": {
      const campaignId = str("campaignId") || run.campaign_id;
      if (!campaignId || !leadId) return { skipped: "No campaign or lead" };
      await db.from("campaign_recipients").delete().eq("campaign_id", campaignId).eq("lead_id", leadId);
      await db
        .from("campaign_messages")
        .update({ status: "cancelled" })
        .eq("campaign_id", campaignId)
        .eq("lead_id", leadId)
        .in("status", ["pending", "scheduled"]);
      return { removed: true, campaignId };
    }

    case "campaign.stop_followups": {
      if (!leadId) return { skipped: "No lead" };
      const query = db
        .from("campaign_messages")
        .update({ status: "cancelled" })
        .eq("lead_id", leadId)
        .in("status", ["pending", "scheduled"]);
      const { error } = run.campaign_id ? await query.eq("campaign_id", run.campaign_id) : await query;
      if (error) throw new Error(error.message);
      const recipients = db
        .from("campaign_recipients")
        .update({ status: "stopped", next_send_at: null })
        .eq("lead_id", leadId)
        .in("status", ["pending", "in_progress"]);
      if (run.campaign_id) await recipients.eq("campaign_id", run.campaign_id);
      else await recipients;
      return { stopped: true };
    }

    case "campaign.pause_enrollment": {
      if (!leadId) return { skipped: "No lead" };
      await db
        .from("campaign_recipients")
        .update({ status: "stopped", next_send_at: null })
        .eq("lead_id", leadId)
        .in("status", ["pending", "in_progress"]);
      return { enrollmentPaused: true };
    }

    case "crm.move_stage": {
      const stageId = str("stageId");
      if (!stageId || !leadId) return { skipped: "No stage or lead" };
      const { data: stage } = await db
        .from("crm_stages")
        .select("id, name, workspace_id")
        .eq("id", stageId)
        .maybeSingle();
      const row = stage as { id: string; name: string; workspace_id: string } | null;
      if (!row || row.workspace_id !== workspaceId) throw new Error("Stage is not in this workspace");
      const { error } = await db
        .from("leads")
        .update({ stage_id: stageId, last_activity_at: new Date().toISOString() })
        .eq("id", leadId)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      await db.from("lead_activities").insert({
        lead_id: leadId,
        workspace_id: workspaceId,
        type: "stage_changed",
        detail: `Automation moved contact to ${row.name}`,
      });
      await emitAutomationEvent({
        workspaceId,
        type: "crm.stage_changed",
        idempotencyKey: `stage:${leadId}:${stageId}:${run.id}`,
        leadId,
        payload: { stage: row.name, source: "automation" },
      });
      return { stage: row.name };
    }

    case "lead.add_tag":
    case "lead.remove_tag": {
      const tag = str("tag");
      if (!tag || !leadId) return { skipped: "No tag or lead" };
      const current = Array.isArray(ctx.lead?.["tags"]) ? (ctx.lead!["tags"] as string[]) : [];
      const next =
        type === "lead.add_tag"
          ? Array.from(new Set([...current, tag]))
          : current.filter((t) => t.toLowerCase() !== tag.toLowerCase());
      const { error } = await db.from("leads").update({ tags: next }).eq("id", leadId).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      ctx.lead!["tags"] = next;
      return { tags: next };
    }

    case "task.create": {
      if (!leadId) return { skipped: "No lead" };
      const days = Number(config["dueInDays"] ?? 1);
      const due = new Date(Date.now() + (Number.isFinite(days) ? days : 1) * 86_400_000).toISOString();
      // Tasks are attributed to whoever owns the automation.
      const { data: owner } = await db
        .from("automations")
        .select("created_by")
        .eq("id", run.automation_id)
        .maybeSingle();
      const createdBy = (owner as { created_by?: string | null } | null)?.created_by ?? null;
      if (!createdBy) return { skipped: "Automation has no owner to attribute the task to" };
      const { error } = await db.from("lead_tasks").insert({
        lead_id: leadId,
        workspace_id: workspaceId,
        created_by: createdBy,
        title: interpolate(str("title") || "Automation follow-up", ctx).slice(0, 200),
        due_at: due,
        completed: false,
      });
      if (error) throw new Error(error.message);
      return { taskCreated: true, dueAt: due };
    }

    case "lead.update_field": {
      const field = str("field");
      const allowed = ["status", "company", "job_title", "industry", "lead_source", "deal_value", "phone", "website", "city", "country"];
      if (!allowed.includes(field) || !leadId) return { skipped: "Unsupported field" };
      const raw = interpolate(str("value"), ctx);
      const value: string | number | null = field === "deal_value" ? (raw ? Number(raw) : null) : raw;
      const patch = { [field]: value, last_activity_at: new Date().toISOString() } as never;
      const { error } = await db
        .from("leads")
        .update(patch)
        .eq("id", leadId)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      if (field === "status") {
        await emitAutomationEvent({
          workspaceId,
          type: "lead.status_changed",
          idempotencyKey: `status:${leadId}:${value}:${run.id}`,
          leadId,
          payload: { status: value, source: "automation" },
        });
      }
      return { [field]: value };
    }

    case "lead.assign_owner": {
      const ownerId = str("ownerId");
      if (!ownerId || !leadId) return { skipped: "No owner or lead" };
      const { data: member } = await db
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", ownerId)
        .maybeSingle();
      if (!member) throw new Error("Owner is not a member of this workspace");
      const { error } = await db.from("leads").update({ owner_id: ownerId }).eq("id", leadId).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      return { ownerId };
    }

    case "crm.activity": {
      if (!leadId) return { skipped: "No lead" };
      const { error } = await db.from("lead_activities").insert({
        lead_id: leadId,
        workspace_id: workspaceId,
        campaign_id: run.campaign_id,
        type: "automation",
        detail: interpolate(str("detail") || "Automation activity", ctx).slice(0, 500),
      });
      if (error) throw new Error(error.message);
      return { logged: true };
    }

    case "notify.internal": {
      const { data: members } = await db
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId);
      const rows = ((members ?? []) as { user_id: string }[]).map((m) => ({
        user_id: m.user_id,
        workspace_id: workspaceId,
        type: "automation",
        title: interpolate(str("title") || "Automation", ctx).slice(0, 160),
        message: interpolate(str("message"), ctx).slice(0, 500) || null,
        entity_type: "automation",
        entity_id: run.automation_id,
      }));
      if (rows.length) {
        const { error } = await db.from("notifications").insert(rows);
        if (error) throw new Error(error.message);
      }
      return { notified: rows.length };
    }

    case "notify.slack": {
      const { data } = await db
        .from("integration_connections")
        .select("id, workspace_id, slug, status, account_label, config, error_message, last_synced_at, last_event_at")
        .eq("workspace_id", workspaceId)
        .eq("slug", "slack")
        .neq("status", "disabled")
        .maybeSingle();
      if (!data) return { skipped: "Slack is not connected" };
      const { deliverEvent } = await import("@/lib/integrations.server");
      const result = await deliverEvent(
        data as never,
        "automation.notification",
        {
          message: interpolate(str("message") || "Sendloop automation ran", ctx),
          lead: ctx.lead ? { email: ctx.lead["email"] } : null,
          automation: run.definition?.name ?? null,
        },
        `automation:${run.id}`,
      );
      if (!result.ok) throw new Error(result.message);
      return { slack: "delivered" };
    }

    case "webhook.send": {
      const url = str("url");
      if (!/^https:\/\//i.test(url)) throw new Error("Webhook URL must be https");
      const { data: automation } = await db
        .from("automations")
        .select("webhook_secret, name")
        .eq("id", run.automation_id)
        .maybeSingle();
      const secret = (automation as { webhook_secret?: string } | null)?.webhook_secret ?? "";
      const body = JSON.stringify({
        automation: (automation as { name?: string } | null)?.name ?? null,
        runId: run.id,
        trigger: run.trigger_type,
        lead: ctx.lead ? { id: ctx.lead["id"], email: ctx.lead["email"], company: ctx.lead["company"] } : null,
        event: ctx.event,
        sentAt: new Date().toISOString(),
      });
      const signature = secret ? await hmacHex(secret, body) : "";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sendloop-event": "automation.action",
          ...(signature ? { "x-sendloop-signature": signature } : {}),
        },
        body,
      });
      if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
      return { status: response.status };
    }

    default:
      throw new Error(`Unsupported action "${type}"`);
  }
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Re-queues a failed run from its last incomplete step. Never repeats work. */
export async function retryRun(runId: string, workspaceId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("automation_runs")
    .update({ status: "queued", error: null, resume_at: null, locked_by: null, locked_at: null, attempts: 0 })
    .eq("id", runId)
    .eq("workspace_id", workspaceId)
    .in("status", ["failed", "cancelled"]);
  if (error) throw new Error(error.message);
  void runAutomationCycle(10).catch(() => undefined);
}
