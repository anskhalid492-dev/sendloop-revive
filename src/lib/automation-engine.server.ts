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
import { assertPublicUrl, safeFetch } from "@/lib/ssrf-guard.server";
import { actionLabel, type ConditionConfig, type OperatorId, type WaitConfig } from "@/lib/automation-model";
import { MAX_CHAIN_DEPTH, workflowFromSteps, type WaitSpec } from "@/lib/workflow-graph";
import { executeWorkflow, type HopStatus, type WorkflowState } from "@/lib/workflow-runner";

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
  /** Loop protection: the automation chain that caused this event. */
  chain?: EventChain;
  /** Start exactly this active automation (the "Start another workflow" action). */
  onlyAutomationId?: string;
};

export type EventChain = { depth: number; automationIds: string[] };

/** Chain to attach to events emitted by a run's own actions. */
export function chainForRun(run: { automation_id: string; metadata?: Record<string, unknown> | null }): EventChain {
  const prior = (run.metadata?.["chain"] as EventChain | undefined) ?? { depth: 0, automationIds: [] };
  return {
    depth: (prior.depth ?? 0) + 1,
    automationIds: Array.from(new Set([...(prior.automationIds ?? []), run.automation_id])),
  };
}

/**
 * Pure loop guard: which matched automations may start a run for this event.
 * An automation never re-triggers itself through its own chain, and nothing
 * starts once the chain is MAX_CHAIN_DEPTH deep.
 */
export function automationsAllowedByChain<T extends { id: string }>(matched: T[], chain: EventChain | undefined): T[] {
  if (!chain) return matched;
  if (chain.depth >= MAX_CHAIN_DEPTH) return [];
  return matched.filter((a) => !chain.automationIds.includes(a.id));
}

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

  // Wake runs that are waiting for exactly this event on this lead. Indexed
  // by workspace/lead/status; the JSON filter only narrows that small set.
  if (args.leadId && !args.onlyAutomationId) {
    await db
      .from("automation_runs")
      .update({ resume_at: new Date().toISOString() })
      .eq("workspace_id", args.workspaceId)
      .eq("lead_id", args.leadId)
      .eq("status", "waiting")
      .eq("metadata->>waitFor", args.type);
  }

  const base = db
    .from("automations")
    .select("id, workspace_id, name, trigger_type, trigger_config, condition_logic, version, status")
    .eq("workspace_id", args.workspaceId)
    .eq("status", "active");
  const { data: automations } = args.onlyAutomationId
    ? await base.eq("id", args.onlyAutomationId)
    : await base.eq("trigger_type", args.type);

  const listening = (automations ?? []) as {
    id: string;
    name: string;
    trigger_config: Record<string, unknown>;
    condition_logic: string;
    version: number;
  }[];
  const matched = automationsAllowedByChain(listening, args.chain);
  if (matched.length < listening.length) {
    console.warn("automation loop guard skipped runs", { type: args.type, depth: args.chain?.depth ?? 0 });
  }

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
      metadata: { event: args.payload ?? {}, ...(args.chain ? { chain: args.chain } : {}) } as never,
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

export function triggerMatches(config: Record<string, unknown>, args: Pick<EmitArgs, "campaignId" | "payload">): boolean {
  const text = (key: string) => (typeof config[key] === "string" ? (config[key] as string).trim().toLowerCase() : "");
  const payload = args.payload ?? {};
  const campaignId = typeof config["campaignId"] === "string" ? (config["campaignId"] as string) : "";
  if (campaignId && campaignId !== args.campaignId) return false;
  // "Lead moved to Interested" etc. are stage-filtered pipeline events.
  const stage = text("stage");
  if (stage) {
    const values = [payload["stageKey"], payload["stageName"], payload["stage"]].map((v) => String(v ?? "").toLowerCase());
    if (!values.includes(stage)) return false;
  }
  const status = text("status");
  if (status && String(payload["to"] ?? payload["status"] ?? "").toLowerCase() !== status) return false;
  const tag = text("tag");
  if (tag && String(payload["tag"] ?? "").toLowerCase() !== tag) return false;
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

/** Claim batch size: small enough that the RPC and the per-run work stay well
 * inside the database statement and gateway timeouts. */
const CLAIM_BATCH_CAP = 25;

export async function runAutomationCycle(limit = 25): Promise<{
  claimed: number;
  completed: number;
  waiting: number;
  failed: number;
  claimError?: string;
}> {
  const db = supabaseAdmin;
  const worker = `worker-${crypto.randomUUID().slice(0, 8)}`;
  const batch = Math.min(Math.max(limit, 1), CLAIM_BATCH_CAP);

  // A 504/timeout from the PostgREST layer is transient: retry with backoff
  // instead of aborting the whole cycle, and never throw — a thrown error turns
  // the cron invocation into a 500 and loses the runs we could still process.
  let runs: RunRow[] = [];
  let claimError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await db.rpc("claim_automation_runs", { _worker: worker, _limit: batch });
    if (!error) {
      runs = (data ?? []) as RunRow[];
      claimError = null;
      break;
    }
    claimError = error.message;
    if (!isRetryable(error.message) && !/gateway timeout|504|statement timeout/i.test(error.message)) break;
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  if (claimError) {
    console.error("automation cycle: claim failed", claimError);
    return { claimed: 0, completed: 0, waiting: 0, failed: 0, claimError };
  }

  let completed = 0;
  let waiting = 0;
  let failed = 0;

  for (const run of runs) {
    // One bad run must never abort the rest of the batch.
    let outcome: Outcome;
    try {
      outcome = await executeRun(run);
    } catch (error) {
      console.error("automation run crashed", run.id, error);
      outcome = "failed";
    }
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
  const workflow = workflowFromSteps(steps);
  if (workflow) return executeGraphRun(run, workflow);

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

/* ---------------------------------------------------------- simulation */

export function assertNotSimulation(metadata: Record<string, unknown> | null | undefined): void {
  if (metadata && metadata["simulation"] === true) {
    throw new Error("Simulation runs never perform real actions.");
  }
}

/**
 * Read-only context for a dry run. Uses the caller's own (RLS-scoped) client,
 * reads exactly what a live run reads, and writes nothing.
 */
export async function loadSimulationContext(
  db: unknown,
  args: { workspaceId: string; leadId: string; campaignId?: string | null; event?: Record<string, unknown> },
): Promise<{ getField: (field: string) => unknown }> {
  const ctx = await loadContext(db as Db, {
    id: "simulation",
    automation_id: "simulation",
    workspace_id: args.workspaceId,
    lead_id: args.leadId,
    campaign_id: args.campaignId ?? null,
    trigger_type: "simulation",
    current_step: 0,
    attempts: 0,
    branch: null,
    metadata: { simulation: true, event: args.event ?? {} },
    definition: {},
  });
  return { getField: (field) => fieldValue(field, ctx) };
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
  if (group === "activity") {
    if (key === "days_since_activity") {
      const at = Date.parse(String(ctx.lead?.["last_activity_at"] ?? ctx.lead?.["created_at"] ?? ""));
      return Number.isFinite(at) ? Math.floor((Date.now() - at) / 86_400_000) : null;
    }
    if (key === "has_replied") return ctx.activity.replies > 0 ? "yes" : "no";
    return (ctx.activity as unknown as Record<string, number>)[key ?? ""] ?? 0;
  }
  if (group === "custom") {
    const custom = (ctx.lead?.["custom_fields"] ?? {}) as Record<string, unknown>;
    return custom && typeof custom === "object" ? (custom[field.slice("custom.".length)] ?? null) : null;
  }
  if (group === "campaign" && key === "id") return ctx.campaign?.id ?? null;
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
  // Execution-layer guard: a run marked as a simulation can never perform a
  // real side effect, whatever path reached this point.
  assertNotSimulation(run.metadata);
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
        chain: chainForRun(run),
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
      let stageId = str("stageId");
      // Templates name a stage by key/name; resolve it inside this workspace.
      const stageKey = str("stageKey").toLowerCase();
      if (!stageId && stageKey) {
        const { data: stages } = await db.from("crm_stages").select("id, key, name").eq("workspace_id", workspaceId);
        const hit = ((stages ?? []) as { id: string; key: string; name: string }[]).find(
          (s) => s.key.toLowerCase() === stageKey || s.name.toLowerCase() === stageKey.replace(/_/g, " "),
        );
        if (!hit) throw new Error(`Pipeline stage "${stageKey.replace(/_/g, " ")}" does not exist in this workspace`);
        stageId = hit.id;
      }
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
        payload: { stage: row.name, stageId, source: "automation" },
        chain: chainForRun(run),
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
      const changed = next.length !== current.length;
      ctx.lead!["tags"] = next;
      if (changed) {
        await emitAutomationEvent({
          workspaceId,
          type: type === "lead.add_tag" ? "lead.tag_added" : "lead.tag_removed",
          idempotencyKey: `tag:${type}:${leadId}:${tag.toLowerCase()}:${run.id}`,
          leadId,
          campaignId: run.campaign_id,
          payload: { tag, source: "automation" },
          chain: chainForRun(run),
        });
      }
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
          payload: { status: value, to: value, source: "automation" },
          chain: chainForRun(run),
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
          message: interpolate(str("message") || "MunchReach automation ran", ctx),
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
      await assertPublicUrl(url);
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
      const response = await safeFetch(url, {
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

    case "lead.add_note": {
      if (!leadId) return { skipped: "No lead" };
      const { data: owner } = await db.from("automations").select("created_by").eq("id", run.automation_id).maybeSingle();
      const authorId = (owner as { created_by?: string | null } | null)?.created_by ?? null;
      if (!authorId) return { skipped: "Automation has no owner to attribute the note to" };
      const body = interpolate(str("body"), ctx).slice(0, 2000);
      if (!body) return { skipped: "Empty note" };
      const { error } = await db.from("lead_notes").insert({ lead_id: leadId, workspace_id: workspaceId, author_id: authorId, body });
      if (error) throw new Error(error.message);
      return { noted: true };
    }

    case "workflow.start": {
      const target = str("automationId");
      if (!target) return { skipped: "No workflow selected" };
      if (target === run.automation_id) return { skipped: "A workflow cannot start itself" };
      const { runs } = await emitAutomationEvent({
        workspaceId,
        type: "workflow.started",
        idempotencyKey: `workflow.start:${run.id}:${String(config["__hop"] ?? "")}:${target}`,
        leadId,
        campaignId: run.campaign_id,
        payload: { startedBy: run.automation_id },
        chain: chainForRun(run),
        onlyAutomationId: target,
      });
      return runs > 0 ? { started: target } : { skipped: "Workflow is not active or the loop guard stopped it" };
    }

    default:
      throw new Error(`Unsupported action "${type}"`);
  }
}

/* ------------------------------------------------------ AI Sales Agent */

async function loadAgentForRun(db: Db, run: RunRow, ctx: RunContext, meta: Record<string, unknown>) {
  const { loadAgentConversation, loadSalesAgentSettings } = await import("@/lib/sales-agent.server");
  const conversationId = typeof ctx.event["conversationId"] === "string" ? (ctx.event["conversationId"] as string) : null;
  const [settings, convo] = await Promise.all([
    loadSalesAgentSettings(db, run.workspace_id),
    loadAgentConversation(db, run.workspace_id, run.lead_id, conversationId),
  ]);
  const decisions = Array.isArray(meta["aiDecisions"]) ? (meta["aiDecisions"] as { outcome: string | null; pathLabel: string }[]) : [];
  return {
    settings,
    ctx: {
      workspaceId: run.workspace_id,
      lead: ctx.lead && ctx.lead["workspace_id"] === run.workspace_id ? ctx.lead : null,
      stageName: ctx.stageName,
      campaignName: ctx.campaign?.name ?? null,
      conversation: convo.conversation,
      messages: convo.messages,
      previousDecisions: decisions.map((d) => ({ outcome: d.outcome ?? null, pathLabel: String(d.pathLabel ?? "") })),
    },
  };
}

async function automationOwner(db: Db, automationId: string): Promise<string | null> {
  const { data } = await db.from("automations").select("created_by").eq("id", automationId).maybeSingle();
  return (data as { created_by?: string | null } | null)?.created_by ?? null;
}

async function requestHumanReview(db: Db, run: RunRow, ctx: RunContext, reason: string, ownerId: string | null) {
  const leadId = run.lead_id;
  const workspaceId = run.workspace_id;
  if (!leadId) return { skipped: "No lead" };
  const { HUMAN_REVIEW_TAG } = await import("@/lib/sales-agent");
  const createdBy = await automationOwner(db, run.automation_id);
  const text = reason.slice(0, 300) || "AI handed this conversation to a person.";
  if (createdBy) {
    const { error } = await db.from("lead_tasks").insert({
      lead_id: leadId,
      workspace_id: workspaceId,
      created_by: createdBy,
      title: `Human review: ${text}`.slice(0, 200),
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
      completed: false,
    });
    if (error) throw new Error(error.message);
  }
  await db.from("lead_activities").insert({ lead_id: leadId, workspace_id: workspaceId, campaign_id: run.campaign_id, type: "automation", detail: `Human review requested: ${text}` });
  // Pauses automated AI replies for this lead until a person removes the tag.
  const tags = Array.isArray(ctx.lead?.["tags"]) ? (ctx.lead!["tags"] as string[]) : [];
  const patch: Record<string, unknown> = { tags: Array.from(new Set([...tags, HUMAN_REVIEW_TAG])) };
  if (ownerId) {
    const { data: member } = await db.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", ownerId).maybeSingle();
    if (member) patch["owner_id"] = ownerId;
  }
  await db.from("leads").update(patch as never).eq("id", leadId).eq("workspace_id", workspaceId);
  if (ctx.lead) ctx.lead["tags"] = patch["tags"];
  const notifyTo = ownerId ?? createdBy;
  if (notifyTo) {
    await db.from("notifications").insert({ user_id: notifyTo, workspace_id: workspaceId, type: "automation", title: "Human review requested", message: text, entity_type: "automation", entity_id: run.automation_id });
  }
  return { humanReview: true, reason: text, assignedTo: patch["owner_id"] ?? null };
}

async function runSalesAgentAction(
  db: Db,
  type: string,
  config: Record<string, unknown>,
  run: RunRow,
  ctx: RunContext,
  meta: Record<string, unknown>,
  loadAgent: () => Promise<{ ctx: import("@/lib/sales-agent.server").AgentContext; settings: import("@/lib/sales-agent").SalesAgentSettings }>,
): Promise<Record<string, unknown>> {
  assertNotSimulation(run.metadata);
  const str = (k: string) => String(config[k] ?? "").trim();
  if (type === "human.review") {
    const decisions = Array.isArray(meta["aiDecisions"]) ? (meta["aiDecisions"] as { usedFallback?: boolean }[]) : [];
    const last = decisions[decisions.length - 1];
    const fallbackText = last?.usedFallback ? "AI was not confident enough to respond automatically." : "";
    return requestHumanReview(db, run, ctx, str("reason") || fallbackText, str("ownerId") || null);
  }
  if (type !== "ai.generate_reply") throw new Error(`Unsupported action "${type}"`);

  const { runAiReply } = await import("@/lib/sales-agent.server");
  const a = await loadAgent();
  const decisions = Array.isArray(meta["aiDecisions"]) ? (meta["aiDecisions"] as { confidence?: number | null }[]) : [];
  const lastConfidence = decisions.length ? (decisions[decisions.length - 1]!.confidence ?? null) : null;
  const result = await runAiReply(config, a.ctx, a.settings, lastConfidence);
  if (!result.ok) {
    // Never send on failure. Hand off to a person unless configured otherwise.
    if (config["onFailure"] !== "stop") {
      const review = await requestHumanReview(db, run, ctx, result.error, null);
      return { kind: "ai_reply", generated: false, error: result.error, blocked: result.blocked, handedOff: !("skipped" in review), ...(result.ai ? { ai: result.ai } : {}) };
    }
    return { kind: "ai_reply", generated: false, error: result.error, blocked: result.blocked, ...(result.ai ? { ai: result.ai } : {}) };
  }
  const conversation = a.ctx.conversation;
  const owner = await automationOwner(db, run.automation_id);
  const subject = conversation?.subject ? (/^re:/i.test(conversation.subject) ? conversation.subject : `Re: ${conversation.subject}`) : "Re: your reply";
  const base = { kind: "ai_reply", generated: true, requestedMode: result.cfg.mode, forcedDraft: result.forcedDraft, truncated: result.truncated, words: result.text.split(/\s+/).length, ai: result.ai };

  if (result.mode === "auto_send" && conversation && owner) {
    const { claimManualSend } = await import("@/lib/manual-send-idempotency.server");
    const claim = await claimManualSend<{ messageId?: string }>(run.workspace_id, `ai-reply:${run.id}:${String(config["__hop"] ?? "")}`, "reply");
    if (!claim.proceed) return { ...base, mode: "auto_send", sent: true, duplicate: true };
    const { requireEntitlement, consumeUsage, releaseUsage } = await import("@/lib/billing/usage.server");
    try {
      await requireEntitlement(run.workspace_id, "unified_inbox");
      await consumeUsage(run.workspace_id, "emails_monthly", 1);
    } catch (error) {
      await claim.release();
      throw error;
    }
    try {
      const { sendReplyThroughMailbox } = await import("@/lib/inbox-send.server");
      const sent = await sendReplyThroughMailbox({ supabase: db, userId: owner, conversationId: conversation.id, subject, body: result.text, cc: [], attachments: [] });
      await claim.finish(sent as never);
      return { ...base, mode: "auto_send", sent: true };
    } catch (error) {
      await claim.release();
      await releaseUsage(run.workspace_id, "emails_monthly", 1).catch(() => {});
      throw error;
    }
  }

  if (!owner) return { ...base, mode: "draft", skipped: "Automation has no owner to attribute the draft to" };
  const { error } = await db.from("email_drafts").insert({
    workspace_id: run.workspace_id,
    user_id: owner,
    conversation_id: conversation?.id ?? null,
    lead_id: run.lead_id,
    to_email: conversation?.prospect_email || String(ctx.lead?.["email"] ?? ""),
    subject,
    body: result.text,
  });
  if (error) throw new Error(error.message);
  return { ...base, mode: "draft", draftCreated: true, ...(result.cfg.mode === "auto_send" && !conversation ? { note: "No conversation to reply in, so a draft was created." } : {}) };
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
  const db = supabaseAdmin;

  // Only the failed run is touched, and only when it is still failed — a
  // double-click or a concurrent retry updates zero rows the second time.
  const { data: run } = await db
    .from("automation_runs")
    .select("id, current_step, metadata, status")
    .eq("id", runId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!run) throw new Error("Run not found");
  if (!["failed", "cancelled"].includes(run.status as string)) {
    throw new Error("Only failed runs can be retried.");
  }

  const meta = (run.metadata ?? {}) as Record<string, unknown>;
  const retries = Number(meta["retries"] ?? 0) + 1;

  const { data: updated, error } = await db
    .from("automation_runs")
    .update({
      status: "queued",
      error: null,
      resume_at: null,
      locked_by: null,
      locked_at: null,
      attempts: 0,
      completed_at: null,
      // current_step is deliberately preserved: every step before it already
      // completed and is never executed again.
      metadata: { ...meta, retries, last_retry_at: new Date().toISOString() } as never,
    })
    .eq("id", runId)
    .eq("workspace_id", workspaceId)
    .in("status", ["failed", "cancelled"])
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) throw new Error("This run was already retried.");

  // Clear the failed step's error so the timeline shows the fresh attempt;
  // completed steps are left untouched.
  // Graph workflows re-attempt a `failed` hop but treat `running` as "may
  // already have happened", so their failed step is left as failed.
  if (!meta["workflow"]) {
    await db
      .from("automation_run_steps")
      .update({ status: "running", error: null, finished_at: null })
      .eq("run_id", runId)
      .eq("status", "failed");
  }

  void runAutomationCycle(10).catch(() => undefined);
}

/* ------------------------------------------------------ graph workflows */

const BUSINESS_DAY_HOUR = 9;

/** Resume time for a visual-workflow wait. Exported for tests. */
export function computeWorkflowResume(
  wait: WaitSpec,
  timezone: string,
  window: { days: number[]; start: number; end: number },
  now = Date.now(),
): string {
  const amount = Math.max(1, Number(wait.amount ?? 1));
  switch (wait.mode) {
    case "minutes":
      return new Date(now + amount * 60_000).toISOString();
    case "hours":
      return new Date(now + amount * 3_600_000).toISOString();
    case "days":
      return new Date(now + amount * 86_400_000).toISOString();
    case "until_event":
      return new Date(now + Math.max(1, Number(wait.timeoutDays ?? 7)) * 86_400_000).toISOString();
    case "until_datetime": {
      const zone = wait.timezone || timezone;
      const target = zonedLocalToUtc(wait.at ?? "", zone);
      return target && target > now ? new Date(target).toISOString() : new Date(now).toISOString();
    }
    case "next_business_day": {
      const zone = wait.timezone || timezone;
      const days = window.days.length ? window.days : [1, 2, 3, 4, 5];
      const startHour = window.start ?? BUSINESS_DAY_HOUR;
      // Step hour by hour to the first sending-window opening on a later day.
      const today = zonedParts(new Date(now), zone).weekday;
      for (let i = 1; i <= 24 * 9; i += 1) {
        const candidate = now + i * 3_600_000;
        const p = zonedParts(new Date(candidate), zone);
        if (p.weekday !== today && days.includes(p.weekday) && p.hour === startHour) {
          return new Date(candidate - p.minute * 60_000).toISOString();
        }
      }
      return new Date(now + 86_400_000).toISOString();
    }
  }
}

/** "YYYY-MM-DDTHH:mm" wall clock in `zone` → epoch ms. */
export function zonedLocalToUtc(local: string, zone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(asUtc)).map((p) => [p.type, p.value]));
  const shown = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]) % 24,
    Number(parts["minute"]),
  );
  return asUtc - (shown - asUtc);
}

function hopLabel(node: { type: string; label?: string; action?: string }): string {
  if (node.label) return node.label;
  if (node.type === "action") return actionLabel(String(node.action ?? "action"));
  const names: Record<string, string> = { condition: "Condition evaluated", branch: "Branch selected", wait: "Wait", end: "End" };
  return names[node.type] ?? node.type;
}

async function executeGraphRun(run: RunRow, workflow: import("@/lib/workflow-graph").Workflow): Promise<Outcome> {
  const db = supabaseAdmin;
  let context: RunContext;
  try {
    context = await loadContext(db, run);
  } catch (error) {
    return finishRun(db, run, "failed", (error as Error).message);
  }

  const meta = { ...(run.metadata ?? {}) } as Record<string, unknown>;
  const saved = (meta["workflow"] as WorkflowState | undefined) ?? { cursor: null, hop: 0 };

  const { data: priorRows } = await db
    .from("automation_run_steps")
    .select("position, status, output")
    .eq("run_id", run.id);
  const prior = new Map<number, HopStatus>();
  const priorOut = new Map<number, Record<string, unknown>>();
  for (const row of (priorRows ?? []) as { position: number; status: HopStatus; output: Record<string, unknown> | null }[]) {
    prior.set(row.position, row.status);
    if (row.output) priorOut.set(row.position, row.output);
  }
  let agent: { ctx: import("@/lib/sales-agent.server").AgentContext; settings: import("@/lib/sales-agent").SalesAgentSettings } | null = null;
  const loadAgent = async () => {
    if (!agent) agent = await loadAgentForRun(db, run, context, meta);
    return agent;
  };

  const persistState = async (state: WorkflowState, extra: Record<string, unknown> = {}) => {
    Object.assign(meta, { workflow: state }, extra);
    await db
      .from("automation_runs")
      .update({ metadata: meta as never, current_step: state.hop })
      .eq("id", run.id);
  };

  const outcome = await executeWorkflow(workflow, saved, {
    getField: (field) => fieldValue(field, context),
    priorHop: async (hop) => prior.get(hop) ?? null,
    recordHop: async (hop, node, status, output, error) => {
      prior.set(hop, status);
      await db.from("automation_run_steps").upsert(
        {
          run_id: run.id,
          workspace_id: run.workspace_id,
          step_id: null,
          position: hop,
          kind: node.type,
          label: hopLabel(node as never).slice(0, 160),
          status,
          output: { ...output, nodeId: node.id } as never,
          error: error ? customerError(error) : null,
          finished_at: status === "waiting" || status === "running" ? null : new Date().toISOString(),
        },
        { onConflict: "run_id,position,kind" },
      );
    },
    saveState: (state) => persistState(state),
    executeAction: (action, config, hop) =>
      action.startsWith("ai.") || action === "human.review"
        ? runSalesAgentAction(db, action, { ...config, __hop: hop }, run, context, meta, loadAgent)
        : runAction(db, action, { ...config, __hop: hop }, run, context),
    priorOutput: async (hop) => priorOut.get(hop) ?? null,
    aiDecide: async (node) => {
      assertNotSimulation(run.metadata);
      const { runAiDecision } = await import("@/lib/sales-agent.server");
      const a = await loadAgent();
      const decided = await runAiDecision(node, a.ctx, a.settings);
      const list = Array.isArray(meta["aiDecisions"]) ? (meta["aiDecisions"] as unknown[]) : [];
      meta["aiDecisions"] = [...list, { outcome: decided.output["outcome"], pathLabel: decided.output["pathLabel"], confidence: decided.output["confidence"], usedFallback: decided.output["usedFallback"] }].slice(-5);
      a.ctx.previousDecisions.push({ outcome: (decided.output["outcome"] as string) ?? null, pathLabel: String(decided.output["pathLabel"]) });
      return decided;
    },
    computeResume: (wait) => computeWorkflowResume(wait, context.timezone, context.window),
    eventSince: async (event) => {
      if (!run.lead_id) return false;
      const since = String(meta["waitStartedAt"] ?? run.metadata?.["waitStartedAt"] ?? "");
      const query = db
        .from("automation_events")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", run.workspace_id)
        .eq("lead_id", run.lead_id)
        .eq("event_type", event);
      const { count } = since ? await query.gte("created_at", since) : await query;
      return (count ?? 0) > 0;
    },
    isRetryable: (message) => isRetryable(message) && run.attempts < 4,
  });

  if (outcome.status === "waiting") {
    Object.assign(meta, {
      workflow: outcome.state,
      waitFor: outcome.waitFor,
      waitStartedAt: new Date().toISOString(),
    });
    await db
      .from("automation_runs")
      .update({
        status: "waiting",
        resume_at: outcome.resumeAt,
        metadata: meta as never,
        current_step: outcome.state.hop,
        locked_by: null,
        locked_at: null,
      })
      .eq("id", run.id);
    return "waiting";
  }
  if (meta["waitFor"]) {
    delete meta["waitFor"];
    await persistState(outcome.state);
  }
  if (outcome.status === "retry") {
    const delayMinutes = Math.min(30, 2 ** run.attempts);
    await db
      .from("automation_runs")
      .update({
        status: "waiting",
        resume_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        error: customerError(outcome.error),
        locked_by: null,
        locked_at: null,
      })
      .eq("id", run.id);
    return "waiting";
  }
  if (outcome.status === "failed") return finishRun(db, run, "failed", customerError(outcome.error));
  return finishRun(db, run, "completed", null, outcome.result);
}

/** Plain-language error for the run timeline — never a stack trace. */
export function customerError(message: string): string {
  const first = String(message ?? "").split("\n")[0]!.replace(/\s+at\s.+$/, "").trim();
  return (first || "The step failed").slice(0, 300);
}
