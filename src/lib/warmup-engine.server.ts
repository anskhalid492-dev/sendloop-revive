/**
 * Warmup engine — scheduler, queue worker, event processing, health scoring
 * and the automatic safety system.
 *
 * Everything here runs server-side under the service role and is driven by the
 * cron endpoint (`/api/public/cron/run-warmup`). There is no simulation: a job
 * only becomes `sent` after the managed provider accepted the message, and a
 * job only becomes `delivered`, `bounced` or `replied` after a real provider
 * event arrived on the webhook.
 */
import { bouncePenalty as bouncePenaltyFor, routeWarmupMessage, softSignalPenalty, warmupKindForReport, warmupReportExternalId } from "@/lib/delivery-lifecycle";
import { isSameHealthSnapshot } from "@/lib/warmup-health-snapshot";
import { buildWarmupMessage, buildWarmupReply } from "@/lib/warmup-content.server";
import { evaluateSafetyViolation, type SafetyStatRow } from "@/lib/mailbox-pause-state";
import { statusFromScore, type WarmupHealthFactor, type WarmupHealthStatus } from "@/lib/warmup-model";
import {
  advancesWarmupDelivery,
  normalizeWarmupDeliveryState,
  type WarmupDeliveryState,
} from "@/lib/warmup-delivery";
import { providerMessageIdCandidates } from "@/lib/provider-message-id";
import {
  evaluateWarmupRamp,
  type RampStatRow,
  type WarmupStage,
  type WarmupStageAction,
} from "@/lib/warmup-ramp";
import { evaluateMailboxCapacity } from "@/lib/mailbox-capacity";
import { warmupHourlyLimit } from "@/lib/mailbox-hourly-cap";
import { PROGRESSION_COLUMNS, resolveWarmupProgression, warmupCalendarDay, type ProgressionSettings } from "@/lib/warmup-progression";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Admin = any;

const RUNNER_ID = "warmup";
const LEASE_MS = 5 * 60_000;
export const MAX_JOBS_PER_RUN = 40;
const MAX_ACCOUNTS_PER_RUN = 50;
/** How long a sent warmup email may take to show up on the receiving side. */
const PLACEMENT_WINDOW_MS = 45 * 60_000;

/** Unguessable per-message reference used to recognise our own warmup mail. */
function warmupToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The footer carries the reference when a provider strips custom headers. */
function withWarmupRef(body: string, token: string): string {
  return `${body}\n\n--\nRef: MRW-${token}`;
}

export type RunSummary = {
  ok: boolean;
  skipped?: string;
  scheduled: number;
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  healthUpdated: number;
  paused: string[];
  errors: string[];
  /** Mailboxes stopped this run because the plan does not include warmup. */
  skippedPlan?: number;
};

export function emptySummary(): RunSummary {
  return {
    ok: true,
    scheduled: 0,
    claimed: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    healthUpdated: 0,
    paused: [],
    errors: [],
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ lease */

/** Single-flight lease: a second concurrent run exits instead of double-sending. */
export async function acquireLease(admin: Admin, owner: string) {
  const nowIso = new Date().toISOString();
  const { data: state } = await admin
    .from("warmup_runner_state")
    .select("id, paused, pause_reason, lease_until")
    .eq("id", RUNNER_ID)
    .maybeSingle();

  if (!state) {
    await admin.from("warmup_runner_state").insert({ id: RUNNER_ID });
    return { acquired: true, paused: false, pauseReason: null as string | null };
  }
  if (state.lease_until && state.lease_until > nowIso) {
    return { acquired: false, paused: !!state.paused, pauseReason: state.pause_reason ?? null };
  }

  const { data: updated } = await admin
    .from("warmup_runner_state")
    .update({
      lease_owner: owner,
      lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
      last_run_at: nowIso,
    })
    .eq("id", RUNNER_ID)
    .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
    .select("id")
    .maybeSingle();

  return {
    acquired: !!updated,
    paused: !!state.paused,
    pauseReason: state.pause_reason ?? null,
  };
}

export async function releaseLease(admin: Admin, result: RunSummary) {
  await admin
    .from("warmup_runner_state")
    .update({ lease_until: null, lease_owner: null, last_result: result })
    .eq("id", RUNNER_ID);
}

/* --------------------------------------------------------------- accounting */

async function bumpStats(
  admin: Admin,
  args: {
    workspaceId: string;
    accountId: string;
    day?: string;
    target?: number;
    /** Ramp stage that produced today's target, for the history table. */
    stage?: WarmupStage;
    stageAction?: WarmupStageAction;
    plannedTarget?: number;
  },
  patch: Partial<
    Record<
      | "scheduled"
      | "sent"
      | "delivered"
      | "bounced"
      | "complained"
      | "failed"
      | "replied"
      | "inbox"
      | "spam"
      | "deferred"
      | "rejected"
      | "not_received",
      number
    >
  >,
) {
  const day = args.day ?? today();
  const { data: existing } = await admin
    .from("warmup_daily_stats")
    .select(
      "id, scheduled, sent, delivered, bounced, complained, failed, replied, inbox, spam, deferred, rejected, not_received, target",
    )
    .eq("sending_account_id", args.accountId)
    .eq("day", day)
    .maybeSingle();

  if (!existing) {
    await admin.from("warmup_daily_stats").insert({
      workspace_id: args.workspaceId,
      sending_account_id: args.accountId,
      day,
      target: args.target ?? 0,
      scheduled: patch.scheduled ?? 0,
      sent: patch.sent ?? 0,
      delivered: patch.delivered ?? 0,
      bounced: patch.bounced ?? 0,
      complained: patch.complained ?? 0,
      failed: patch.failed ?? 0,
      replied: patch.replied ?? 0,
      inbox: patch.inbox ?? 0,
      spam: patch.spam ?? 0,
      deferred: patch.deferred ?? 0,
      rejected: patch.rejected ?? 0,
      not_received: patch.not_received ?? 0,
      ...(args.stage ? { stage: args.stage } : {}),
      ...(args.stageAction ? { stage_action: args.stageAction } : {}),
      ...(args.plannedTarget !== undefined ? { planned_target: args.plannedTarget } : {}),
    });
    return;
  }

  const next: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(patch)) {
    next[key] = (existing[key] ?? 0) + (value ?? 0);
  }
  if (args.target !== undefined) next["target"] = args.target;
  if (args.stage) next["stage"] = args.stage;
  if (args.stageAction) next["stage_action"] = args.stageAction;
  if (args.plannedTarget !== undefined) next["planned_target"] = args.plannedTarget;
  await admin.from("warmup_daily_stats").update(next).eq("id", existing.id);
}

async function logEvent(
  admin: Admin,
  row: {
    workspaceId: string;
    accountId: string;
    jobId?: string | null;
    type: string;
    detail?: string | null;
    provider?: string | null;
    providerMessageId?: string | null;
    externalId?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<boolean> {
  const { error } = await admin.from("warmup_events").insert({
    workspace_id: row.workspaceId,
    sending_account_id: row.accountId,
    job_id: row.jobId ?? null,
    type: row.type,
    detail: row.detail ?? null,
    provider: row.provider ?? null,
    provider_message_id: row.providerMessageId ?? null,
    external_id: row.externalId ?? null,
    payload: row.payload ?? {},
  });
  // Unique violation on external_id == provider redelivery; analytics must not double count.
  if (error && error.code === "23505") return false;
  // Check-constraint drift on the event type must never abort a dispatch cycle,
  // and must not suppress the bookkeeping that follows: only a *duplicate* means
  // the counters were already applied. A rejected type is still a first sighting,
  // so report it as fresh and let stats/health update.
  if (error && error.code === "23514") {
    console.warn(`warmup event type "${row.type}" rejected by the database constraint — counted anyway`);
    return true;
  }
  if (error) throw new Error(error.message);
  return true;
}

/* -------------------------------------------------- delivery state tracking */

export type WarmupDeliveryJob = {
  id: string;
  workspace_id: string;
  sending_account_id: string;
  status?: string | null;
  delivery_state?: string | null;
  delivered_at?: string | null;
};

/**
 * Moves a warmup message's internal delivery state forward. A weaker signal
 * never overwrites a stronger one, so a late "accepted" cannot hide a bounce.
 * Never touches the daily counters — those are owned by the callers that know
 * which counter the event belongs to.
 */
async function setWarmupDeliveryState(
  admin: Admin,
  job: WarmupDeliveryJob,
  next: WarmupDeliveryState,
): Promise<void> {
  if (!advancesWarmupDelivery((job.delivery_state ?? null) as WarmupDeliveryState | null, next)) return;
  // Tolerant of a not-yet-applied migration: the state column is an audit aid,
  // it must never break event handling.
  const { error } = await admin
    .from("warmup_jobs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ delivery_state: next } as any)
    .eq("id", job.id);
  if (error && error.code !== "42703" && error.code !== "PGRST204") throw new Error(error.message);
}

/**
 * Records a confirmed arrival for one warmup message and bumps the daily
 * `delivered` counter exactly once.
 *
 * Idempotency is enforced in the database: the update only matches while
 * `delivered_at` is still null, so a redelivered webhook, a second IMAP read of
 * the same message and the reconciliation sweep can all run without ever
 * double counting. Returns true only for the first confirmation.
 */
export async function confirmWarmupDelivery(
  admin: Admin,
  args: {
    job: WarmupDeliveryJob;
    /** Where the proof came from, for auditing. */
    source: "inbound_arrival" | "imap_arrival" | "provider_event" | "peer_reply";
    occurredAt?: string | null;
    /** Extra columns the caller already knows (placement, received_at, …). */
    extraPatch?: Record<string, unknown>;
  },
): Promise<boolean> {
  const at = args.occurredAt ?? new Date().toISOString();
  const patch: Record<string, unknown> = {
    ...(args.extraPatch ?? {}),
    delivery_state: "delivered",
    delivered_at: at,
    delivered_source: args.source,
  };
  // A confirmed arrival also lifts the job status, unless it already moved on
  // to a stronger outcome (replied) or a negative one (failed/cancelled).
  const status = args.job.status ?? null;
  if (status === "sent" || status === "processing" || status === "queued") {
    patch["status"] = "delivered";
  }

  const { data, error } = await admin
    .from("warmup_jobs")
    .update(patch as never)
    .eq("id", args.job.id)
    .is("delivered_at", null)
    .select("id");
  if (error) {
    // Columns missing (SQL not applied yet): fall back to the legacy patch so
    // arrival detection keeps working, without the idempotency guard.
    if (error.code === "42703" || error.code === "PGRST204") {
      await admin
        .from("warmup_jobs")
        .update({ ...(args.extraPatch ?? {}), ...(patch["status"] ? { status: patch["status"] } : {}) } as never)
        .eq("id", args.job.id);
      return true;
    }
    throw new Error(error.message);
  }
  const firstConfirmation = ((data ?? []) as Array<unknown>).length > 0;
  if (!firstConfirmation) return false;

  await bumpStats(
    admin,
    { workspaceId: args.job.workspace_id, accountId: args.job.sending_account_id, day: at.slice(0, 10) },
    { delivered: 1 },
  );
  return true;
}



async function logCheck(
  admin: Admin,
  row: {
    workspaceId: string;
    accountId: string;
    kind: string;
    ok: boolean;
    provider?: string | null;
    message?: string | null;
    detail?: Record<string, unknown>;
    durationMs?: number | null;
  },
) {
  await admin.from("sending_account_checks").insert({
    workspace_id: row.workspaceId,
    sending_account_id: row.accountId,
    kind: row.kind,
    ok: row.ok,
    provider: row.provider ?? null,
    message: row.message?.slice(0, 500) ?? null,
    detail: row.detail ?? {},
    duration_ms: row.durationMs ?? null,
  });
}

/* --------------------------------------------------------------- scheduler */

type AccountRow = {
  id: string;
  workspace_id: string;
  from_name: string;
  from_email: string;
  provider: string;
  provider_id: string | null;
  connection_method: string | null;
  status: string;
  paused: boolean;
  customer_enabled: boolean;
  health_score: number | null;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
};

type SettingsRow = ProgressionSettings & {
  id: string;
  sending_account_id: string;
  workspace_id: string;
  enabled: boolean;
  start_volume: number;
  max_volume: number;
  daily_increase: number;
  ramp_days: number;
  send_days: number[];
  send_start_hour: number;
  send_end_hour: number;
  reply_rate: number;
  max_bounce_rate: number;
  min_health_score: number;
  auto_pause: boolean;
  paused_by_system: boolean;
  started_at: string | null;
  ramp_stage?: WarmupStage | null;
  stage_since?: string | null;
  stage_reason?: string | null;
  current_volume?: number | null;
  hold_failure_rate?: number | null;
  recovery_bounce_rate?: number | null;
  recovery_days?: number | null;
};

/** Columns the scheduler needs from `warmup_settings`. */
export const WARMUP_SETTINGS_COLUMNS =
  "id, sending_account_id, workspace_id, enabled, start_volume, max_volume, daily_increase, ramp_days, send_days, send_start_hour, send_end_hour, reply_rate, max_bounce_rate, min_health_score, auto_pause, paused_by_system, started_at, ramp_stage, stage_since, stage_reason, current_volume, hold_failure_rate, recovery_bounce_rate, recovery_days, " + PROGRESSION_COLUMNS;

/**
 * How much warmup capacity the mailbox has left today after human replies and
 * campaign sending have taken their share. Warmup is always last in line.
 */
async function warmupCapacityCeiling(admin: Admin, accountId: string): Promise<number | null> {
  const { data } = await admin
    .from("sending_accounts")
    .select("id, from_name, from_email, paused, customer_enabled, status, sent_today, daily_limit, hourly_limit, last_sent_at")
    .eq("id", accountId)
    .maybeSingle();
  if (!data) return null;
  const capacity = evaluateMailboxCapacity(data as never, 0, undefined, "warmup");
  return capacity.dailyRemaining;
}

/** Recent provider throttling seen on this mailbox's own warmup attempts. */
async function recentlyThrottled(admin: Admin, accountId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data } = await admin
    .from("warmup_jobs")
    .select("error")
    .eq("sending_account_id", accountId)
    .gte("created_at", since)
    .not("error", "is", null)
    .limit(50);
  return ((data ?? []) as Array<{ error: string | null }>).some((row) =>
    /rate limit|too many|throttl|429|greylist|try again later/i.test(row.error ?? ""),
  );
}

/**
 * Today's warmup volume, decided from the mailbox's real record by the ramp
 * state machine — never from elapsed days alone. The chosen stage, reason and
 * volume are persisted so the dashboard and history show exactly what the
 * engine did and why.
 */
export async function resolveDailyTarget(
  admin: Admin,
  account: AccountRow,
  settings: SettingsRow,
): Promise<{ target: number; stage: WarmupStage; action: WarmupStageAction; reason: string }> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data: stats } = await admin
    .from("warmup_daily_stats")
    .select("day, target, sent, delivered, bounced, complained, failed, replied, deferred, rejected, not_received")
    .eq("sending_account_id", account.id)
    .gte("day", since)
    .order("day", { ascending: false })
    .limit(14);

  const [throttled, ceiling] = await Promise.all([
    recentlyThrottled(admin, account.id),
    warmupCapacityCeiling(admin, account.id),
  ]);

  // Yesterday and earlier only: today's partial row must not hold the ramp back.
  const rows = ((stats ?? []) as RampStatRow[]).filter((row) => row.day < today());
  const todayRow = ((stats ?? []) as RampStatRow[]).find((row) => row.day === today());

  let decision = evaluateWarmupRamp({
    settings: {
      start_volume: settings.start_volume,
      max_volume: settings.max_volume,
      daily_increase: settings.daily_increase,
      max_bounce_rate: settings.max_bounce_rate,
      min_health_score: settings.min_health_score,
      hold_failure_rate: settings.hold_failure_rate ?? null,
      recovery_bounce_rate: settings.recovery_bounce_rate ?? null,
      recovery_days: settings.recovery_days ?? null,
    },
    stats: rows,
    healthScore: account.health_score ?? null,
    authStatuses: [account.spf_status, account.dkim_status, account.dmarc_status],
    stage: settings.ramp_stage ?? null,
    stageSince: settings.stage_since ?? null,
    currentVolume: settings.current_volume ?? todayRow?.target ?? null,
    throttled,
    capacityCeiling: ceiling,
  });

  // Null first-run histories cannot mask active low health or auth protection.
  const safety = evaluateSafetyViolation({ stats: rows, maxBounceRate: settings.max_bounce_rate, minHealthScore: settings.min_health_score, healthScore: account.health_score, accountStatus: account.status, authStatuses: [account.spf_status, account.dkim_status, account.dmarc_status] });
  if (safety.active) decision = { stage: "paused", action: "pause", target: 0, reason: safety.reason ?? "Warmup safety protection is active." };

  // Progression is always automatic: a mailbox still parked on the legacy
  // schedule converts itself on the next tick, seeded exactly like the
  // settings save path (calendar day + current daily volume), so today's
  // limit never jumps. Mailboxes with no known start keep the legacy engine.
  let progressionSettings = settings;
  if ((!settings.progression_mode || settings.progression_mode === "legacy") && settings.started_at) {
    const seeded = {
      progression_mode: "automatic" as const,
      progression_day: warmupCalendarDay(settings.started_at),
      progression_date: today(),
      progression_limit: Math.max(1, settings.current_volume ?? 1),
      progression_review_required: false,
    };
    const seededResult = await admin.from("warmup_settings").update(seeded).eq("id", settings.id);
    if (seededResult.error) throw new Error(seededResult.error.message);
    progressionSettings = { ...settings, ...seeded };
  }

  if (progressionSettings.progression_mode && progressionSettings.progression_mode !== "legacy") {
    const unhealthy = account.health_score !== null && account.health_score < 70;
    const blocked = progressionSettings.paused_by_system || !progressionSettings.enabled || account.paused || !account.customer_enabled || unhealthy || throttled || decision.stage === "paused" || decision.stage === "recovery";
    const progression = resolveWarmupProgression(progressionSettings, blocked);
    let limit = progression.effectiveLimit;
    if (decision.stage === "recovery" && !unhealthy) limit = Math.min(progression.limit, decision.target);
    if (ceiling !== null) limit = Math.min(limit, ceiling);
    decision = { ...decision, target: limit, reason: blocked ? decision.reason : `Day ${progression.day} · Stage ${progression.stage} · ${progressionSettings.progression_mode === "manual" ? "Manual" : "Automatic"} limit ${limit}/day.`, stage: blocked ? decision.stage : progression.day >= (progressionSettings.progression_stages?.at(-1)?.end_day ?? 25) ? "stable" : "ramp_up" };
    const { error } = await admin.from("warmup_settings").update({
      progression_day: progression.day, progression_date: progression.date,
      progression_limit: blocked ? Math.min(progression.limit, decision.stage === "recovery" ? decision.target : progression.limit) : progression.limit,
    }).eq("id", progressionSettings.id);
    if (error) throw new Error(error.message);
  }

  const stageChanged = (settings.ramp_stage ?? null) !== decision.stage;
  await admin
    .from("warmup_settings")
    .update({
      ramp_stage: decision.stage,
      stage_reason: decision.reason,
      current_volume: decision.target,
      ...(stageChanged ? { stage_since: new Date().toISOString() } : {}),
    })
    .eq("id", settings.id);

  return {
    target: decision.target,
    stage: decision.stage,
    action: decision.action,
    reason: decision.reason,
  };
}

function withinWindow(settings: SettingsRow, date: Date): boolean {
  return settings.send_days.includes(date.getUTCDay());
}

/** Spreads N sends across the configured window with jitter — never all at once. */
function slots(settings: SettingsRow, count: number): Date[] {
  const now = new Date();
  const startHour = Math.max(settings.send_start_hour, now.getUTCHours());
  const endHour = Math.max(startHour + 1, settings.send_end_hour);
  const windowMs = (endHour - startHour) * 3_600_000;
  const base = new Date(now);
  base.setUTCHours(startHour, 0, 0, 0);
  const step = windowMs / Math.max(1, count);

  return Array.from({ length: count }, (_, i) => {
    const jitter = Math.floor(Math.random() * step * 0.8);
    const at = new Date(base.getTime() + i * step + jitter);
    return at.getTime() < now.getTime() ? new Date(now.getTime() + 60_000 * (i + 1)) : at;
  });
}

/** Human-readable state of a mailbox for the dashboard and the runner log. */
export async function warmupBlockReason(
  admin: Admin,
  account: Pick<
    AccountRow,
    "id" | "workspace_id" | "from_email" | "provider_id" | "status" | "paused" | "customer_enabled"
  > & {
    provider_id?: string | null;
  },
): Promise<string | null> {
  if (account.paused) return "Mailbox is paused.";
  if (!account.customer_enabled) return "Mailbox sending is switched off.";
  if (account.status === "disabled") return "Mailbox is disabled.";
  // Availability is decided by the infrastructure that is active right now, not
  // by the provider recorded on the mailbox when it was connected.
  const { resolveMailboxSendingProvider } = await import("@/lib/mailbox-sending-provider.server");
  const resolved = await resolveMailboxSendingProvider(admin, {
    id: account.id,
    from_email: account.from_email,
    provider_id: account.provider_id ?? null,
  });
  if (!resolved) {
    return "No active sending infrastructure is available for this mailbox right now.";
  }
  return null;
}

async function recordRunReason(admin: Admin, settingsId: string, reason: string | null) {
  await admin
    .from("warmup_settings")
    .update({ last_run_reason: reason, last_run_at: new Date().toISOString() })
    .eq("id", settingsId);
}

/**
 * Builds today's queue for one mailbox.
 *
 * Recipients are other warmup-enabled mailboxes in the network. When a
 * workspace is still warming its first mailbox there is no peer available, so
 * the engine falls back to solo warmup: the mailbox mails itself, which is a
 * real send through the provider and a real arrival we can score for placement.
 */
async function scheduleAccount(
  admin: Admin,
  account: AccountRow,
  settings: SettingsRow,
  peers: AccountRow[],
  options?: { force?: boolean; maxNew?: number },
): Promise<{ scheduled: number; reason?: string }> {
  const force = options?.force ?? false;
  const now = new Date();
  if (!force && !withinWindow(settings, now)) return { scheduled: 0, reason: "Outside the configured sending days." };

  const blocked = await warmupBlockReason(admin, account);
  if (blocked) return { scheduled: 0, reason: blocked };

  // Recipient priority: the platform warmup pool (managed by admins), then
  // other warmup mailboxes in the network, then solo warmup so a single
  // mailbox workspace still produces real sends.
  const { data: poolRows } = await admin
    .from("warmup_recipients")
    .select("id, email, last_sent_at")
    .eq("enabled", true)
    .eq("status", "active")
    .order("last_sent_at", { ascending: true, nullsFirst: true })
    .limit(200);

  type Target =
    | { kind: "pool"; id: string; email: string }
    | { kind: "peer"; account: AccountRow };

  let pool: Target[] = ((poolRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    kind: "pool" as const,
    id: r["id"] as string,
    email: r["email"] as string,
  }));

  // Avoid repeating the same sender -> recipient pair within a week.
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: recent } = await admin
    .from("warmup_jobs")
    .select("to_email")
    .eq("sending_account_id", account.id)
    .gte("created_at", since)
    .limit(500);
  const used = new Set(
    ((recent ?? []) as Array<Record<string, unknown>>).map((r) =>
      String(r["to_email"] ?? "").toLowerCase(),
    ),
  );
  if (pool.length > 1) {
    const fresh = pool.filter((t) => t.kind === "pool" && !used.has(t.email.toLowerCase()));
    if (fresh.length > 0) pool = fresh;
  }

  // Suppressed addresses (hard bounce, complaint) are never warmed again.
  if (pool.length > 0) {
    const { suppressedSet } = await import("@/lib/suppression.server");
    const emails = pool.flatMap((t) => (t.kind === "pool" ? [t.email] : []));
    const blocked = await suppressedSet(account.workspace_id, emails);
    if (blocked.size > 0) {
      pool = pool.filter((t) => t.kind !== "pool" || !blocked.has(t.email.toLowerCase()));
    }
  }

  // Warmup emails go ONLY to the admin-managed seed list. No peer mailboxes,
  // no solo self-sends. With no active seed address, nothing is scheduled.
  void peers;
  if (pool.length === 0) {
    return { scheduled: 0, reason: "No active addresses in the admin warmup seed list." };
  }
  const recipients: Target[] = pool;

  const decision = await resolveDailyTarget(admin, account, settings);
  const target = decision.target;
  if (target <= 0) {
    return { scheduled: 0, reason: decision.reason };
  }

  const day = today();
  const { count: already } = await admin
    .from("warmup_jobs")
    .select("id", { count: "exact", head: true })
    .eq("sending_account_id", account.id)
    .eq("role", "initial")
    .gte("created_at", `${day}T00:00:00Z`);

  const done = already ?? 0;
  // `maxNew` bounds one run (used by the manual test action); the daily target
  // still bounds the day, so repeated runs never exceed the mailbox limit.
  const remaining = Math.min(target - done, options?.maxNew ?? Number.MAX_SAFE_INTEGER);
  if (remaining <= 0) {
    return { scheduled: 0, reason: `Daily warmup limit reached (${done} of ${target} queued today).` };
  }

  const times = slots(settings, remaining);
  let scheduled = 0;
  for (let i = 0; i < remaining; i += 1) {
    // Slot index continues after what is already queued today, so re-running
    // the scheduler tops the queue up instead of colliding on the same key.
    const slot = done + i;
    // Round-robin rotation keeps the pool evenly used across the day.
    const targetRow = recipients[(done + i) % recipients.length];
    if (!targetRow) continue;
    const toEmail =
      targetRow.kind === "pool" ? targetRow.email : targetRow.account.from_email;
    const peerAccountId = targetRow.kind === "peer" ? targetRow.account.id : null;
    const poolRecipientId = targetRow.kind === "pool" ? targetRow.id : null;
    const solo = peerAccountId === account.id;
    const { subject, body } = buildWarmupMessage(account.from_name);
    const threadKey = `wu_${account.id.slice(0, 8)}_${(peerAccountId ?? poolRecipientId ?? "pool").slice(0, 8)}_${Date.now()}_${slot}`;

    // Peer conversations are mailbox-to-mailbox; pool sends have no peer
    // mailbox row, so they are tracked on the job alone.
    let conversationId: string | null = null;
    if (peerAccountId) {
      const { data: conversation } = await admin
        .from("warmup_conversations")
        .insert({
          workspace_id: account.workspace_id,
          sender_account_id: account.id,
          recipient_account_id: peerAccountId,
          subject,
          thread_key: threadKey,
        })
        .select("id")
        .single();
      conversationId = (conversation?.id as string | undefined) ?? null;
    }

    const idempotencyKey = `${account.id}:${day}:${slot}:initial`;
    const token = warmupToken();
    const { error } = await admin.from("warmup_jobs").insert({
      warmup_token: token,
      workspace_id: account.workspace_id,
      sending_account_id: account.id,
      conversation_id: conversationId,
      recipient_account_id: peerAccountId,
      pool_recipient_id: poolRecipientId,
      role: "initial",
      from_email: account.from_email,
      to_email: toEmail,
      subject,
      body: withWarmupRef(body, token),
      scheduled_at: force ? new Date().toISOString() : times[i]!.toISOString(),
      idempotency_key: idempotencyKey,
      provider: account.provider,
    });
    if (error) {
      if (error.code === "23505") continue; // already scheduled for this slot
      throw new Error(error.message);
    }
    scheduled += 1;
    await logEvent(admin, {
      workspaceId: account.workspace_id,
      accountId: account.id,
      type: "scheduled",
      detail: solo
        ? "Queued solo warmup email (no peer mailbox in the network yet)"
        : `Queued warmup email to ${toEmail}`,
    });

  }

  if (scheduled > 0) {
    await bumpStats(
      admin,
      {
        workspaceId: account.workspace_id,
        accountId: account.id,
        target,
        stage: decision.stage,
        stageAction: decision.action,
        plannedTarget: target,
      },
      { scheduled },
    );
  }
  return { scheduled };
}


/* ------------------------------------------------------------------ worker */

export async function processJob(admin: Admin, job: Record<string, unknown>, summary: RunSummary) {
  const accountId = job["sending_account_id"] as string;
  const workspaceId = job["workspace_id"] as string;
  const jobId = job["id"] as string;
  const attempts = (job["attempts"] as number) ?? 1;
  const maxAttempts = (job["max_attempts"] as number) ?? 3;

  const { data: account } = await admin
    .from("sending_accounts")
    .select("id, workspace_id, provider, provider_id, connection_method, from_name, from_email, reply_to, paused, customer_enabled, status, health_score, spf_status, dkim_status, dmarc_status")
    .eq("id", accountId)
    .maybeSingle();

  const fail = async (message: string, retryable: boolean) => {
    const canRetry = retryable && attempts < maxAttempts;
    await admin
      .from("warmup_jobs")
      .update({
        status: canRetry ? "queued" : "failed",
        locked_by: null,
        locked_at: null,
        error: message.slice(0, 500),
        next_attempt_at: canRetry
          ? new Date(Date.now() + 2 ** attempts * 60_000).toISOString()
          : null,
        processed_at: canRetry ? null : new Date().toISOString(),
      })
      .eq("id", jobId);
    await logEvent(admin, {
      workspaceId,
      accountId,
      jobId,
      type: "failed",
      detail: message.slice(0, 500),
    });
    if (canRetry) summary.retried += 1;
    else {
      summary.failed += 1;
      await bumpStats(admin, { workspaceId, accountId }, { failed: 1 });
    }
    // Surface the real reason on the mailbox instead of a silent zero.
    await admin
      .from("warmup_settings")
      .update({ last_run_reason: message.slice(0, 500), last_run_at: new Date().toISOString() })
      .eq("sending_account_id", accountId);
  };

  if (!account) return fail("Mailbox no longer exists", false);

  // A job queued before the plan changed must still not send. The entitlement is
  // re-resolved here, at the last point before the message leaves.
  const { canUseWarmup } = await import("@/lib/billing/gates.server");
  const planGate = await canUseWarmup(workspaceId);
  if (!planGate.allowed) {
    const reason = planGate.reason ?? "Warmup is not included in this plan.";
    await haltWarmupForPlan(admin, { accountId, reason });
    await admin
      .from("warmup_jobs")
      .update({
        status: "cancelled",
        locked_by: null,
        locked_at: null,
        processed_at: new Date().toISOString(),
        error: reason.slice(0, 500),
      })
      .eq("id", jobId);
    return;
  }
  if (account.paused || !account.customer_enabled) {
    await admin
      .from("warmup_jobs")
      .update({ status: "cancelled", locked_by: null, locked_at: null, processed_at: new Date().toISOString(), error: "Mailbox paused" })
      .eq("id", jobId);
    return;
  }

  // Re-read settings at delivery time: queued jobs never bypass a pause or a
  // lowered manual limit. Reservations count attempts, not successful sends.
  const { data: liveSettings, error: settingsError } = await admin.from("warmup_settings")
    .select(WARMUP_SETTINGS_COLUMNS).eq("sending_account_id", accountId).maybeSingle();
  if (settingsError) throw new Error(settingsError.message);
  const cancel = async (reason: string) => {
    await admin.from("warmup_jobs").update({ status: "cancelled", locked_by: null, locked_at: null, error: reason, processed_at: new Date().toISOString() }).eq("id", jobId);
  };
  if (!liveSettings?.enabled || liveSettings.paused_by_system) return cancel("Warmup is paused or disabled.");
  if (!await applySafety(admin, account as AccountRow, liveSettings as SettingsRow, summary)) return cancel("Warmup safety protection is active.");
  const liveDecision = await resolveDailyTarget(admin, account as AccountRow, liveSettings as SettingsRow);
  if (liveDecision.target <= 0) return cancel(liveDecision.reason);
  const hourSince = new Date(Date.now() - 3600000).toISOString();
  const [{ data: limits }, { count: warmupAttempts }, { count: campaignSends }] = await Promise.all([
    admin.from("sending_accounts").select("hourly_limit").eq("id", accountId).maybeSingle(),
    admin.from("warmup_jobs").select("id", { count: "exact", head: true }).eq("sending_account_id", accountId).gte("send_reserved_at", hourSince),
    admin.from("campaign_messages").select("id", { count: "exact", head: true }).eq("sending_account_id", accountId).eq("status", "sent").gte("sent_at", hourSince),
  ]);
  if ((warmupAttempts ?? 0) + (campaignSends ?? 0) >= warmupHourlyLimit(limits?.hourly_limit)) {
    await admin.from("warmup_jobs").update({ status: "queued", locked_by: null, locked_at: null, next_attempt_at: new Date(Date.now() + 3600000).toISOString(), error: "Mailbox hourly capacity is temporarily unavailable." }).eq("id", jobId);
    return;
  }
  if (!withinWindow(liveSettings as SettingsRow, new Date()) || new Date().getUTCHours() < liveSettings.send_start_hour || new Date().getUTCHours() >= liveSettings.send_end_hour) {
    return cancel("Outside the warmup sending window.");
  }

  // Warmup exists to build reputation for the customer's OWN mailbox, so it must
  // leave through that mailbox's own SMTP server via the mailbox-smtp-relay —
  // exactly like campaign dispatch. Shared platform credentials are never used;
  // without a connected mailbox warmup stops with a visible reason instead.
  const { findCustomerMailbox, sendViaCustomerMailbox } = await import(
    "@/lib/customer-mailbox-send.server"
  );
  const customerMailbox = await findCustomerMailbox(
    admin,
    workspaceId,
    account.from_email as string,
  );
  if (!customerMailbox) {
    const { isMailboxPaused, PAUSED_MAILBOX_MESSAGE } = await import(
      "@/lib/mailbox-active.server"
    );
    const paused = await isMailboxPaused(admin, workspaceId, account.from_email as string);
    console.warn(
      `[warmup] refused: ${paused ? "mailbox paused" : "no connected customer mailbox"} for ${account.from_email} (workspace ${workspaceId}).`,
    );
    return fail(
      paused
        ? PAUSED_MAILBOX_MESSAGE
        : "Warmup is paused: this mailbox is not connected with its own email credentials yet. Reconnect it under Email Accounts to resume warmup.",
      false,
    );
  }

  // Atomic per-mailbox reservation, also protecting duplicate processing and
  // old-day queued jobs. Unknown/failed attempts retain their slots for safety.
  const { data: reserved, error: reserveError } = await admin.rpc("reserve_mailbox_warmup_send", { _job: jobId, _limit: liveDecision.target });
  if (reserveError) throw new Error(reserveError.message);
  if (!reserved) return cancel("Daily warmup limit reached or job already attempted.");

  // Warmup traffic is metered on its own daily allowance and never consumes
  // the customer's campaign email allowance.
  const { consumeUsage, releaseUsage, EntitlementError } = await import("@/lib/billing/usage.server");
  try {
    await consumeUsage(workspaceId, "warmup_daily", 1, "warmup_send");
  } catch (error) {
    if (error instanceof EntitlementError) return fail(error.message, false);
    throw error;
  }
  const refundWarmup = () => releaseUsage(workspaceId, "warmup_daily", 1, "warmup_send_failed");

  // The customer's own mailbox is the transport, so the recorded provider is
  // plain SMTP rather than any platform ESP.
  const provider = "smtp";
  const started = Date.now();
  let result: { ok: boolean; message: string; messageId?: string | undefined };
  try {
    const relayed = await sendViaCustomerMailbox(admin, customerMailbox, {
      to: job["to_email"] as string,
      subject: job["subject"] as string,
      text: job["body"] as string,
      fromName: account.from_name as string,
      headers: {
        "X-MunchReach-Warmup": "1",
        ...(account.reply_to ? { "Reply-To": account.reply_to as string } : {}),
        ...(job["warmup_token"] ? { "X-MunchReach-Warmup-Id": String(job["warmup_token"]) } : {}),
      },
    });
    result = {
      ok: relayed.ok,
      message: relayed.message,
      ...(relayed.messageId ? { messageId: relayed.messageId } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider request failed";
    await logCheck(admin, {
      workspaceId,
      accountId,
      kind: "warmup_send",
      ok: false,
      provider,
      message,
      durationMs: Date.now() - started,
      detail: { jobId, to: job["to_email"] },
    });
    await refundWarmup();
    return fail(`Outcome unknown: ${message}`, false);
  }

  const durationMs = Date.now() - started;
  await logCheck(admin, {
    workspaceId,
    accountId,
    kind: "warmup_send",
    ok: result.ok,
    provider,
    message: result.message,
    durationMs,
    detail: { jobId, to: job["to_email"], providerMessageId: result.messageId ?? null },
  });

  if (!result.ok) {
    await refundWarmup();
    // A provider attempt already owns a daily slot. Never retry a possibly
    // accepted SMTP hand-off under a new attempt.
    return fail(result.message, false);
  }

  await admin
    .from("warmup_jobs")
    .update({
      status: "sent",
      provider,
      provider_message_id: result.messageId ?? null,
      locked_by: null,
      locked_at: null,
      error: null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  // Internal delivery state: the mailbox accepted the hand-off. This is never
  // treated as an arrival — only a real confirmation moves it to `delivered`.
  // Written separately so a pending column migration can never fail a send.
  await admin
    .from("warmup_jobs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ delivery_state: "sent" } as any)
    .eq("id", jobId)
    .then(
      () => undefined,
      () => undefined,
    );


  // Classify the send as warmup up-front so provider events can never be
  // attributed to campaign statistics.
  const { registerOutboundMessage } = await import("@/lib/message-classification.server");
  await registerOutboundMessage(
    {
      providerMessageId: result.messageId ?? null,
      messageType: "warmup",
      provider,
      workspaceId,
      sendingAccountId: accountId,
      toEmail: job["to_email"] as string,
      refTable: "warmup_jobs",
      refId: jobId,
    },
    admin,
  );



  await logEvent(admin, {
    workspaceId,
    accountId,
    jobId,
    type: "sent",
    provider,
    providerMessageId: result.messageId ?? null,
    detail: `Accepted by ${provider} for ${job["to_email"]}`,
  });
  await bumpStats(admin, { workspaceId, accountId }, { sent: 1 });
  await touchPoolRecipient(admin, job["pool_recipient_id"] as string | null, "sent");
  // Warmup never touches sending_accounts.last_sent_at: that timestamp dates the
  // campaign daily counter, and refreshing it from warmup kept yesterday's
  // count alive forever (mailboxes stuck at 50/50 with no campaign sends).
  summary.sent += 1;

  if (
    job["role"] === "initial" &&
    job["recipient_account_id"] &&
    job["recipient_account_id"] !== job["sending_account_id"]
  ) {
    await maybeQueueReply(admin, job);
  }
}

/** Queues a real reply from the recipient mailbox back to the sender. */
async function maybeQueueReply(admin: Admin, job: Record<string, unknown>) {
  const recipientId = job["recipient_account_id"] as string;
  const { data: recipient } = await admin
    .from("sending_accounts")
    .select("id, workspace_id, from_name, from_email, provider, connection_method, paused, customer_enabled")
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient || recipient.paused || !recipient.customer_enabled) return;

  const { data: settings } = await admin
    .from("warmup_settings")
    .select("enabled, reply_rate")
    .eq("sending_account_id", recipientId)
    .maybeSingle();
  if (!settings?.enabled) return;
  if (Math.random() * 100 >= (settings.reply_rate ?? 0)) return;

  const { subject, body } = buildWarmupReply(recipient.from_name as string, job["subject"] as string);
  const delayMs = (20 + Math.floor(Math.random() * 70)) * 60_000;
  const replyToken = warmupToken();
  const { error } = await admin.from("warmup_jobs").insert({
    warmup_token: replyToken,
    workspace_id: recipient.workspace_id,
    sending_account_id: recipient.id,
    conversation_id: job["conversation_id"] ?? null,
    recipient_account_id: job["sending_account_id"],
    role: "reply",
    from_email: recipient.from_email,
    to_email: job["from_email"],
    subject,
    body: withWarmupRef(body, replyToken),
    scheduled_at: new Date(Date.now() + delayMs).toISOString(),
    idempotency_key: `reply:${job["id"]}`,
    provider: recipient.provider,
  });
  if (error && error.code !== "23505") throw new Error(error.message);

  if (job["conversation_id"]) {
    await admin
      .from("warmup_conversations")
      .update({ status: "replied", last_message_at: new Date().toISOString() })
      .eq("id", job["conversation_id"]);
  }
}

/* ----------------------------------------------------------- event ingress */

/**
 * Applies a provider delivery event to a warmup job. Returns false when the
 * event does not belong to warmup so the campaign pipeline can handle it.
 */
/**
 * Keeps the admin warmup pool activity counters in sync with real events.
 * A hard bounce disables the recipient so the engine stops mailing it.
 */
export async function touchPoolRecipient(
  admin: Admin,
  recipientId: string | null | undefined,
  event: "sent" | "bounced" | "replied" | "received",
  detail?: string | null,
): Promise<void> {
  if (!recipientId) return;
  const { data } = await admin
    .from("warmup_recipients")
    .select("sent_count, bounce_count, reply_count, received_count")
    .eq("id", recipientId)
    .maybeSingle();
  if (!data) return;
  const row = data as Record<string, number>;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> =
    event === "sent"
      ? { sent_count: (row["sent_count"] ?? 0) + 1, last_sent_at: now }
      : event === "bounced"
        ? {
            bounce_count: (row["bounce_count"] ?? 0) + 1,
            last_bounce_at: now,
            status: "bounced",
            enabled: false,
            last_error: detail?.slice(0, 300) ?? null,
          }
        : event === "replied"
          ? { reply_count: (row["reply_count"] ?? 0) + 1 }
          : { received_count: (row["received_count"] ?? 0) + 1, last_received_at: now };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await admin.from("warmup_recipients").update(patch as any).eq("id", recipientId);
}

export async function applyWarmupDeliveryEvent(args: {
  kind:
    | "sent"
    | "delivered"
    | "bounced"
    | "complained"
    | "deferred"
    | "delayed"
    | "failed"
    | "rejected"
    | "replied";
  providerMessageId: string | null;
  email: string | null;
  reason: string | null;
  externalId?: string | null;
  payload?: Record<string, unknown>;
  /** Already-identified job (e.g. a bounce report matched by warmup token). */
  jobId?: string | null;
}): Promise<boolean> {
  if (!args.providerMessageId && !args.jobId) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Providers report the same message id in different shapes (angle brackets,
  // URL-encoded, SendGrid's suffixed form). The stored id is matched against
  // every normalized candidate so a real delivery event is never dropped.
  const candidates = args.jobId ? [] : providerMessageIdCandidates(args.providerMessageId);
  if (!args.jobId && !candidates.length) return false;
  const jobQuery = supabaseAdmin
    .from("warmup_jobs")
    .select(
      "id, workspace_id, sending_account_id, status, delivery_state, delivered_at, conversation_id, pool_recipient_id, to_email",
    );
  const { data: jobs } = await (args.jobId
    ? jobQuery.eq("id", args.jobId).limit(1)
    : jobQuery.in("provider_message_id", candidates).limit(1));
  const job = ((jobs ?? []) as unknown as Array<Record<string, unknown>>)[0] as unknown as
    | (WarmupDeliveryJob & Record<string, unknown>)
    | undefined;
  if (!job) return false;

  const fresh = await logEvent(supabaseAdmin, {
    workspaceId: job.workspace_id,
    accountId: job.sending_account_id,
    jobId: job.id,
    type: args.kind === "failed" ? "rejected" : args.kind,
    detail: args.reason,
    providerMessageId: args.providerMessageId,
    externalId: args.externalId ?? null,
    payload: args.payload ?? {},
  });
  if (!fresh) return true; // duplicate webhook: recorded once, counted once

  const statusMap: Record<string, string | null> = {
    sent: "sent",
    delivered: "delivered",
    bounced: "failed",
    complained: null,
    deferred: null,
    delayed: null,
    failed: "failed",
    rejected: "failed",
    replied: "replied",
  };
  const nextStatus = statusMap[args.kind];
  const jobPatch: Record<string, unknown> = {};
  if (nextStatus) jobPatch["status"] = nextStatus;
  if (args.kind === "complained") {
    // A complaint is a confirmed spam placement from the receiving side.
    jobPatch["placement"] = "spam";
    jobPatch["placement_checked_at"] = new Date().toISOString();
  }
  if (args.kind === "bounced" || args.kind === "failed" || args.kind === "rejected") {
    jobPatch["placement"] = "not_delivered";
    jobPatch["placement_checked_at"] = new Date().toISOString();
  }

  // A provider delivery, a complaint (the recipient saw it) or a reply are all
  // real arrival confirmations and go through the one idempotent path, so the
  // delivered counter can never move twice for the same message.
  const arrival =
    args.kind === "delivered" || args.kind === "replied" || args.kind === "complained";
  let confirmed = false;
  if (arrival) {
    confirmed = await confirmWarmupDelivery(supabaseAdmin, {
      job,
      source: args.kind === "replied" ? "peer_reply" : "provider_event",
      extraPatch: jobPatch,
    });
    if (!confirmed && Object.keys(jobPatch).length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabaseAdmin.from("warmup_jobs").update(jobPatch as any).eq("id", job.id);
    }
  } else if (Object.keys(jobPatch).length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabaseAdmin.from("warmup_jobs").update(jobPatch as any).eq("id", job.id);
  }

  const normalized = normalizeWarmupDeliveryState(args.kind);
  if (normalized && normalized !== "delivered") {
    await setWarmupDeliveryState(supabaseAdmin, job, normalized);
  }

  const counter: Record<string, number> =
    args.kind === "sent"
      ? { sent: 1 }
      : args.kind === "delivered"
      ? {}
      : args.kind === "bounced"
        ? { bounced: 1 }
        : args.kind === "complained"
          ? { complained: 1, spam: 1 }
          : args.kind === "replied"
            ? { replied: 1 }
            : args.kind === "deferred" || args.kind === "delayed"
              ? { deferred: 1 }
              : args.kind === "failed" || args.kind === "rejected"
                ? { rejected: 1 }
                : {};
  if (Object.keys(counter).length) {
    await bumpStats(
      supabaseAdmin,
      { workspaceId: job.workspace_id, accountId: job.sending_account_id },
      counter,
    );
  }


  const poolId = (job as Record<string, unknown>)["pool_recipient_id"] as string | null;
  // A hard bounce or a complaint retires the address for the whole workspace,
  // through the same suppression list campaigns obey.
  if (args.kind === "bounced" || args.kind === "complained") {
    const address = args.email ?? ((job as Record<string, unknown>)["to_email"] as string | null);
    if (address) {
      const { suppressEmail } = await import("@/lib/suppression.server");
      await suppressEmail({
        workspaceId: job.workspace_id,
        email: address,
        reason: args.kind === "complained" ? "complained" : "bounced",
        source: "warmup",
        detail: args.reason ?? null,
      });
    }
  }
  if (args.kind === "bounced" || args.kind === "rejected") {
    await touchPoolRecipient(supabaseAdmin, poolId, "bounced", args.reason);
  } else if (args.kind === "complained") {
    await touchPoolRecipient(supabaseAdmin, poolId, "bounced", args.reason ?? "Spam complaint");
  } else if (args.kind === "replied") {
    await touchPoolRecipient(supabaseAdmin, poolId, "replied");
  } else if (args.kind === "delivered") {
    await touchPoolRecipient(supabaseAdmin, poolId, "received");
  }

  await recalculateHealth(supabaseAdmin, job.sending_account_id);
  return true;
}

/* --------------------------------------------------- inbound placement */

const TOKEN_RE = /MRW-([a-f0-9]{16,32})/i;

/** Pulls the warmup reference out of headers or the message body. */
function warmupTokenFrom(input: {
  headers?: unknown;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}): string | null {
  const headers = input.headers;
  if (headers && typeof headers === "object") {
    const entries: Array<[string, string]> = Array.isArray(headers)
      ? (headers as Array<Record<string, unknown>>).map((h) => [
          String(h["name"] ?? ""),
          String(h["value"] ?? ""),
        ])
      : Object.entries(headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]);
    for (const [name, value] of entries) {
      if (name.toLowerCase() === "x-munchreach-warmup-id" && value) {
        return value.trim().toLowerCase();
      }
    }
  }
  for (const field of [input.text, input.html, input.subject]) {
    const match = field ? TOKEN_RE.exec(field) : null;
    if (match?.[1]) return match[1].toLowerCase();
  }
  return null;
}

/**
 * Reads the receiving side's spam verdict. Providers expose this differently;
 * when no verdict is present we do not guess — placement stays `inbox` only
 * when the receiving system reported no spam signal at all.
 */
function spamVerdict(input: { headers?: unknown; payload?: Record<string, unknown> }): boolean | null {
  const raw = input.payload ?? {};
  const source = (raw["data"] && typeof raw["data"] === "object" ? raw["data"] : raw) as Record<string, unknown>;
  const flags = [
    source["spam"],
    source["is_spam"],
    source["spam_flag"],
    source["spamVerdict"],
    (source["verdicts"] as Record<string, unknown> | undefined)?.["spam"],
  ];
  for (const flag of flags) {
    if (typeof flag === "boolean") return flag;
    if (typeof flag === "string") {
      const value = flag.toLowerCase();
      if (["true", "yes", "fail", "failed", "spam"].includes(value)) return true;
      if (["false", "no", "pass", "passed", "ham"].includes(value)) return false;
    }
    if (flag && typeof flag === "object") {
      const status = String((flag as Record<string, unknown>)["status"] ?? "").toLowerCase();
      if (status) return status !== "pass";
    }
  }

  const headers = input.headers;
  if (headers && typeof headers === "object") {
    const entries: Array<[string, string]> = Array.isArray(headers)
      ? (headers as Array<Record<string, unknown>>).map((h) => [
          String(h["name"] ?? ""),
          String(h["value"] ?? ""),
        ])
      : Object.entries(headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]);
    for (const [name, value] of entries) {
      const key = name.toLowerCase();
      if (key === "x-spam-flag") return /yes|true/i.test(value);
      if (key === "x-spam-status") return /^yes/i.test(value.trim());
      if (key === "x-spam-score") {
        const score = Number.parseFloat(value);
        if (Number.isFinite(score)) return score >= 5;
      }
    }
  }
  return null;
}

/**
 * Claims an inbound message that belongs to the warmup network and records
 * where it landed. Returns false for ordinary customer mail so the normal
 * inbox pipeline handles it.
 */
export async function applyWarmupInbound(input: {
  from: string | null;
  to: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  headers?: unknown;
  messageId?: string | null;
  payload?: Record<string, unknown>;
  /**
   * Folder the message was read from, when the reader knows it. An IMAP read of
   * the main inbox is itself the placement verdict; webhooks leave this unset.
   */
  folder?: "inbox" | "spam" | null;
  /** Where the confirmation came from, for auditing. */
  source?: "inbound_arrival" | "imap_arrival";
  /** Provider time of arrival, when reported. */
  receivedAt?: string | null;
  /** Address of the mailbox we actually read the message from (IMAP). */
  receivingMailbox?: string | null;
  /** Set when the message is a delivery-failure report (DSN). */
  bounceReport?: { kind: "bounced" | "delayed" | "failed"; reason: string | null; status?: string | null } | null;
}): Promise<boolean> {
  const token = warmupTokenFrom(input);
  if (!token) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: job } = await supabaseAdmin
    .from("warmup_jobs")
    .select(
      "id, workspace_id, sending_account_id, recipient_account_id, status, placement, role, conversation_id, pool_recipient_id, to_email, from_email",
    )
    .eq("warmup_token", token)
    .maybeSingle();
  if (!job) return false;

  // The token alone is not enough: the message must have been read from the
  // mailbox it was addressed to. A forwarded or copied warmup email seen in
  // some other mailbox is claimed (kept out of the inbox) but never confirms.
  // A bounce report quoting the warmup email, read in the SENDING mailbox, is
  // the bounce for that exact job (previously swallowed here as "foreign",
  // which is why warmup bounces never reached the counts or health).
  const reader = (input.receivingMailbox ?? "").trim().toLowerCase();
  const intended = String((job as Record<string, unknown>)["to_email"] ?? "").trim().toLowerCase();
  const route = routeWarmupMessage({
    isBounceReport: !!input.bounceReport,
    reader,
    sender: String((job as Record<string, unknown>)["from_email"] ?? ""),
    intended,
  });
  if (route === "bounce" && input.bounceReport) {
    const kind = warmupKindForReport(input.bounceReport.kind);
    await applyWarmupDeliveryEvent({
      kind,
      jobId: job.id as string,
      providerMessageId: null,
      email: intended || null,
      reason: input.bounceReport.reason,
      externalId: warmupReportExternalId(job.id as string, kind),
      payload: { source: "imap_bounce_report", status: input.bounceReport.status ?? null },
    });
    return true;
  }
  if (route === "foreign") {
    console.warn(`[warmup] token ${token} read at ${reader}, addressed to ${intended}; not confirming`);
    return true;
  }

  const spam = spamVerdict(input);
  const placement =
    spam === true || input.folder === "spam"
      ? "spam"
      : spam === false || input.folder === "inbox"
        ? "inbox"
        : "received_unknown";
  const now = input.receivedAt ?? new Date().toISOString();
  const alreadyClassified = !!job.placement && job.placement !== "pending";

  // Arrival is the strongest signal warmup has: the receiving side handed the
  // message back to us. It goes through the shared idempotent confirmation, so
  // the same message read twice (webhook retry, second IMAP pass) is counted
  // exactly once.
  const firstConfirmation = await confirmWarmupDelivery(supabaseAdmin, {
    job: job as unknown as WarmupDeliveryJob,
    source: input.source ?? "inbound_arrival",
    occurredAt: now,
    extraPatch: alreadyClassified
      ? { received_at: now }
      : { placement, placement_checked_at: now, received_at: now },
  });

  const fresh = await logEvent(supabaseAdmin, {
    workspaceId: job.workspace_id,
    accountId: job.sending_account_id,
    jobId: job.id,
    type: placement === "spam" ? "spam_placement" : "inbox_placement",
    detail:
      placement === "inbox"
        ? `Landed in the main inbox of ${input.to ?? "the receiving mailbox"}.`
        : placement === "spam"
          ? `Filtered to spam at ${input.to ?? "the receiving mailbox"}.`
          : `Received by ${input.to ?? "the receiving mailbox"} — folder not reported.`,
    externalId: `warmup:placement:${token}`,
    payload: { placement, to: input.to, from: input.from, source: input.source ?? "inbound_arrival" },
  });

  if (fresh && !alreadyClassified) {
    const counter: Record<string, number> =
      placement === "spam" ? { spam: 1 } : placement === "inbox" ? { inbox: 1 } : {};
    if (Object.keys(counter).length) {
      await bumpStats(
        supabaseAdmin,
        { workspaceId: job.workspace_id, accountId: job.sending_account_id, day: now.slice(0, 10) },
        counter,
      );
    }
  }
  if (firstConfirmation) {
    await touchPoolRecipient(
      supabaseAdmin,
      (job as Record<string, unknown>)["pool_recipient_id"] as string | null,
      "received",
    );
  }
  if (fresh || firstConfirmation) {
    await recalculateHealth(supabaseAdmin, job.sending_account_id);
  }
  return true;
}

/**
 * Arrival is confirmed by a round trip: the receiving mailbox hands the message
 * back through our own inbound feed. That is only possible when the recipient's
 * domain routes its receiving to us. Mail to any other mailbox (a peer on an
 * outside domain, a free-provider seed address) is very likely delivered, we
 * simply cannot observe it — so it must never be scored as a miss.
 */
async function observableRecipientDomains(admin: Admin): Promise<Set<string>> {
  const { data } = await admin
    .from("sending_domains")
    .select("domain, mx_status")
    .eq("mx_status", "verified");
  return new Set(
    ((data ?? []) as Array<{ domain: string | null }>)
      .map((row) => (row.domain ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Addresses we read ourselves: any mailbox connected with its own incoming-mail
 * server is polled on every cycle, so warmup mail sent to it *is* observable
 * even when its domain does not route receiving to us.
 */
async function observableRecipientAddresses(admin: Admin): Promise<Set<string>> {
  const { data } = await admin
    .from("mailboxes")
    .select("email_address, imap_host, status, is_active")
    .eq("status", "connected")
    .not("imap_host", "is", null)
    .limit(5000);
  return new Set(
    ((data ?? []) as Array<{ email_address: string | null; is_active: boolean | null }>)
      .filter((row) => row.is_active !== false)
      .map((row) => (row.email_address ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
}

function recipientDomain(email: string | null | undefined): string {
  const at = (email ?? "").trim().toLowerCase().lastIndexOf("@");
  return at === -1 ? "" : (email ?? "").trim().toLowerCase().slice(at + 1);
}

/**
 * Marks sent warmup mail that never showed up on the receiving side. Runs on
 * every cycle so the dashboard never reports a delivery that did not happen.
 */
export async function sweepPlacement(admin: Admin): Promise<number> {
  const cutoff = new Date(Date.now() - PLACEMENT_WINDOW_MS).toISOString();
  const { data: stale } = await admin
    .from("warmup_jobs")
    .select("id, workspace_id, sending_account_id, to_email")
    .eq("placement", "pending")
    .in("status", ["sent", "delivered"])
    .not("processed_at", "is", null)
    .lt("processed_at", cutoff)
    .limit(200);

  if (!stale?.length) return 0;
  const [observable, observableAddresses] = await Promise.all([
    observableRecipientDomains(admin),
    observableRecipientAddresses(admin),
  ]);

  for (const job of stale as Array<Record<string, string>>) {
    const address = (job["to_email"] ?? "").trim().toLowerCase();
    const measurable =
      observable.has(recipientDomain(job["to_email"])) || observableAddresses.has(address);
    if (!measurable) {
      // Delivered as far as the provider is concerned; no inbound feed exists on
      // the receiving side, so there is nothing to confirm and nothing to score.
      await admin
        .from("warmup_jobs")
        .update({ placement: "unobservable", placement_checked_at: new Date().toISOString() })
        .eq("id", job["id"]!);
      continue;
    }
    await admin
      .from("warmup_jobs")
      .update({ placement: "not_received", placement_checked_at: new Date().toISOString() })
      .eq("id", job["id"]!);
    const fresh = await logEvent(admin, {
      workspaceId: job["workspace_id"]!,
      accountId: job["sending_account_id"]!,
      jobId: job["id"]!,
      type: "not_received",
      detail: "No arrival confirmed on the receiving mailbox within 45 minutes.",
      externalId: `warmup:notreceived:${job["id"]}`,
    });
    if (fresh) {
      await bumpStats(
        admin,
        { workspaceId: job["workspace_id"]!, accountId: job["sending_account_id"]! },
        { not_received: 1 },
      );
    }
  }
  return stale.length;
}

/* ------------------------------------------------------------ health score */

export async function recalculateHealth(
  admin: Admin,
  accountId: string,
): Promise<{ score: number; status: WarmupHealthStatus } | null> {
  const { data: account } = await admin
    .from("sending_accounts")
    .select("id, workspace_id, spf_status, dkim_status, dmarc_status, status, last_error")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return null;

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data: stats } = await admin
    .from("warmup_daily_stats")
    .select("day, sent, delivered, bounced, complained, failed, replied, inbox, spam, deferred, rejected, not_received")
    .eq("sending_account_id", accountId)
    .gte("day", since);

  const totals = (stats ?? []).reduce(
    (acc: Record<string, number>, row: Record<string, number>) => {
      for (const key of [
        "sent",
        "delivered",
        "bounced",
        "complained",
        "failed",
        "replied",
        "inbox",
        "spam",
        "deferred",
        "rejected",
        "not_received",
      ]) {
        acc[key] = (acc[key] ?? 0) + (row[key] ?? 0);
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  const sent = totals["sent"] ?? 0;
  const factors: WarmupHealthFactor[] = [];
  let score = 100;

  if (sent === 0) {
    factors.push({ label: "No warmup activity yet", impact: 0, detail: "Waiting for the first send." });
  } else {
    const bounceRate = ((totals["bounced"] ?? 0) / sent) * 100;
    const failRate = ((totals["failed"] ?? 0) / sent) * 100;
    const complaintRate = ((totals["complained"] ?? 0) / sent) * 100;
    const deliveredRate = ((totals["delivered"] ?? 0) / sent) * 100;
    const replyRate = ((totals["replied"] ?? 0) / sent) * 100;

    // Any confirmed bounce costs at least one point (no rounding to zero).
    const bouncePenalty = bouncePenaltyFor(totals["bounced"] ?? 0, sent);
    if (bouncePenalty) {
      score -= bouncePenalty;
      factors.push({
        label: "Bounce rate",
        impact: -bouncePenalty,
        detail: `${bounceRate.toFixed(1)}% of warmup sends bounced in the last 14 days.`,
      });
    } else {
      factors.push({ label: "No bounces recorded", impact: 0, detail: "Clean bounce record." });
    }

    const complaintPenalty = Math.min(30, Math.round(complaintRate * 10));
    if (complaintPenalty) {
      score -= complaintPenalty;
      factors.push({
        label: "Spam complaints",
        impact: -complaintPenalty,
        detail: `${complaintRate.toFixed(2)}% of sends were reported as spam.`,
      });
    }

    const failPenalty = Math.min(25, Math.round(failRate * 2));
    if (failPenalty) {
      score -= failPenalty;
      factors.push({
        label: "Provider send failures",
        impact: -failPenalty,
        detail: `${failRate.toFixed(1)}% of attempts were rejected by the provider.`,
      });
    }

    // Deferrals and provider rejections are real (weaker) negative signals.
    const softPenalty = softSignalPenalty(totals["deferred"] ?? 0, totals["rejected"] ?? 0, sent);
    if (softPenalty) {
      score -= softPenalty;
      factors.push({
        label: "Deferrals and rejections",
        impact: -softPenalty,
        detail: `${(totals["deferred"] ?? 0) + (totals["rejected"] ?? 0)} warmup sends were deferred or rejected in the last 14 days.`,
      });
    }

    const placed = (totals["inbox"] ?? 0) + (totals["spam"] ?? 0);
    if (placed > 0) {
      const spamRate = ((totals["spam"] ?? 0) / placed) * 100;
      const inboxRate = ((totals["inbox"] ?? 0) / placed) * 100;
      const spamPenalty = Math.min(35, Math.round(spamRate * 0.7));
      if (spamPenalty) {
        score -= spamPenalty;
        factors.push({
          label: "Spam folder placement",
          impact: -spamPenalty,
          detail: `${spamRate.toFixed(1)}% of confirmed warmup arrivals were filtered to spam.`,
        });
      } else {
        factors.push({
          label: "Inbox placement",
          impact: 0,
          detail: `${inboxRate.toFixed(1)}% of confirmed warmup arrivals landed in the main inbox.`,
        });
      }
    }

    if (totals["not_received"]) {
      const missRate = ((totals["not_received"] ?? 0) / sent) * 100;
      const missPenalty = Math.min(20, Math.round(missRate * 0.4));
      if (missPenalty) {
        score -= missPenalty;
        factors.push({
          label: "Unconfirmed arrivals",
          impact: -missPenalty,
          detail: `${missRate.toFixed(1)}% of sends were never confirmed on the receiving mailbox.`,
        });
      }
    }

    if (totals["deferred"]) {
      factors.push({
        label: "Delayed by receiving servers",
        impact: 0,
        detail: `${totals["deferred"]} warmup message(s) were delayed before delivery.`,
      });
    }

    if (totals["rejected"]) {
      const rejectPenalty = Math.min(20, Math.round(((totals["rejected"] ?? 0) / sent) * 100 * 0.5));
      if (rejectPenalty) {
        score -= rejectPenalty;
        factors.push({
          label: "Rejected by receiving servers",
          impact: -rejectPenalty,
          detail: `${totals["rejected"]} warmup message(s) were rejected on delivery.`,
        });
      }
    }

    if (totals["delivered"]) {
      factors.push({
        label: "Delivery confirmations",
        impact: 0,
        detail: `${deliveredRate.toFixed(1)}% of sends confirmed delivered by the provider.`,
      });
    }
    if (totals["replied"]) {
      factors.push({
        label: "Reply activity",
        impact: 0,
        detail: `${replyRate.toFixed(1)}% of warmup threads received a reply.`,
      });
    }
  }

  const authFailures = ["spf", "dkim", "dmarc"].filter(
    (k) => (account[`${k}_status`] as string) === "fail" || (account[`${k}_status`] as string) === "failed",
  );
  if (authFailures.length) {
    const penalty = authFailures.length * 12;
    score -= penalty;
    factors.push({
      label: "Authentication",
      impact: -penalty,
      detail: `${authFailures.join(", ").toUpperCase()} is failing for this domain.`,
    });
  } else if (["spf", "dkim", "dmarc"].every((k) => (account[`${k}_status`] as string) === "pass")) {
    factors.push({ label: "Authentication verified", impact: 0, detail: "SPF, DKIM and DMARC pass." });
  }

  if (account.status === "failed") {
    score -= 20;
    factors.push({
      label: "Connection failing",
      impact: -20,
      detail: account.last_error ?? "The last provider connection test failed.",
    });
  }

  score = Math.max(0, Math.min(100, score));
  const status: WarmupHealthStatus = statusFromScore(score);
  const recommendation =
    sent === 0
      ? "Warmup has not sent yet. Volume starts as soon as the first scheduled slot is due."
      : status === "healthy"
        ? "Delivery looks healthy — continue the current ramp."
        : status === "good"
          ? "Hold the current volume for another two days before increasing."
          : status === "warning"
            ? "Volume has been reduced automatically. Fix the issues above before ramping again."
            : "Warmup is paused automatically. Resolve the failures above, then resume.";

  // Append a history row only when the snapshot changed; identical
  // recalculations (after every warmup send) previously grew the table.
  const { data: latestRows } = await admin
    .from("warmup_health")
    .select("score, status, factors, recommendation")
    .eq("sending_account_id", accountId)
    .order("computed_at", { ascending: false })
    .limit(1);
  if (!isSameHealthSnapshot(latestRows?.[0] ?? null, { score, status, factors, recommendation })) {
    await admin.from("warmup_health").insert({
      workspace_id: account.workspace_id,
      sending_account_id: accountId,
      score,
      status,
      factors,
      recommendation,
    });
  }
  await admin.from("sending_accounts").update({ health_score: score }).eq("id", accountId);
  await admin
    .from("warmup_daily_stats")
    .update({ health_score: score })
    .eq("sending_account_id", accountId)
    .eq("day", today());

  return { score, status };
}

/* ------------------------------------------------------------ safety guard */

async function applySafety(
  admin: Admin,
  account: AccountRow,
  settings: SettingsRow,
  summary: RunSummary,
): Promise<boolean> {
  if (!settings.auto_pause) return true;

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { data: stats } = await admin
    .from("warmup_daily_stats")
    .select("sent, bounced, failed")
    .eq("sending_account_id", account.id)
    .gte("day", since);

  // Shared with the customer Resume action so both evaluate identical
  // conditions — a mailbox the customer may resume can never be re-paused by
  // the very next runner pass.
  const violation = evaluateSafetyViolation({
    stats: (stats ?? []) as SafetyStatRow[],
    maxBounceRate: settings.max_bounce_rate,
    minHealthScore: settings.min_health_score,
    healthScore: account.health_score ?? null,
    accountStatus: account.status,
    authStatuses: [account.spf_status, account.dkim_status, account.dmarc_status],
  });
  const reason: string | null = violation.active ? violation.reason : null;


  if (!reason) return true;

  await admin
    .from("warmup_settings")
    .update({
      paused_by_system: true,
      pause_reason: reason,
      paused_at: new Date().toISOString(),
    })
    .eq("id", settings.id);
  await admin
    .from("sending_accounts")
    .update({ warmup_status: "paused" })
    .eq("id", account.id);
  await admin
    .from("warmup_jobs")
    .update({ status: "cancelled", error: reason })
    .eq("sending_account_id", account.id)
    .eq("status", "queued");
  await logEvent(admin, {
    workspaceId: account.workspace_id,
    accountId: account.id,
    type: "failed",
    detail: `Warmup paused automatically: ${reason}`,
  });
  summary.paused.push(`${account.from_email}: ${reason}`);
  return false;
}

/* -------------------------------------------------------------- run entry */

/**
 * Warmup entitlement for a set of workspaces, resolved once per run.
 *
 * A workspace whose plan does not include warmup is stopped safely: its
 * settings stay on record, the mailbox is marked paused-by-system with the
 * reason, and any queued job is cancelled so nothing can still go out. Nothing
 * is deleted, so re-enabling after an upgrade restores the mailbox as it was.
 */
async function warmupEntitlementMap(
  admin: Admin,
  workspaceIds: string[],
): Promise<Map<string, { allowed: boolean; reason: string | null }>> {
  const { canUseWarmup } = await import("@/lib/billing/gates.server");
  const map = new Map<string, { allowed: boolean; reason: string | null }>();
  for (const workspaceId of new Set(workspaceIds)) {
    try {
      const gate = await canUseWarmup(workspaceId);
      map.set(workspaceId, { allowed: gate.allowed, reason: gate.reason });
    } catch (error) {
      // An entitlement lookup failure must never hand out warmup sending.
      map.set(workspaceId, {
        allowed: false,
        reason: error instanceof Error ? error.message : "Plan could not be verified.",
      });
    }
  }
  return map;
}

/** Stops warmup for one mailbox without discarding its configuration. */
async function haltWarmupForPlan(
  admin: Admin,
  args: { settingsId?: string | null; accountId: string; reason: string },
) {
  const now = new Date().toISOString();
  const patch = {
    paused_by_system: true,
    pause_reason: "plan_entitlement",
    last_run_reason: args.reason.slice(0, 500),
    last_run_at: now,
  };
  if (args.settingsId) {
    await admin.from("warmup_settings").update(patch).eq("id", args.settingsId);
  } else {
    await admin.from("warmup_settings").update(patch).eq("sending_account_id", args.accountId);
  }
  // Anything already queued must not leave after the plan check.
  await admin
    .from("warmup_jobs")
    .update({
      status: "cancelled",
      locked_by: null,
      locked_at: null,
      processed_at: now,
      error: args.reason.slice(0, 500),
    })
    .eq("sending_account_id", args.accountId)
    .in("status", ["queued", "processing"]);
}

/**
 * Step 1 of a warmup run (shared by legacy and queue mode): turns each enabled
 * mailbox's schedule/ramp/daily target into due `warmup_jobs`. Legacy passes no
 * options, so its behaviour is unchanged. Queue mode passes `shouldStop` (time
 * budget) and `order` (rotation, so a budget stop never starves later mailboxes).
 */
export async function scheduleWarmupDue(
  admin: Admin,
  summary: RunSummary,
  opts: { shouldStop?: () => boolean; order?: <T>(rows: T[]) => T[] } = {},
): Promise<SettingsRow[]> {
  const order = opts.order ?? (<T,>(rows: T[]) => rows);
  const { data: settingsRows } = await admin
    .from("warmup_settings")
    .select(
      WARMUP_SETTINGS_COLUMNS,
    )
    .eq("enabled", true)
    .eq("paused_by_system", false)
    .limit(MAX_ACCOUNTS_PER_RUN);

  const settings = (settingsRows ?? []) as SettingsRow[];
  if (settings.length) {
    const ids = settings.map((s) => s.sending_account_id);
    const { data: accountRows } = await admin
      .from("sending_accounts")
      .select(
        "id, workspace_id, from_name, from_email, provider, provider_id, connection_method, status, paused, customer_enabled, health_score, spf_status, dkim_status, dmarc_status",
      )
      .in("id", ids);
    const accounts = (accountRows ?? []) as AccountRow[];
    const byId = new Map(accounts.map((a) => [a.id, a]));

    // One entitlement read per workspace, before any scheduling. A workspace
    // without the warmup feature is skipped and stopped safely; every other
    // workspace in the run continues normally.
    const entitlements = await warmupEntitlementMap(
      admin,
      accounts.map((a) => a.workspace_id),
    );

    const eligible = accounts.filter(
      (a) =>
        !a.paused &&
        a.customer_enabled &&
        a.status !== "disabled" &&
        entitlements.get(a.workspace_id)?.allowed !== false,
    );

    for (const setting of order(settings)) {
    if (opts.shouldStop?.()) break;
      const account = byId.get(setting.sending_account_id);
      if (!account) continue;
      const gate = entitlements.get(account.workspace_id);
      if (gate && !gate.allowed) {
        const reason = gate.reason ?? "Warmup is not included in this plan.";
        await haltWarmupForPlan(admin, {
          settingsId: setting.id,
          accountId: account.id,
          reason,
        });
        summary.skippedPlan = (summary.skippedPlan ?? 0) + 1;
        continue;
      }
      if (account.paused || !account.customer_enabled) {
        await recordRunReason(admin, setting.id, "Mailbox sending is paused or switched off.");
        continue;
      }
      const safe = await applySafety(admin, account, setting, summary);
      if (!safe) continue;
      const peers = eligible.filter((p) => p.id !== account.id);
      try {
        const res = await scheduleAccount(admin, account, setting, peers);
        summary.scheduled += res.scheduled;
        await recordRunReason(
          admin,
          setting.id,
          res.scheduled > 0 ? null : (res.reason ?? null),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed";
        await recordRunReason(admin, setting.id, message);
        summary.errors.push(`schedule ${account.from_email}: ${message}`);
      }
    }

  }
  return settings;
}

export async function runWarmupCycle(admin: Admin, options?: { limit?: number }): Promise<RunSummary> {
  const summary = emptySummary();
  const owner = `worker_${crypto.randomUUID().slice(0, 8)}`;
  const lease = await acquireLease(admin, owner);

  if (lease.paused) {
    return { ...summary, ok: false, skipped: `Runner paused: ${lease.pauseReason ?? "manual"}` };
  }
  if (!lease.acquired) {
    return { ...summary, ok: false, skipped: "Another warmup run is in progress" };
  }

  try {
    // 1. Scheduler ---------------------------------------------------------
    const settings = await scheduleWarmupDue(admin, summary);

    // 2. Worker ------------------------------------------------------------
    const limit = Math.min(options?.limit ?? MAX_JOBS_PER_RUN, MAX_JOBS_PER_RUN);
    const { data: claimed, error: claimError } = await admin.rpc("claim_warmup_jobs", {
      _worker: owner,
      _limit: limit,
    });
    if (claimError) summary.errors.push(`claim: ${claimError.message}`);
    const jobs = (claimed ?? []) as Array<Record<string, unknown>>;
    summary.claimed = jobs.length;

    for (const job of jobs) {
      try {
        await processJob(admin, job, summary);
      } catch (error) {
        summary.errors.push(error instanceof Error ? error.message : "job failed");
      }
    }

    // 3. Placement sweep ---------------------------------------------------
    try {
      await sweepPlacement(admin);
    } catch (error) {
      summary.errors.push(
        `placement sweep: ${error instanceof Error ? error.message : "failed"}`,
      );
    }

    // 4. Health ------------------------------------------------------------
    // Health is refreshed for every mailbox with warmup enabled, not only the
    // ones that sent this cycle, so the dashboard score keeps moving as
    // delivery, placement and reply signals land after the send.
    const touched = new Set<string>([
      ...jobs.map((j) => j["sending_account_id"] as string),
      ...settings.map((s) => s.sending_account_id),
    ]);
    for (const accountId of touched) {
      try {
        await recalculateHealth(admin, accountId);
        summary.healthUpdated += 1;
      } catch {
        /* health recalculation is best-effort */
      }
    }

    return summary;
  } finally {
    await releaseLease(admin, summary);
  }
}

/* --------------------------------------------------- single mailbox run */

export type AccountRunResult = RunSummary & { accountId: string; reason: string | null };

/**
 * Runs the exact production warmup pipeline for one mailbox: schedule (bypassing
 * the time-of-day window so the test is immediate), send through the provider
 * abstraction, then recalculate health. Daily limits and plan allowances still
 * apply, so repeated runs never exceed the mailbox's warmup target.
 */
export async function runWarmupForAccount(
  admin: Admin,
  accountId: string,
  options?: { max?: number },
): Promise<AccountRunResult> {
  const summary = emptySummary();
  const owner = `manual_${crypto.randomUUID().slice(0, 8)}`;
  let reason: string | null = null;

  const { data: account } = await admin
    .from("sending_accounts")
    .select(
      "id, workspace_id, from_name, from_email, provider, provider_id, connection_method, status, paused, customer_enabled, health_score, spf_status, dkim_status, dmarc_status",
    )
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return { ...summary, ok: false, accountId, reason: "Mailbox not found." };

  const { data: setting } = await admin
    .from("warmup_settings")
    .select(
      WARMUP_SETTINGS_COLUMNS,
    )
    .eq("sending_account_id", accountId)
    .maybeSingle();
  if (!setting || !setting.enabled) {
    return { ...summary, ok: false, accountId, reason: "Warmup is switched off for this mailbox." };
  }

  {
    const { canUseWarmup } = await import("@/lib/billing/gates.server");
    const gate = await canUseWarmup(account.workspace_id as string);
    if (!gate.allowed) {
      const reason = gate.reason ?? "Warmup is not included in this plan.";
      await haltWarmupForPlan(admin, { settingsId: setting.id as string, accountId, reason });
      return { ...summary, ok: false, accountId, reason };
    }
  }
  if (setting.paused_by_system) {
    return { ...summary, ok: false, accountId, reason: "Warmup is paused by the safety system." };
  }

  const { data: peerRows } = await admin
    .from("sending_accounts")
    .select(
      "id, workspace_id, from_name, from_email, provider, provider_id, connection_method, status, paused, customer_enabled, health_score, spf_status, dkim_status, dmarc_status",
    )
    .neq("id", accountId)
    .eq("paused", false)
    .eq("customer_enabled", true);

  const peerIds = ((peerRows ?? []) as AccountRow[]).map((p) => p.id);
  let peers: AccountRow[] = [];
  if (peerIds.length) {
    const { data: peerSettings } = await admin
      .from("warmup_settings")
      .select("sending_account_id, enabled, paused_by_system")
      .in("sending_account_id", peerIds);
    const enabled = new Set(
      ((peerSettings ?? []) as Array<Record<string, unknown>>)
        .filter((r) => r["enabled"] && !r["paused_by_system"])
        .map((r) => r["sending_account_id"] as string),
    );
    peers = ((peerRows ?? []) as AccountRow[]).filter(
      (p) => enabled.has(p.id) && p.status !== "disabled",
    );
  }

  try {
    const res = await scheduleAccount(
      admin,
      account as AccountRow,
      setting as SettingsRow,
      peers,
      { force: true, maxNew: options?.max ?? 1 },
    );
    summary.scheduled = res.scheduled;
    reason = res.reason ?? null;
  } catch (error) {
    reason = error instanceof Error ? error.message : "Scheduling failed";
    summary.errors.push(reason);
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_warmup_jobs_for_account", {
    _worker: owner,
    _limit: Math.min(options?.max ?? 5, 20),
    _account: accountId,
  });
  if (claimError) summary.errors.push(`claim: ${claimError.message}`);
  const jobs = (claimed ?? []) as Array<Record<string, unknown>>;
  summary.claimed = jobs.length;

  for (const job of jobs) {
    try {
      await processJob(admin, job, summary);
    } catch (error) {
      summary.errors.push(error instanceof Error ? error.message : "job failed");
    }
  }

  if (summary.sent === 0 && !reason && summary.errors.length === 0 && jobs.length === 0) {
    reason = "No warmup message was due to send.";
  }

  try {
    await recalculateHealth(admin, accountId);
    summary.healthUpdated = 1;
  } catch {
    /* best effort */
  }

  const finalReason = summary.sent > 0 ? null : (summary.errors[0] ?? reason);
  await recordRunReason(admin, setting.id as string, finalReason);
  summary.ok = summary.sent > 0 || summary.errors.length === 0;
  return { ...summary, accountId, reason: finalReason };
}
