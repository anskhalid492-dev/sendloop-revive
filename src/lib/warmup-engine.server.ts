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
import { buildWarmupMessage, buildWarmupReply } from "@/lib/warmup-content.server";
import { statusFromScore, type WarmupHealthFactor, type WarmupHealthStatus } from "@/lib/warmup-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Admin = any;

const RUNNER_ID = "warmup";
const LEASE_MS = 5 * 60_000;
const MAX_JOBS_PER_RUN = 40;
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
};

function emptySummary(): RunSummary {
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
async function acquireLease(admin: Admin, owner: string) {
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

async function releaseLease(admin: Admin, result: RunSummary) {
  await admin
    .from("warmup_runner_state")
    .update({ lease_until: null, lease_owner: null, last_result: result })
    .eq("id", RUNNER_ID);
}

/* --------------------------------------------------------------- accounting */

async function bumpStats(
  admin: Admin,
  args: { workspaceId: string; accountId: string; day?: string; target?: number },
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
    });
    return;
  }

  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(patch)) {
    next[key] = (existing[key] ?? 0) + (value ?? 0);
  }
  if (args.target !== undefined) next["target"] = args.target;
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
  if (error) throw new Error(error.message);
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

type SettingsRow = {
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
};

/** Day 1 = start volume, then +increase per elapsed day, capped at max. */
export function dailyTarget(settings: SettingsRow, startedAt: string | null, healthScore: number | null): number {
  const start = startedAt ? new Date(startedAt) : new Date();
  const days = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000));
  const cappedDays = Math.min(days, settings.ramp_days);
  let target = settings.start_volume + cappedDays * settings.daily_increase;
  target = Math.min(target, settings.max_volume);

  // Safety: a degraded mailbox holds or reduces volume instead of ramping.
  if (healthScore !== null) {
    if (healthScore < 50) target = Math.max(settings.start_volume, Math.floor(target * 0.4));
    else if (healthScore < 70) target = Math.max(settings.start_volume, Math.floor(target * 0.7));
  }
  return Math.max(0, target);
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

/**
 * Builds today's queue for one mailbox. Recipients are other warmup-enabled
 * mailboxes in the network — there is no synthetic recipient pool, so warmup
 * only runs once at least two mailboxes have opted in.
 */
async function scheduleAccount(
  admin: Admin,
  account: AccountRow,
  settings: SettingsRow,
  peers: AccountRow[],
): Promise<{ scheduled: number; reason?: string }> {
  const now = new Date();
  if (!withinWindow(settings, now)) return { scheduled: 0, reason: "outside sending days" };
  if (peers.length === 0) return { scheduled: 0, reason: "no warmup peers available" };

  const target = dailyTarget(settings, settings.started_at, account.health_score);
  if (target <= 0) return { scheduled: 0, reason: "target is zero" };

  const day = today();
  const { count: already } = await admin
    .from("warmup_jobs")
    .select("id", { count: "exact", head: true })
    .eq("sending_account_id", account.id)
    .eq("role", "initial")
    .gte("created_at", `${day}T00:00:00Z`);

  const remaining = target - (already ?? 0);
  if (remaining <= 0) return { scheduled: 0, reason: "daily target already scheduled" };

  const times = slots(settings, remaining);
  let scheduled = 0;
  for (let i = 0; i < remaining; i += 1) {
    const peer = peers[Math.floor(Math.random() * peers.length)]!;
    const { subject, body } = buildWarmupMessage(account.from_name);
    const threadKey = `wu_${account.id.slice(0, 8)}_${peer.id.slice(0, 8)}_${Date.now()}_${i}`;

    const { data: conversation } = await admin
      .from("warmup_conversations")
      .insert({
        workspace_id: account.workspace_id,
        sender_account_id: account.id,
        recipient_account_id: peer.id,
        subject,
        thread_key: threadKey,
      })
      .select("id")
      .single();

    const idempotencyKey = `${account.id}:${day}:${i}:initial`;
    const token = warmupToken();
    const { error } = await admin.from("warmup_jobs").insert({
      warmup_token: token,
      workspace_id: account.workspace_id,
      sending_account_id: account.id,
      conversation_id: conversation?.id ?? null,
      recipient_account_id: peer.id,
      role: "initial",
      from_email: account.from_email,
      to_email: peer.from_email,
      subject,
      body: withWarmupRef(body, token),
      scheduled_at: times[i]!.toISOString(),
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
      detail: `Queued warmup email to ${peer.from_email}`,
    });
  }

  if (scheduled > 0) {
    await bumpStats(
      admin,
      { workspaceId: account.workspace_id, accountId: account.id, target },
      { scheduled },
    );
  }
  return { scheduled };
}

/* ------------------------------------------------------------------ worker */

async function processJob(admin: Admin, job: Record<string, unknown>, summary: RunSummary) {
  const accountId = job["sending_account_id"] as string;
  const workspaceId = job["workspace_id"] as string;
  const jobId = job["id"] as string;
  const attempts = (job["attempts"] as number) ?? 1;
  const maxAttempts = (job["max_attempts"] as number) ?? 3;

  const { data: account } = await admin
    .from("sending_accounts")
    .select("id, workspace_id, provider, provider_id, connection_method, from_name, from_email, reply_to, paused, customer_enabled, status")
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
  };

  if (!account) return fail("Mailbox no longer exists", false);
  if (account.paused || !account.customer_enabled) {
    await admin
      .from("warmup_jobs")
      .update({ status: "cancelled", locked_by: null, locked_at: null, processed_at: new Date().toISOString(), error: "Mailbox paused" })
      .eq("id", jobId);
    return;
  }

  const { loadAccountCredentials } = await import("@/lib/account-credentials.server");
  const credentials = await loadAccountCredentials(admin, {
    id: account.id as string,
    provider_id: (account.provider_id as string | null) ?? null,
  });
  if (!credentials) {
    return fail("No stored credentials for this mailbox — reconnect it to resume warmup.", false);
  }

  const provider = account.provider as string;
  const started = Date.now();
  const { getAdapter } = await import("@/lib/providers/adapter.server");
  let result: { ok: boolean; message: string; messageId?: string | undefined };
  try {
    result = await getAdapter(provider).sendEmail(credentials, {
      fromName: account.from_name as string,
      fromEmail: account.from_email as string,
      replyTo: (account.reply_to as string | null) ?? null,
      to: job["to_email"] as string,
      subject: job["subject"] as string,
      text: job["body"] as string,
      headers: {
        "X-MunchReach-Warmup": "1",
        ...(job["warmup_token"] ? { "X-MunchReach-Warmup-Id": String(job["warmup_token"]) } : {}),
      },
    });
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
    return fail(message, true);
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
    const retryable = /timeout|rate|429|5\d\d|temporar/i.test(result.message);
    return fail(result.message, retryable);
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
  await admin
    .from("sending_accounts")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("id", accountId);
  summary.sent += 1;

  if (job["role"] === "initial" && job["recipient_account_id"]) {
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
export async function applyWarmupDeliveryEvent(args: {
  kind: "delivered" | "bounced" | "complained" | "deferred" | "delayed" | "rejected" | "replied";
  providerMessageId: string | null;
  email: string | null;
  reason: string | null;
  externalId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<boolean> {
  if (!args.providerMessageId) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: job } = await supabaseAdmin
    .from("warmup_jobs")
    .select("id, workspace_id, sending_account_id, status, conversation_id")
    .eq("provider_message_id", args.providerMessageId)
    .maybeSingle();
  if (!job) return false;

  const fresh = await logEvent(supabaseAdmin, {
    workspaceId: job.workspace_id,
    accountId: job.sending_account_id,
    jobId: job.id,
    type: args.kind,
    detail: args.reason,
    providerMessageId: args.providerMessageId,
    externalId: args.externalId ?? null,
    payload: args.payload ?? {},
  });
  if (!fresh) return true; // duplicate webhook: recorded once, counted once

  const statusMap: Record<string, string | null> = {
    delivered: "delivered",
    bounced: "failed",
    complained: null,
    deferred: null,
    delayed: null,
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
  if (args.kind === "bounced" || args.kind === "rejected") {
    jobPatch["placement"] = "not_delivered";
    jobPatch["placement_checked_at"] = new Date().toISOString();
  }
  if (Object.keys(jobPatch).length) {
    await supabaseAdmin.from("warmup_jobs").update(jobPatch).eq("id", job.id);
  }

  const counter: Record<string, number> =
    args.kind === "delivered"
      ? { delivered: 1 }
      : args.kind === "bounced"
        ? { bounced: 1 }
        : args.kind === "complained"
          ? { complained: 1, spam: 1 }
          : args.kind === "replied"
            ? { replied: 1 }
            : args.kind === "deferred" || args.kind === "delayed"
              ? { deferred: 1 }
              : args.kind === "rejected"
                ? { rejected: 1 }
                : {};
  if (Object.keys(counter).length) {
    await bumpStats(
      supabaseAdmin,
      { workspaceId: job.workspace_id, accountId: job.sending_account_id },
      counter,
    );
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
    const entries = Array.isArray(headers)
      ? (headers as Array<Record<string, unknown>>).map((h) => [String(h["name"] ?? ""), String(h["value"] ?? "")])
      : Object.entries(headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]);
    for (const [name, value] of entries) {
      if (String(name).toLowerCase() === "x-munchreach-warmup-id" && value) {
        return String(value).trim().toLowerCase();
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
    const entries = Array.isArray(headers)
      ? (headers as Array<Record<string, unknown>>).map((h) => [String(h["name"] ?? ""), String(h["value"] ?? "")])
      : Object.entries(headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]);
    for (const [name, value] of entries) {
      const key = String(name).toLowerCase();
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
  payload?: Record<string, unknown>;
}): Promise<boolean> {
  const token = warmupTokenFrom(input);
  if (!token) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: job } = await supabaseAdmin
    .from("warmup_jobs")
    .select("id, workspace_id, sending_account_id, recipient_account_id, status, placement, role, conversation_id")
    .eq("warmup_token", token)
    .maybeSingle();
  if (!job) return false;

  // Already classified: acknowledge the redelivery without double counting.
  if (job.placement && job.placement !== "pending") return true;

  const spam = spamVerdict(input);
  const placement = spam === true ? "spam" : spam === false ? "inbox" : "received_unknown";
  const now = new Date().toISOString();

  await supabaseAdmin
    .from("warmup_jobs")
    .update({
      placement,
      placement_checked_at: now,
      received_at: now,
      status: job.status === "sent" || job.status === "processing" ? "delivered" : job.status,
    })
    .eq("id", job.id);

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
    payload: { placement, to: input.to, from: input.from },
  });

  if (fresh) {
    const counter: Record<string, number> =
      placement === "spam" ? { spam: 1 } : placement === "inbox" ? { inbox: 1 } : {};
    if (job.status !== "delivered") counter["delivered"] = 1;
    if (Object.keys(counter).length) {
      await bumpStats(
        supabaseAdmin,
        { workspaceId: job.workspace_id, accountId: job.sending_account_id },
        counter,
      );
    }
    await recalculateHealth(supabaseAdmin, job.sending_account_id);
  }
  return true;
}

/**
 * Marks sent warmup mail that never showed up on the receiving side. Runs on
 * every cycle so the dashboard never reports a delivery that did not happen.
 */
async function sweepPlacement(admin: Admin): Promise<number> {
  const cutoff = new Date(Date.now() - PLACEMENT_WINDOW_MS).toISOString();
  const { data: stale } = await admin
    .from("warmup_jobs")
    .select("id, workspace_id, sending_account_id")
    .eq("placement", "pending")
    .in("status", ["sent", "delivered"])
    .not("processed_at", "is", null)
    .lt("processed_at", cutoff)
    .limit(200);

  for (const job of (stale ?? []) as Array<Record<string, string>>) {
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
  return (stale ?? []).length;
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

    const bouncePenalty = Math.min(40, Math.round(bounceRate * 4));
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

  await admin.from("warmup_health").insert({
    workspace_id: account.workspace_id,
    sending_account_id: accountId,
    score,
    status,
    factors,
    recommendation,
  });
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

  const sent = (stats ?? []).reduce((n: number, r: { sent: number }) => n + (r.sent ?? 0), 0);
  const bounced = (stats ?? []).reduce((n: number, r: { bounced: number }) => n + (r.bounced ?? 0), 0);
  const failed = (stats ?? []).reduce((n: number, r: { failed: number }) => n + (r.failed ?? 0), 0);

  let reason: string | null = null;
  if (sent >= 10 && (bounced / sent) * 100 > settings.max_bounce_rate) {
    reason = `Bounce rate ${(((bounced / sent) * 100)).toFixed(1)}% exceeded the ${settings.max_bounce_rate}% limit.`;
  } else if (sent >= 10 && (failed / Math.max(1, sent + failed)) * 100 > 30) {
    reason = "More than 30% of provider send attempts failed.";
  } else if ((account.health_score ?? 100) < settings.min_health_score) {
    reason = `Health score ${account.health_score} is below the ${settings.min_health_score} minimum.`;
  } else if (account.status === "failed") {
    reason = "The mailbox connection test is failing.";
  } else if ([account.spf_status, account.dkim_status, account.dmarc_status].includes("fail")) {
    reason = "Domain authentication (SPF/DKIM/DMARC) is failing.";
  }

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
    const { data: settingsRows } = await admin
      .from("warmup_settings")
      .select(
        "id, sending_account_id, workspace_id, enabled, start_volume, max_volume, daily_increase, ramp_days, send_days, send_start_hour, send_end_hour, reply_rate, max_bounce_rate, min_health_score, auto_pause, paused_by_system, started_at",
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

      const eligible = accounts.filter(
        (a) => !a.paused && a.customer_enabled && a.status !== "disabled",
      );

      for (const setting of settings) {
        const account = byId.get(setting.sending_account_id);
        if (!account) continue;
        if (account.paused || !account.customer_enabled) continue;
        const safe = await applySafety(admin, account, setting, summary);
        if (!safe) continue;
        const peers = eligible.filter((p) => p.id !== account.id);
        try {
          const res = await scheduleAccount(admin, account, setting, peers);
          summary.scheduled += res.scheduled;
        } catch (error) {
          summary.errors.push(
            `schedule ${account.from_email}: ${error instanceof Error ? error.message : "failed"}`,
          );
        }
      }
    }

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
    const touched = new Set(jobs.map((j) => j["sending_account_id"] as string));
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
