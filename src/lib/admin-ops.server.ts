/**
 * Phase 8 — platform operations read models: background jobs, usage rollups,
 * live system health, application logs and derived alerts.
 *
 * Everything here reads the systems that already exist (campaign message
 * queue, warmup jobs, automation runs, webhook event tables, provider health)
 * — no new queue, log or health store is introduced. All output passes through
 * `redact()` so credentials can never leak into an admin screen.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { windowStartAt } from "@/lib/campaign-schedule";

/* ------------------------------------------------------------------ */
/* Redaction                                                           */
/* ------------------------------------------------------------------ */

const SECRET_KEY = /(pass(word)?|secret|token|api[_-]?key|key|credential|authorization|cookie|dsn|salt|iv|cipher)/i;

/** Masks anything that looks like a key, bearer token or long opaque string. */
export function redactText(value: string | null | undefined, max = 500): string | null {
  if (!value) return null;
  return value
    .replace(/(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "[redacted]")
    .replace(/\b(sk|pk|re|rk|whsec|sb|eyJ)[A-Za-z0-9._-]{12,}/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]")
    .slice(0, max);
}

/** Deep-redacts a payload: secret-looking keys are dropped entirely. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value, 300);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 25).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return "[unsupported]";
}

/** Strips control characters so a stored message cannot forge a log line. */
function sanitize(value: string | null | undefined): string | null {
  if (!value) return null;
  // eslint-disable-next-line no-control-regex
  return redactText(value.replace(/[\u0000-\u001f\u007f]/g, " ").trim());
}

async function workspaceNames(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabaseAdmin.from("workspaces").select("id, name").in("id", unique);
  return new Map((data ?? []).map((w: { id: string; name: string }) => [w.id, w.name]));
}

/* ------------------------------------------------------------------ */
/* 1. Jobs & queue                                                      */
/* ------------------------------------------------------------------ */

export type JobSource = "campaign_message" | "warmup_job" | "automation_run";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "retrying" | "cancelled";

export type JobRow = {
  id: string;
  source: JobSource;
  name: string;
  type: string;
  queue: string;
  workspaceId: string | null;
  workspaceName: string | null;
  status: JobStatus;
  attempts: number;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  nextRetryAt: string | null;
};

const JOB_LABEL: Record<JobSource, { type: string; queue: string }> = {
  campaign_message: { type: "Campaign send", queue: "campaign_messages" },
  warmup_job: { type: "Warmup send", queue: "warmup_jobs" },
  automation_run: { type: "Automation run", queue: "automation_runs" },
};

function duration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function campaignStatus(status: string, attempts: number): JobStatus {
  if (status === "sent") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "processing") return "running";
  return attempts > 0 ? "retrying" : "queued";
}

function warmupStatus(status: string, attempts: number): JobStatus {
  if (status === "sent" || status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled" || status === "skipped") return "cancelled";
  if (status === "processing") return "running";
  return attempts > 0 ? "retrying" : "queued";
}

function automationStatus(status: string, attempts: number): JobStatus {
  if (status === "completed" || status === "succeeded") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled" || status === "stopped") return "cancelled";
  if (status === "running") return "running";
  if (status === "waiting" || status === "scheduled") return attempts > 0 ? "retrying" : "queued";
  return attempts > 0 ? "retrying" : "queued";
}

export async function loadJobs(filters: {
  status?: string;
  type?: string;
  workspaceId?: string;
  since?: string;
  search?: string;
  limit?: number;
}): Promise<{ rows: JobRow[]; counts: Record<JobStatus, number> }> {
  const limit = filters.limit ?? 200;
  const wantType = filters.type && filters.type !== "all" ? (filters.type as JobSource) : null;
  const rows: JobRow[] = [];

  const applyCommon = (query: any, tsColumn: string) => {
    let q = query.order(tsColumn, { ascending: false }).limit(limit);
    if (filters.workspaceId) q = q.eq("workspace_id", filters.workspaceId);
    if (filters.since) q = q.gte(tsColumn, filters.since);
    return q;
  };

  if (!wantType || wantType === "campaign_message") {
    const { data } = await applyCommon(
      supabaseAdmin
        .from("campaign_messages")
        .select(
          "id, workspace_id, campaign_id, status, attempts, scheduled_at, sent_at, last_error, subject, created_at, updated_at",
        ),
      "created_at",
    );
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      rows.push({
        id: String(r["id"]),
        source: "campaign_message",
        name: sanitize(r["subject"]) ?? "Campaign email",
        ...JOB_LABEL.campaign_message,
        workspaceId: r["workspace_id"] ?? null,
        workspaceName: null,
        status: campaignStatus(String(r["status"]), Number(r["attempts"] ?? 0)),
        attempts: Number(r["attempts"] ?? 0),
        createdAt: r["created_at"] ?? null,
        startedAt: r["scheduled_at"] ?? null,
        completedAt: r["sent_at"] ?? null,
        durationMs: duration(r["scheduled_at"], r["sent_at"]),
        error: sanitize(r["last_error"]),
        nextRetryAt: r["status"] === "failed" ? null : (r["scheduled_at"] ?? null),
      });
    }
  }

  if (!wantType || wantType === "warmup_job") {
    const { data } = await applyCommon(
      supabaseAdmin
        .from("warmup_jobs")
        .select(
          "id, workspace_id, status, attempts, scheduled_at, next_attempt_at, processed_at, error, subject, created_at",
        ),
      "created_at",
    );
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      rows.push({
        id: String(r["id"]),
        source: "warmup_job",
        name: sanitize(r["subject"]) ?? "Warmup email",
        ...JOB_LABEL.warmup_job,
        workspaceId: r["workspace_id"] ?? null,
        workspaceName: null,
        status: warmupStatus(String(r["status"]), Number(r["attempts"] ?? 0)),
        attempts: Number(r["attempts"] ?? 0),
        createdAt: r["created_at"] ?? null,
        startedAt: r["scheduled_at"] ?? null,
        completedAt: r["processed_at"] ?? null,
        durationMs: duration(r["scheduled_at"], r["processed_at"]),
        error: sanitize(r["error"]),
        nextRetryAt: r["next_attempt_at"] ?? null,
      });
    }
  }

  if (!wantType || wantType === "automation_run") {
    const { data } = await applyCommon(
      supabaseAdmin
        .from("automation_runs")
        .select(
          "id, workspace_id, automation_id, status, attempts, trigger_type, started_at, completed_at, resume_at, error, created_at",
        ),
      "created_at",
    );
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      rows.push({
        id: String(r["id"]),
        source: "automation_run",
        name: `Automation · ${sanitize(r["trigger_type"]) ?? "run"}`,
        ...JOB_LABEL.automation_run,
        workspaceId: r["workspace_id"] ?? null,
        workspaceName: null,
        status: automationStatus(String(r["status"]), Number(r["attempts"] ?? 0)),
        attempts: Number(r["attempts"] ?? 0),
        createdAt: r["created_at"] ?? null,
        startedAt: r["started_at"] ?? null,
        completedAt: r["completed_at"] ?? null,
        durationMs: duration(r["started_at"], r["completed_at"]),
        error: sanitize(r["error"]),
        nextRetryAt: r["resume_at"] ?? null,
      });
    }
  }

  const names = await workspaceNames(rows.map((r) => r.workspaceId));
  for (const row of rows) {
    row.workspaceName = row.workspaceId ? (names.get(row.workspaceId) ?? null) : null;
  }

  const counts: Record<JobStatus, number> = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    retrying: 0,
    cancelled: 0,
  };
  for (const row of rows) counts[row.status] += 1;

  let filtered = rows;
  if (filters.status && filters.status !== "all") {
    filtered = filtered.filter((r) => r.status === filters.status);
  }
  if (filters.search) {
    const term = filters.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.id.toLowerCase().includes(term) ||
        (r.workspaceName ?? "").toLowerCase().includes(term) ||
        (r.error ?? "").toLowerCase().includes(term),
    );
  }
  filtered.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

  return { rows: filtered.slice(0, limit), counts };
}

export async function loadJobDetail(source: JobSource, id: string) {
  if (source === "campaign_message") {
    const { data } = await supabaseAdmin
      .from("campaign_messages")
      .select(
        "id, workspace_id, campaign_id, recipient_id, step_order, status, attempts, to_email, subject, provider, provider_message_id, scheduled_at, sent_at, last_error, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (!data) throw new Error("Job not found");
    const row = data as Record<string, any>;
    const { data: events } = await supabaseAdmin
      .from("email_events")
      .select("id, event_type, status, error, created_at")
      .eq("message_id", row["provider_message_id"] ?? "")
      .order("created_at", { ascending: false })
      .limit(20);
    return {
      source,
      id: row["id"],
      status: campaignStatus(String(row["status"]), Number(row["attempts"] ?? 0)),
      rawStatus: row["status"],
      attempts: Number(row["attempts"] ?? 0),
      workspaceId: row["workspace_id"],
      createdAt: row["created_at"],
      startedAt: row["scheduled_at"],
      completedAt: row["sent_at"],
      durationMs: duration(row["scheduled_at"], row["sent_at"]),
      error: sanitize(row["last_error"]),
      // Payload summary only — message bodies and credentials are never returned.
      payload: redact({
        campaign_id: row["campaign_id"],
        recipient_id: row["recipient_id"],
        step_order: row["step_order"],
        to_email: row["to_email"],
        subject: row["subject"],
        provider: row["provider"],
        provider_message_id: row["provider_message_id"],
      }),
      history: (events ?? []).map((e: Record<string, any>) => ({
        at: e["created_at"],
        label: `${e["event_type"]} · ${e["status"]}`,
        error: sanitize(e["error"]),
      })),
    };
  }

  if (source === "warmup_job") {
    const { data } = await supabaseAdmin
      .from("warmup_jobs")
      .select(
        "id, workspace_id, sending_account_id, conversation_id, role, from_email, to_email, subject, status, attempts, max_attempts, provider, provider_message_id, scheduled_at, next_attempt_at, processed_at, error, created_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (!data) throw new Error("Job not found");
    const row = data as Record<string, any>;
    const { data: events } = await supabaseAdmin
      .from("warmup_events")
      .select("id, kind, detail, created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    return {
      source,
      id: row["id"],
      status: warmupStatus(String(row["status"]), Number(row["attempts"] ?? 0)),
      rawStatus: row["status"],
      attempts: Number(row["attempts"] ?? 0),
      workspaceId: row["workspace_id"],
      createdAt: row["created_at"],
      startedAt: row["scheduled_at"],
      completedAt: row["processed_at"],
      durationMs: duration(row["scheduled_at"], row["processed_at"]),
      error: sanitize(row["error"]),
      payload: redact({
        role: row["role"],
        from_email: row["from_email"],
        to_email: row["to_email"],
        subject: row["subject"],
        provider: row["provider"],
        provider_message_id: row["provider_message_id"],
        max_attempts: row["max_attempts"],
        next_attempt_at: row["next_attempt_at"],
      }),
      history: (events ?? []).map((e: Record<string, any>) => ({
        at: e["created_at"],
        label: String(e["kind"]),
        error: sanitize(typeof e["detail"] === "string" ? e["detail"] : null),
      })),
    };
  }

  const { data } = await supabaseAdmin
    .from("automation_runs")
    .select(
      "id, workspace_id, automation_id, lead_id, campaign_id, trigger_type, status, current_step, branch, attempts, resume_at, started_at, completed_at, error, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("Job not found");
  const row = data as Record<string, any>;
  const { data: steps } = await supabaseAdmin
    .from("automation_run_steps")
    .select("*")
    .eq("run_id", id)
    .order("created_at", { ascending: false })
    .limit(30);
  return {
    source,
    id: row["id"],
    status: automationStatus(String(row["status"]), Number(row["attempts"] ?? 0)),
    rawStatus: row["status"],
    attempts: Number(row["attempts"] ?? 0),
    workspaceId: row["workspace_id"],
    createdAt: row["created_at"],
    startedAt: row["started_at"],
    completedAt: row["completed_at"],
    durationMs: duration(row["started_at"], row["completed_at"]),
    error: sanitize(row["error"]),
    payload: redact({
      automation_id: row["automation_id"],
      trigger_type: row["trigger_type"],
      lead_id: row["lead_id"],
      campaign_id: row["campaign_id"],
      current_step: row["current_step"],
      branch: row["branch"],
      resume_at: row["resume_at"],
    }),
    history: (steps ?? []).map((s: Record<string, any>) => ({
      at: s["created_at"] ?? s["started_at"] ?? null,
      label: `${s["step_type"] ?? s["kind"] ?? "step"} · ${s["status"] ?? ""}`,
      error: sanitize(s["error"] ?? null),
    })),
  };
}

/**
 * Re-queues a failed job through the worker that already owns it. Nothing is
 * sent here — the existing runner picks the row up on its next tick.
 */
export async function retryJob(source: JobSource, id: string) {
  const now = new Date().toISOString();
  if (source === "campaign_message") {
    const { data: message, error: messageError } = await supabaseAdmin
      .from("campaign_messages")
      .select("id, campaign_id")
      .eq("id", id)
      .eq("status", "failed")
      .maybeSingle();
    if (messageError) throw new Error(messageError.message);
    if (!message) throw new Error("Only failed campaign sends can be retried");

    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .select("timezone, send_days, send_start_hour, send_end_hour")
      .eq("id", message.campaign_id)
      .maybeSingle();
    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) throw new Error("Campaign not found");
    const retryAt = windowStartAt(new Date(now), {
      timezone: campaign.timezone || "UTC",
      sendDays: campaign.send_days ?? [1, 2, 3, 4, 5],
      startHour: campaign.send_start_hour ?? 9,
      endHour: campaign.send_end_hour ?? 17,
    }, { includeCurrentDay: false }).toISOString();

    const { data, error } = await supabaseAdmin
      .from("campaign_messages")
      .update({ status: "scheduled", last_error: null, scheduled_at: retryAt } as never)
      .eq("id", id)
      .eq("status", "failed")
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Only failed campaign sends can be retried");
    return { ok: true };
  }
  if (source === "warmup_job") {
    const { data, error } = await supabaseAdmin
      .from("warmup_jobs")
      .update({ status: "pending", error: null, next_attempt_at: now, locked_by: null, locked_at: null } as never)
      .eq("id", id)
      .eq("status", "failed")
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Only failed warmup jobs can be retried");
    return { ok: true };
  }
  const { data, error } = await supabaseAdmin
    .from("automation_runs")
    .update({ status: "pending", error: null, resume_at: now, locked_by: null, locked_at: null } as never)
    .eq("id", id)
    .eq("status", "failed")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only failed automation runs can be retried");
  return { ok: true };
}

/** Cancels work that has not started yet; running jobs are left alone. */
export async function cancelJob(source: JobSource, id: string) {
  const table =
    source === "campaign_message" ? "campaign_messages" : source === "warmup_job" ? "warmup_jobs" : "automation_runs";
  const { data, error } = await supabaseAdmin
    .from(table)
    .update({ status: "cancelled" } as never)
    .eq("id", id)
    .in("status", ["pending", "scheduled", "queued", "waiting"])
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only queued jobs can be cancelled");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 2. Usage                                                            */
/* ------------------------------------------------------------------ */

async function countRows(
  table: string,
  column: string,
  from: string,
  to: string,
  extra?: (q: any) => any,
  workspaceId?: string,
) {
  let q: any = (supabaseAdmin.from(table as never) as any)
    .select("id", { count: "exact", head: true })
    .gte(column, from)
    .lte(column, to);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (extra) q = extra(q);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export async function loadUsage(input: { from: string; to: string; workspaceId?: string }) {
  const { from, to, workspaceId } = input;

  const [emailsSent, leads, campaignRuns, warmupSends, automationRuns, apiRequests] = await Promise.all([
    countRows("campaign_messages", "sent_at", from, to, (q) => q.eq("status", "sent"), workspaceId),
    countRows("leads", "created_at", from, to, undefined, workspaceId),
    countRows("campaign_launch_events", "created_at", from, to, undefined, workspaceId),
    countRows("warmup_jobs", "processed_at", from, to, (q) => q.eq("status", "sent"), workspaceId),
    countRows("automation_runs", "created_at", from, to, undefined, workspaceId),
    countRows("integration_events", "created_at", from, to, undefined, workspaceId),
  ]);

  let creditsQuery = supabaseAdmin
    .from("credit_ledger")
    .select("workspace_id, amount")
    .gte("created_at", from)
    .lte("created_at", to)
    .lt("amount", 0);
  if (workspaceId) creditsQuery = creditsQuery.eq("workspace_id", workspaceId);
  const { data: creditRows } = await creditsQuery;
  const creditsConsumed = (creditRows ?? []).reduce(
    (sum: number, r: { amount: number }) => sum + Math.abs(Number(r.amount ?? 0)),
    0,
  );

  const { data: media } = await supabaseAdmin.from("blog_media").select("size_bytes");
  const storageBytes = (media ?? []).reduce(
    (sum: number, m: { size_bytes: number | null }) => sum + Number(m.size_bytes ?? 0),
    0,
  );

  // Per-workspace usage against the limits on the plan the workspace is on.
  const { data: subs } = await supabaseAdmin
    .from("workspace_subscriptions")
    .select("workspace_id, plan_id, status");
  const { data: plans } = await supabaseAdmin
    .from("plans")
    .select("id, name, max_leads, max_campaigns, max_emails_monthly, max_users, max_sending_accounts, max_automations");
  const planById = new Map((plans ?? []).map((p: Record<string, any>) => [p["id"], p]));

  let sentQuery = supabaseAdmin
    .from("campaign_messages")
    .select("workspace_id")
    .eq("status", "sent")
    .gte("sent_at", from)
    .lte("sent_at", to)
    .limit(20000);
  if (workspaceId) sentQuery = sentQuery.eq("workspace_id", workspaceId);
  const { data: sentRows } = await sentQuery;
  const sentByWorkspace = new Map<string, number>();
  for (const r of (sentRows ?? []) as Array<{ workspace_id: string | null }>) {
    if (!r.workspace_id) continue;
    sentByWorkspace.set(r.workspace_id, (sentByWorkspace.get(r.workspace_id) ?? 0) + 1);
  }

  const { data: creditBalances } = await supabaseAdmin
    .from("workspace_credits")
    .select("workspace_id, balance, consumed_total");
  const creditByWorkspace = new Map(
    (creditBalances ?? []).map((c: Record<string, any>) => [c["workspace_id"], c]),
  );

  const names = await workspaceNames([
    ...sentByWorkspace.keys(),
    ...(subs ?? []).map((s: Record<string, any>) => s["workspace_id"]),
  ]);

  const workspaces = [...new Set([...sentByWorkspace.keys(), ...(subs ?? []).map((s: any) => s.workspace_id)])]
    .filter(Boolean)
    .filter((id) => !workspaceId || id === workspaceId)
    .map((id: string) => {
      const sub = (subs ?? []).find((s: any) => s.workspace_id === id);
      const plan = sub ? planById.get(sub.plan_id) : null;
      const credits = creditByWorkspace.get(id) as Record<string, any> | undefined;
      return {
        workspaceId: id,
        workspaceName: names.get(id) ?? id.slice(0, 8),
        planName: plan ? String(plan["name"]) : "No plan (trial)",
        planStatus: sub ? String(sub.status) : "none",
        emailsSent: sentByWorkspace.get(id) ?? 0,
        emailLimit: plan ? Number(plan["max_emails_monthly"] ?? 0) : null,
        leadLimit: plan ? Number(plan["max_leads"] ?? 0) : null,
        campaignLimit: plan ? Number(plan["max_campaigns"] ?? 0) : null,
        creditBalance: credits ? Number(credits["balance"] ?? 0) : 0,
        creditsConsumed: credits ? Number(credits["consumed_total"] ?? 0) : 0,
      };
    })
    .sort((a, b) => b.emailsSent - a.emailsSent);

  return {
    range: { from, to },
    totals: {
      emailsSent,
      leads,
      campaignRuns,
      warmupSends,
      automationRuns,
      apiRequests,
      creditsConsumed,
      storageBytes,
      // MunchReach has no AI metering table; reporting a number here would be invented.
      aiRequests: null as number | null,
    },
    workspaces,
  };
}

/* ------------------------------------------------------------------ */
/* 3. System health                                                    */
/* ------------------------------------------------------------------ */

export type HealthState = "healthy" | "degraded" | "down" | "not_configured";

export type HealthCheck = {
  id: string;
  label: string;
  group: string;
  state: HealthState;
  detail: string;
  responseMs: number | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  failures: number;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number; error: string | null }> {
  const started = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - started, error: null };
  } catch (error) {
    return { value: null, ms: Date.now() - started, error: sanitize((error as Error).message) };
  }
}

const DAY = 24 * 60 * 60 * 1000;

export async function runHealthChecks(): Promise<{ checkedAt: string; checks: HealthCheck[] }> {
  const since = new Date(Date.now() - DAY).toISOString();
  const checks: HealthCheck[] = [];
  const push = (c: HealthCheck) => checks.push(c);

  /* Database */
  const dbProbe = await timed(async () => {
    const { count, error } = await supabaseAdmin
      .from("workspaces")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  });
  push({
    id: "database",
    label: "Database",
    group: "Core",
    state: dbProbe.error ? "down" : dbProbe.ms > 1500 ? "degraded" : "healthy",
    detail: dbProbe.error ? "Query failed" : `${dbProbe.value} workspaces reachable`,
    responseMs: dbProbe.ms,
    lastSuccessAt: dbProbe.error ? null : new Date().toISOString(),
    lastError: dbProbe.error,
    failures: dbProbe.error ? 1 : 0,
  });

  /* Auth */
  const authProbe = await timed(async () => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw new Error(error.message);
    return data.users.length;
  });
  push({
    id: "auth",
    label: "Authentication",
    group: "Core",
    state: authProbe.error ? "down" : "healthy",
    detail: authProbe.error ? "Admin auth API unreachable" : "Auth admin API responding",
    responseMs: authProbe.ms,
    lastSuccessAt: authProbe.error ? null : new Date().toISOString(),
    lastError: authProbe.error,
    failures: authProbe.error ? 1 : 0,
  });

  /* Storage */
  const storageProbe = await timed(async () => {
    const { r2Configured, headR2Object } = await import("@/lib/r2.server");
    if (!r2Configured()) throw new Error("File storage credentials missing");
    await headR2Object("healthcheck/probe");
    return 1;
  });
  push({
    id: "storage",
    label: "Storage",
    group: "Core",
    state: storageProbe.error ? "down" : "healthy",
    detail: storageProbe.error ? "File storage unreachable" : "Cloudflare R2 responding",
    responseMs: storageProbe.ms,
    lastSuccessAt: storageProbe.error ? null : new Date().toISOString(),
    lastError: storageProbe.error,
    failures: storageProbe.error ? 1 : 0,
  });

  /* Realtime */
  const realtimeProbe = await timed(async () => {
    const { data, error } = await supabaseAdmin.rpc("has_role", {
      _user_id: "00000000-0000-0000-0000-000000000000",
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    return data;
  });
  push({
    id: "realtime",
    label: "Realtime / RPC",
    group: "Core",
    state: realtimeProbe.error ? "degraded" : "healthy",
    detail: realtimeProbe.error ? "Security-definer RPC failed" : "Postgres RPC layer responding",
    responseMs: realtimeProbe.ms,
    lastSuccessAt: realtimeProbe.error ? null : new Date().toISOString(),
    lastError: realtimeProbe.error,
    failures: realtimeProbe.error ? 1 : 0,
  });

  /* Sending providers */
  const { data: providers } = await supabaseAdmin
    .from("email_providers")
    .select("id, name, provider, is_enabled, last_error, last_tested_at, connection_status");
  const enabledProviders = (providers ?? []).filter((p: Record<string, any>) => p["is_enabled"]);
  const failingProviders = enabledProviders.filter((p: Record<string, any>) => p["last_error"]);
  push({
    id: "sending_providers",
    label: "Sending providers",
    group: "Email",
    state:
      enabledProviders.length === 0
        ? "not_configured"
        : failingProviders.length === enabledProviders.length
          ? "down"
          : failingProviders.length > 0
            ? "degraded"
            : "healthy",
    detail: `${enabledProviders.length} enabled · ${failingProviders.length} reporting errors`,
    responseMs: null,
    lastSuccessAt:
      enabledProviders
        .map((p: Record<string, any>) => p["last_tested_at"] as string | null)
        .filter(Boolean)
        .sort()
        .pop() ?? null,
    lastError: sanitize((failingProviders[0] as Record<string, any> | undefined)?.["last_error"] ?? null),
    failures: failingProviders.length,
  });

  /* Inbound email */
  const { count: inboundTotal } = await supabaseAdmin
    .from("email_events")
    .select("id", { count: "exact", head: true });
  const { count: inbound24 } = await supabaseAdmin
    .from("email_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  const { data: inboundFailed } = await supabaseAdmin
    .from("email_events")
    .select("id, error, created_at")
    .eq("status", "failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  push({
    id: "inbound",
    label: "Inbound email",
    group: "Email",
    state:
      (inboundTotal ?? 0) === 0
        ? "not_configured"
        : (inboundFailed?.length ?? 0) > 10
          ? "down"
          : (inboundFailed?.length ?? 0) > 0
            ? "degraded"
            : "healthy",
    detail: `${inbound24 ?? 0} events in 24h · ${inboundFailed?.length ?? 0} failed`,
    responseMs: null,
    lastSuccessAt: null,
    lastError: sanitize((inboundFailed?.[0] as Record<string, any> | undefined)?.["error"] ?? null),
    failures: inboundFailed?.length ?? 0,
  });

  /* Webhooks */
  const { data: billingHooks } = await supabaseAdmin
    .from("billing_webhook_events")
    .select("id, status, error, received_at")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(200);
  const hookFailures = (billingHooks ?? []).filter((h: Record<string, any>) => h["status"] === "failed");
  push({
    id: "webhooks",
    label: "Webhooks",
    group: "Integrations",
    state:
      (billingHooks?.length ?? 0) === 0
        ? "not_configured"
        : hookFailures.length > 5
          ? "down"
          : hookFailures.length > 0
            ? "degraded"
            : "healthy",
    detail: `${billingHooks?.length ?? 0} deliveries in 24h · ${hookFailures.length} failed`,
    responseMs: null,
    lastSuccessAt:
      ((billingHooks ?? []).find((h: Record<string, any>) => h["status"] !== "failed")?.["received_at"] as
        | string
        | undefined) ?? null,
    lastError: sanitize((hookFailures[0] as Record<string, any> | undefined)?.["error"] ?? null),
    failures: hookFailures.length,
  });

  /* Campaign worker */
  const { count: campaignBacklog } = await supabaseAdmin
    .from("campaign_messages")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "scheduled"])
    .lte("scheduled_at", new Date().toISOString());
  const { data: lastSent } = await supabaseAdmin
    .from("campaign_messages")
    .select("sent_at")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1);
  const { count: campaignFailed } = await supabaseAdmin
    .from("campaign_messages")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("updated_at", since);
  push({
    id: "campaign_worker",
    label: "Campaign worker",
    group: "Workers",
    state:
      (campaignBacklog ?? 0) > 500
        ? "down"
        : (campaignBacklog ?? 0) > 50 || (campaignFailed ?? 0) > 10
          ? "degraded"
          : "healthy",
    detail: `${campaignBacklog ?? 0} due in queue · ${campaignFailed ?? 0} failed in 24h`,
    responseMs: null,
    lastSuccessAt: ((lastSent?.[0] as Record<string, any> | undefined)?.["sent_at"] as string | null) ?? null,
    lastError: null,
    failures: campaignFailed ?? 0,
  });

  /* Warmup worker */
  const { data: warmupState } = await supabaseAdmin
    .from("warmup_runner_state")
    .select("id, paused, pause_reason, last_run_at")
    .limit(1);
  const runner = (warmupState?.[0] ?? null) as Record<string, any> | null;
  const { count: warmupFailed } = await supabaseAdmin
    .from("warmup_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", since);
  const warmupStale = runner?.["last_run_at"]
    ? Date.now() - new Date(runner["last_run_at"]).getTime() > 2 * 60 * 60 * 1000
    : true;
  push({
    id: "warmup_worker",
    label: "Warmup worker",
    group: "Workers",
    state: !runner
      ? "not_configured"
      : runner["paused"]
        ? "down"
        : warmupStale || (warmupFailed ?? 0) > 10
          ? "degraded"
          : "healthy",
    detail: runner
      ? `${warmupFailed ?? 0} failed jobs in 24h${runner["paused"] ? " · runner paused" : ""}`
      : "Runner state row missing",
    responseMs: null,
    lastSuccessAt: (runner?.["last_run_at"] as string | null) ?? null,
    lastError: sanitize((runner?.["pause_reason"] as string | null) ?? null),
    failures: warmupFailed ?? 0,
  });

  /* Automation worker */
  const { count: automationFailed } = await supabaseAdmin
    .from("automation_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", since);
  const { data: lastRun } = await supabaseAdmin
    .from("automation_runs")
    .select("completed_at")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1);
  const { count: automationTotal } = await supabaseAdmin
    .from("automation_runs")
    .select("id", { count: "exact", head: true });
  push({
    id: "automation_worker",
    label: "Automation worker",
    group: "Workers",
    state:
      (automationTotal ?? 0) === 0
        ? "not_configured"
        : (automationFailed ?? 0) > 20
          ? "down"
          : (automationFailed ?? 0) > 0
            ? "degraded"
            : "healthy",
    detail: `${automationTotal ?? 0} runs total · ${automationFailed ?? 0} failed in 24h`,
    responseMs: null,
    lastSuccessAt: ((lastRun?.[0] as Record<string, any> | undefined)?.["completed_at"] as string | null) ?? null,
    lastError: null,
    failures: automationFailed ?? 0,
  });

  /* Billing providers */
  const { data: billingProviders } = await supabaseAdmin
    .from("billing_providers")
    .select("provider, environment, is_enabled, last_error, last_verified_at");
  const enabledBilling = (billingProviders ?? []).filter((p: Record<string, any>) => p["is_enabled"]);
  const billingErrors = enabledBilling.filter((p: Record<string, any>) => p["last_error"]);
  push({
    id: "billing_providers",
    label: "Billing providers",
    group: "Integrations",
    state:
      enabledBilling.length === 0
        ? "not_configured"
        : billingErrors.length === enabledBilling.length
          ? "down"
          : billingErrors.length > 0
            ? "degraded"
            : "healthy",
    detail: `${enabledBilling.length} enabled · ${billingErrors.length} reporting errors`,
    responseMs: null,
    lastSuccessAt:
      enabledBilling
        .map((p: Record<string, any>) => p["last_verified_at"] as string | null)
        .filter(Boolean)
        .sort()
        .pop() ?? null,
    lastError: sanitize((billingErrors[0] as Record<string, any> | undefined)?.["last_error"] ?? null),
    failures: billingErrors.length,
  });

  /* Cron / scheduled jobs */
  const cron = await timed(async () => {
    const { data, error } = await supabaseAdmin.rpc("run_inbound_retry" as never);
    if (error) throw new Error(error.message);
    return data;
  });
  push({
    id: "cron",
    label: "Cron / scheduled jobs",
    group: "Workers",
    state: cron.error ? "degraded" : "healthy",
    detail: cron.error
      ? "Scheduled sweep function did not execute"
      : "Scheduled sweep executed on demand",
    responseMs: cron.ms,
    lastSuccessAt: cron.error ? null : new Date().toISOString(),
    lastError: cron.error,
    failures: cron.error ? 1 : 0,
  });

  return { checkedAt: new Date().toISOString(), checks };
}

/** Alerts derived from the same live checks — never synthetic. */
export function deriveAlerts(checks: HealthCheck[]) {
  return checks
    .filter((c) => c.state === "down" || c.state === "degraded")
    .map((c) => ({
      id: c.id,
      severity: c.state === "down" ? ("critical" as const) : ("warning" as const),
      title: `${c.label} ${c.state === "down" ? "is down" : "is degraded"}`,
      detail: c.lastError ? `${c.detail} — ${c.lastError}` : c.detail,
      failures: c.failures,
    }));
}

/* ------------------------------------------------------------------ */
/* 4. Application logs                                                 */
/* ------------------------------------------------------------------ */

export type LogLevel = "debug" | "info" | "warning" | "error" | "critical";

export type LogRow = {
  id: string;
  at: string | null;
  level: LogLevel;
  service: string;
  event: string;
  message: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  actor: string | null;
  requestId: string;
  result: string;
  detail: Record<string, unknown>;
};

export async function loadApplicationLogs(filters: {
  level?: string;
  service?: string;
  workspaceId?: string;
  search?: string;
  from?: string;
  to?: string;
  requestId?: string;
  limit?: number;
}): Promise<LogRow[]> {
  const limit = filters.limit ?? 200;
  const per = Math.min(limit, 120);
  const rows: LogRow[] = [];
  const wantService = filters.service && filters.service !== "all" ? filters.service : null;

  const range = (q: any, column: string) => {
    let out = q;
    if (filters.from) out = out.gte(column, filters.from);
    if (filters.to) out = out.lte(column, filters.to);
    if (filters.workspaceId) out = out.eq("workspace_id", filters.workspaceId);
    return out.order(column, { ascending: false }).limit(per);
  };

  if (!wantService || wantService === "campaigns") {
    const { data } = await range(
      supabaseAdmin
        .from("campaign_messages")
        .select("id, workspace_id, status, last_error, attempts, subject, updated_at")
        .eq("status", "failed"),
      "updated_at",
    );
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      rows.push({
        id: `campaign-${r["id"]}`,
        at: r["updated_at"],
        level: "error",
        service: "campaigns",
        event: "campaign.send_failed",
        message: sanitize(r["last_error"]) ?? "Send failed",
        workspaceId: r["workspace_id"],
        workspaceName: null,
        actor: null,
        requestId: String(r["id"]),
        result: "failure",
        detail: redact({ attempts: r["attempts"], subject: r["subject"] }) as Record<string, unknown>,
      });
    }
  }

  if (!wantService || wantService === "warmup") {
    const { data } = await range(
      supabaseAdmin
        .from("warmup_jobs")
        .select("id, workspace_id, status, error, attempts, created_at")
        .eq("status", "failed"),
      "created_at",
    );
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      rows.push({
        id: `warmup-${r["id"]}`,
        at: r["created_at"],
        level: "error",
        service: "warmup",
        event: "warmup.job_failed",
        message: sanitize(r["error"]) ?? "Warmup job failed",
        workspaceId: r["workspace_id"],
        workspaceName: null,
        actor: null,
        requestId: String(r["id"]),
        result: "failure",
        detail: redact({ attempts: r["attempts"] }) as Record<string, unknown>,
      });
    }
  }

  if (!wantService || wantService === "automations") {
    const { data } = await range(
      supabaseAdmin
        .from("automation_runs")
        .select("id, workspace_id, status, error, attempts, trigger_type, created_at")
        .in("status", ["failed", "completed"]),
      "created_at",
    );
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      const failed = r["status"] === "failed";
      rows.push({
        id: `automation-${r["id"]}`,
        at: r["created_at"],
        level: failed ? "error" : "info",
        service: "automations",
        event: failed ? "automation.run_failed" : "automation.run_completed",
        message: sanitize(r["error"]) ?? `Run ${r["status"]}`,
        workspaceId: r["workspace_id"],
        workspaceName: null,
        actor: null,
        requestId: String(r["id"]),
        result: failed ? "failure" : "success",
        detail: redact({ trigger: r["trigger_type"], attempts: r["attempts"] }) as Record<string, unknown>,
      });
    }
  }

  if (!wantService || wantService === "inbound") {
    const { data } = await range(
      supabaseAdmin
        .from("email_events")
        .select("id, workspace_id, provider, event_type, status, error, failure_code, created_at"),
      "created_at",
    );
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      const failed = r["status"] === "failed";
      rows.push({
        id: `inbound-${r["id"]}`,
        at: r["created_at"],
        level: failed ? "error" : "info",
        service: "inbound",
        event: `inbound.${r["event_type"] ?? "event"}`,
        message: sanitize(r["error"]) ?? `Event ${r["status"]}`,
        workspaceId: r["workspace_id"],
        workspaceName: null,
        actor: null,
        requestId: String(r["id"]),
        result: failed ? "failure" : "success",
        detail: redact({ provider: r["provider"], failure_code: r["failure_code"] }) as Record<string, unknown>,
      });
    }
  }

  if (!wantService || wantService === "mailboxes") {
    const { data } = await range(
      supabaseAdmin
        .from("sending_account_checks")
        .select("id, workspace_id, kind, ok, provider, status_code, message, duration_ms, created_at"),
      "created_at",
    );
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      rows.push({
        id: `mailbox-${r["id"]}`,
        at: r["created_at"],
        level: r["ok"] ? "info" : "error",
        service: "mailboxes",
        event: `mailbox.${r["kind"]}`,
        message: sanitize(r["message"]) ?? (r["ok"] ? "Check passed" : "Check failed"),
        workspaceId: r["workspace_id"],
        workspaceName: null,
        actor: null,
        requestId: String(r["id"]),
        result: r["ok"] ? "success" : "failure",
        detail: redact({
          provider: r["provider"],
          status_code: r["status_code"],
          duration_ms: r["duration_ms"],
        }) as Record<string, unknown>,
      });
    }
  }

  if (!wantService || wantService === "integrations") {
    const { data } = await range(
      supabaseAdmin
        .from("integration_sync_logs")
        .select("id, workspace_id, slug, action, status, records, error, started_at"),
      "started_at",
    );
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      const failed = String(r["status"]).includes("fail") || Boolean(r["error"]);
      rows.push({
        id: `integration-${r["id"]}`,
        at: r["started_at"],
        level: failed ? "error" : "info",
        service: "integrations",
        event: `integration.${r["action"]}`,
        message: sanitize(r["error"]) ?? `${r["slug"]} ${r["status"]}`,
        workspaceId: r["workspace_id"],
        workspaceName: null,
        actor: null,
        requestId: String(r["id"]),
        result: failed ? "failure" : "success",
        detail: redact({ slug: r["slug"], records: r["records"] }) as Record<string, unknown>,
      });
    }
  }

  if (!wantService || wantService === "billing") {
    let q = supabaseAdmin
      .from("billing_webhook_events")
      .select("id, provider, environment, event_type, status, error, http_status, received_at")
      .order("received_at", { ascending: false })
      .limit(per);
    if (filters.from) q = q.gte("received_at", filters.from);
    if (filters.to) q = q.lte("received_at", filters.to);
    const { data } = await q;
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      const failed = r["status"] === "failed";
      rows.push({
        id: `billing-${r["id"]}`,
        at: r["received_at"],
        level: failed ? "critical" : "info",
        service: "billing",
        event: `billing.${r["event_type"] ?? "webhook"}`,
        message: sanitize(r["error"]) ?? `Webhook ${r["status"]}`,
        workspaceId: null,
        workspaceName: null,
        actor: null,
        requestId: String(r["id"]),
        result: failed ? "failure" : "success",
        detail: redact({
          provider: r["provider"],
          environment: r["environment"],
          http_status: r["http_status"],
        }) as Record<string, unknown>,
      });
    }
  }

  if (!wantService || wantService === "domains") {
    const { data } = await range(
      supabaseAdmin
        .from("domain_alerts")
        .select("id, workspace_id, kind, severity, title, detail, resolved_at, created_at"),
      "created_at",
    );
    for (const r of (data ?? []) as Array<Record<string, any>>) {
      rows.push({
        id: `domain-${r["id"]}`,
        at: r["created_at"],
        level: String(r["severity"]) === "critical" ? "critical" : "warning",
        service: "domains",
        event: `domain.${r["kind"]}`,
        message: sanitize(r["title"]) ?? "Domain alert",
        workspaceId: r["workspace_id"],
        workspaceName: null,
        actor: null,
        requestId: String(r["id"]),
        result: r["resolved_at"] ? "resolved" : "open",
        detail: redact({ detail: r["detail"] }) as Record<string, unknown>,
      });
    }
  }

  const names = await workspaceNames(rows.map((r) => r.workspaceId));
  for (const row of rows) {
    row.workspaceName = row.workspaceId ? (names.get(row.workspaceId) ?? null) : null;
  }

  let filtered = rows;
  if (filters.level && filters.level !== "all") filtered = filtered.filter((r) => r.level === filters.level);
  if (filters.requestId) {
    const rid = filters.requestId.toLowerCase();
    filtered = filtered.filter((r) => r.requestId.toLowerCase().includes(rid));
  }
  if (filters.search) {
    const term = filters.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        (r.message ?? "").toLowerCase().includes(term) ||
        r.event.toLowerCase().includes(term) ||
        (r.workspaceName ?? "").toLowerCase().includes(term),
    );
  }
  filtered.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
  return filtered.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* 5. Admin audit trail                                                */
/* ------------------------------------------------------------------ */

export async function loadAdminAuditLog(filters: {
  targetType?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  let q = supabaseAdmin
    .from("admin_audit_log")
    .select("id, actor_id, action, target_type, target_id, target_label, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 250);
  if (filters.targetType && filters.targetType !== "all") q = q.eq("target_type", filters.targetType);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const actorIds = [...new Set((data ?? []).map((r: Record<string, any>) => r["actor_id"]).filter(Boolean))];
  const emails = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("id", actorIds as string[]);
    for (const p of (profiles ?? []) as Array<Record<string, any>>) emails.set(p["id"], p["email"]);
  }

  const rows = (data ?? []).map((r: Record<string, any>) => {
    const detail = (r["detail"] ?? {}) as Record<string, unknown>;
    return {
      id: String(r["id"]),
      at: r["created_at"] as string,
      action: String(r["action"]),
      targetType: String(r["target_type"]),
      targetId: (r["target_id"] as string | null) ?? null,
      targetLabel: sanitize(r["target_label"] as string | null),
      actorId: (r["actor_id"] as string | null) ?? null,
      actorEmail: r["actor_id"] ? (emails.get(r["actor_id"]) ?? null) : null,
      result: typeof detail["result"] === "string" ? String(detail["result"]) : "success",
      requestId: String(r["id"]),
      detail: redact(detail) as Record<string, unknown>,
    };
  });

  const search = filters.search?.toLowerCase();
  return search
    ? rows.filter(
        (r) =>
          r.action.toLowerCase().includes(search) ||
          (r.targetLabel ?? "").toLowerCase().includes(search) ||
          (r.actorEmail ?? "").toLowerCase().includes(search),
      )
    : rows;
}

/** Distinct target types present in the audit trail, for the filter control. */
export async function loadAuditTargetTypes() {
  const { data } = await supabaseAdmin.from("admin_audit_log").select("target_type").limit(1000);
  return [...new Set((data ?? []).map((r: { target_type: string }) => r.target_type))].sort();
}


/**
 * Usage audit trail: every allowance consumption, release and denial recorded
 * by the database metering function.
 */
export async function loadUsageAudit(input: {
  workspaceId?: string | undefined;
  deniedOnly?: boolean;
  limit?: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("usage_audit_log")
    .select("id, workspace_id, resource, action, amount, allowed, used_after, limit_value, period_start, plan_name, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);
  if (input.workspaceId) query = query.eq("workspace_id", input.workspaceId);
  if (input.deniedOnly) query = query.eq("allowed", false);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = [...new Set(rows.map((r) => String(r["workspace_id"])))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ws } = await supabaseAdmin.from("workspaces").select("id, name").in("id", ids);
    for (const w of (ws ?? []) as Array<{ id: string; name: string }>) names.set(w.id, w.name);
  }
  return rows.map((r) => ({
    id: String(r["id"]),
    workspaceId: String(r["workspace_id"]),
    workspaceName: names.get(String(r["workspace_id"])) ?? "Unknown workspace",
    resource: String(r["resource"]),
    action: String(r["action"]),
    amount: Number(r["amount"] ?? 0),
    allowed: Boolean(r["allowed"]),
    usedAfter: r["used_after"] === null ? null : Number(r["used_after"]),
    limitValue: r["limit_value"] === null ? null : Number(r["limit_value"]),
    periodStart: (r["period_start"] as string | null) ?? null,
    planName: (r["plan_name"] as string | null) ?? null,
    reason: (r["reason"] as string | null) ?? null,
    createdAt: String(r["created_at"]),
  }));
}
