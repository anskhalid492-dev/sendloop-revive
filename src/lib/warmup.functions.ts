/**
 * Warmup server functions used by the dashboard.
 *
 * All reads run through the caller's authenticated Supabase client so RLS
 * scopes every row to the caller's workspaces. Nothing is fabricated: empty
 * tables surface as zeroes and "no data yet" in the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  classifyMailboxPause,
  type MailboxPauseKind,
  evaluateMailboxSafety,
  evaluateSafetyViolation,
  resumeDecision,
  SAFETY_WINDOW_DAYS,
  type SafetyMetrics,
  type SafetyStatRow,
} from "@/lib/mailbox-pause-state";

import { WARMUP_MODES } from "@/lib/warmup-model";
import { warmupDeliveryCounts } from "@/lib/warmup-delivery";
import type {
  MailboxCheck,
  WarmupDayStat,
  WarmupHealth,
  WarmupJob,
  WarmupSettings,
} from "@/lib/warmup-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const SETTINGS_COLUMNS =
  "id, sending_account_id, enabled, mode, start_volume, max_volume, daily_increase, ramp_days, send_days, send_start_hour, send_end_hour, timezone, reply_rate, max_bounce_rate, min_health_score, auto_pause, paused_by_system, pause_reason, paused_at, started_at, last_run_reason, last_run_at, ramp_stage, stage_since, stage_reason, current_volume";

export type WarmupAccountRow = {
  id: string;
  from_email: string;
  from_name: string;
  domain: string | null;
  provider: string;
  status: string;
  paused: boolean;
  customer_enabled: boolean;
  health_score: number | null;
  health_status: string;
  warmup_enabled: boolean;
  paused_by_system: boolean;
  pause_reason: string | null;
  mode: string;
  target_today: number;
  sent_today: number;
  delivered_today: number;
  /**
   * Sends the mailbox accepted for which no arrival confirmation exists. Never
   * counted as delivered and never counted as a failure.
   */
  unconfirmed_today: number;
  inbox_today: number;
  spam_today: number;
  bounced_today: number;
  replied_today: number;
  max_volume: number;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
  mx_status: string;
  /** Clear mailbox state for the dashboard badge. */
  state: "on" | "off" | "blocked";
  block_reason: string | null;
  /** Which kind of pause/block this is, so the UI never mislabels it. */
  pause_kind: MailboxPauseKind;
  /** Whether the Resume button may clear it. */
  resumable: boolean;
  /** True only while a safety condition is measurably active right now. */
  safety_active: boolean;
  /** True when a stored system pause is no longer backed by live numbers. */
  safety_stale: boolean;
  /** Live bounce/complaint numbers behind the decision. */
  safety_metrics: SafetyMetrics;
  /** When the runner next re-checks the safety conditions. */
  next_evaluation_at: string;

  failed_today: number;
  delivery_rate: number | null;
  /** Ramp stage the engine is in right now. */
  ramp_stage: string;
  /** Plain-English explanation of the current stage and volume. */
  stage_reason: string | null;
  /** Today's temporary failure rate (deferrals + soft failures). */
  temp_failure_rate: number | null;
  bounce_rate: number | null;
  ramp_day: number;
  ramp_days: number;
  daily_limit: number;
  last_activity_at: string | null;
};




function statusOf(row: {
  paused: boolean;
  customer_enabled: boolean;
  status: string;
  warmup_enabled: boolean;
  paused_by_system: boolean;
  health_score: number | null;
}): string {
  if (row.status === "failed") return "error";
  if (row.paused_by_system) return "paused";
  if (!row.warmup_enabled) return "not_started";
  if (row.paused || !row.customer_enabled) return "paused";
  const score = row.health_score;
  if (score === null) return "warming";
  if (score >= 85) return "healthy";
  if (score >= 70) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

/** Dashboard list: one row per mailbox with today's real counters. */
export const listWarmupAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as Client;
    const today = new Date().toISOString().slice(0, 10);

    const { data: accounts, error } = await client
      .from("sending_accounts")
      .select(
        "id, from_email, from_name, provider, status, paused, customer_enabled, health_score, spf_status, dkim_status, dmarc_status, mx_status, domain_id, sending_domains(domain)",
      )
      .order("from_email");
    if (error) throw new Error(error.message);

    const ids = (accounts ?? []).map((a: { id: string }) => a.id);
    if (ids.length === 0) return { accounts: [] as WarmupAccountRow[] };

    const safetySince = new Date(Date.now() - SAFETY_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const [{ data: settings }, { data: stats }, { data: windowStats }] = await Promise.all([
      client.from("warmup_settings").select(SETTINGS_COLUMNS).in("sending_account_id", ids),
      client
        .from("warmup_daily_stats")
        .select("sending_account_id, target, sent, delivered, failed, inbox, spam, bounced, replied, deferred, rejected, not_received, stage, stage_action, planned_target")
        .in("sending_account_id", ids)
        .eq("day", today),
      client
        .from("warmup_daily_stats")
        .select("sending_account_id, sent, bounced, failed")
        .in("sending_account_id", ids)
        .gte("day", safetySince),
    ]);

    const windowStatsById = new Map<string, SafetyStatRow[]>();
    for (const row of (windowStats ?? []) as Array<Record<string, unknown>>) {
      const key = row["sending_account_id"] as string;
      const list = windowStatsById.get(key) ?? [];
      list.push(row as SafetyStatRow);
      windowStatsById.set(key, list);
    }


    // Last real warmup activity per mailbox (send/delivery/bounce/reply event).
    const { data: recentEvents } = await client
      .from("warmup_events")
      .select("sending_account_id, occurred_at")
      .in("sending_account_id", ids)
      .order("occurred_at", { ascending: false })
      .limit(300);
    const lastActivity = new Map<string, string>();
    for (const row of (recentEvents ?? []) as Array<Record<string, unknown>>) {
      const key = row["sending_account_id"] as string;
      if (!lastActivity.has(key)) lastActivity.set(key, row["occurred_at"] as string);
    }

    const settingsById = new Map(
      ((settings ?? []) as Array<Record<string, unknown>>).map((s) => [
        s["sending_account_id"] as string,
        s,
      ]),
    );
    const statsById = new Map(
      ((stats ?? []) as Array<Record<string, unknown>>).map((s) => [
        s["sending_account_id"] as string,
        s,
      ]),
    );

    const rows: WarmupAccountRow[] = (accounts ?? []).map((a: Record<string, unknown>) => {
      const setting = settingsById.get(a["id"] as string);
      const stat = statsById.get(a["id"] as string);
      const base = {
        paused: !!a["paused"],
        customer_enabled: !!a["customer_enabled"],
        status: a["status"] as string,
        warmup_enabled: !!setting?.["enabled"],
        paused_by_system: !!setting?.["paused_by_system"],
        health_score: (a["health_score"] as number | null) ?? null,
      };
      const domainRel = a["sending_domains"] as { domain?: string } | null;
      // One shared calculation for every warmup surface: delivered counts
      // confirmed arrivals only, the rest is reported as unconfirmed.
      const delivery = warmupDeliveryCounts({
        sent: (stat?.["sent"] as number) ?? 0,
        delivered: (stat?.["delivered"] as number) ?? 0,
        bounced: (stat?.["bounced"] as number) ?? 0,
        failed: (stat?.["failed"] as number) ?? 0,
        notReceived: (stat?.["not_received"] as number) ?? 0,
      });
      const sent = delivery.sent;
      const delivered = delivery.delivered;
      const startedAt = setting?.["started_at"] as string | null | undefined;
      const rampDays = (setting?.["ramp_days"] as number) ?? 0;
      const rampDay = startedAt
        ? Math.min(
            rampDays || 0,
            Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000) + 1,
          )
        : 0;
      // Live safety evaluation — never trust the stored reason string alone,
      // otherwise a mailbox stays "Blocked by bounce-rate protection" forever
      // after the numbers recover.
      const snapshot = evaluateMailboxSafety({
        stats: windowStatsById.get(a["id"] as string) ?? [],
        maxBounceRate: Number(setting?.["max_bounce_rate"] ?? 5),
        minHealthScore: Number(setting?.["min_health_score"] ?? 0),
        healthScore: base.health_score,
        accountStatus: base.status,
        authStatuses: [a["spf_status"], a["dkim_status"], a["dmarc_status"]] as string[],
        manuallyPaused: base.paused,
        customerEnabled: base.customer_enabled,
        pausedBySystem: base.paused_by_system,
        pauseReason: (setting?.["pause_reason"] as string | null) ?? null,
      });
      const safetyActive = snapshot.violation.active;
      const pauseKind: MailboxPauseKind = base.paused_by_system || base.paused || !base.customer_enabled || base.status === "failed"
        ? snapshot.state.kind
        : "none";
      const resumable = pauseKind === "none" ? true : snapshot.state.resumable;
      const blockReason = !base.warmup_enabled
        ? null
        : safetyActive
          ? snapshot.violation.reason
          : base.paused_by_system
            ? `${(setting?.["pause_reason"] as string | null) ?? "Paused automatically."} This condition is no longer active — you can resume this mailbox.`
            : base.paused || !base.customer_enabled
              ? "Mailbox sending is paused."
              : base.status === "failed"
                ? "The mailbox connection test is failing."
                : ((setting?.["last_run_reason"] as string | null) ?? null);
      const state: "on" | "off" | "blocked" = !base.warmup_enabled
        ? "off"
        : base.paused_by_system || base.paused || !base.customer_enabled || base.status === "failed"
          ? "blocked"
          : "on";

      return {
        id: a["id"] as string,
        from_email: a["from_email"] as string,
        from_name: a["from_name"] as string,
        domain: domainRel?.domain ?? (a["from_email"] as string).split("@")[1] ?? null,
        provider: a["provider"] as string,
        status: a["status"] as string,
        paused: base.paused,
        customer_enabled: base.customer_enabled,
        health_score: base.health_score,
        health_status: statusOf(base),
        warmup_enabled: base.warmup_enabled,
        paused_by_system: base.paused_by_system,
        pause_reason: (setting?.["pause_reason"] as string | null) ?? null,
        mode: (setting?.["mode"] as string) ?? "balanced",
        target_today: (stat?.["target"] as number) ?? 0,
        sent_today: delivery.sent,
        delivered_today: delivery.delivered,
        unconfirmed_today: delivery.unconfirmed,
        inbox_today: (stat?.["inbox"] as number) ?? 0,
        spam_today: (stat?.["spam"] as number) ?? 0,
        bounced_today: (stat?.["bounced"] as number) ?? 0,
        replied_today: (stat?.["replied"] as number) ?? 0,
        max_volume: (setting?.["max_volume"] as number) ?? 0,
        spf_status: a["spf_status"] as string,
        dkim_status: a["dkim_status"] as string,
        dmarc_status: a["dmarc_status"] as string,
        mx_status: a["mx_status"] as string,
        state,
        block_reason: blockReason,
        pause_kind: pauseKind,
        resumable,
        safety_active: safetyActive,
        safety_stale: snapshot.stale,
        safety_metrics: snapshot.metrics,
        next_evaluation_at: snapshot.nextEvaluationAt,

        failed_today: (stat?.["failed"] as number) ?? 0,
        ramp_stage: (setting?.["ramp_stage"] as string) ?? "ramp_up",
        stage_reason:
          (setting?.["stage_reason"] as string | null) ??
          ((setting?.["last_run_reason"] as string | null) ?? null),
        temp_failure_rate:
          sent > 0
            ? Math.round(
                ((((stat?.["deferred"] as number) ?? 0) + ((stat?.["failed"] as number) ?? 0)) /
                  sent) *
                  1000,
              ) / 10
            : null,
        bounce_rate:
          sent > 0
            ? Math.round((((stat?.["bounced"] as number) ?? 0) / sent) * 1000) / 10
            : null,
        delivery_rate: delivery.rate,
        ramp_day: rampDay,
        ramp_days: rampDays,
        daily_limit: (stat?.["target"] as number) ?? 0,
        last_activity_at: lastActivity.get(a["id"] as string) ?? null,
      };
    });

    return { accounts: rows };
  });

/**
 * Per-mailbox detail: settings, daily series and health history.
 * Warmup job/message records (network recipients, subjects, providers) are
 * internal only and are never returned to customers.
 */
export const getWarmupAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), days: z.number().int().min(7).max(90).default(30) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString().slice(0, 10);

    const [account, settings, stats, health] = await Promise.all([
      client
        .from("sending_accounts")
        .select(
          "id, from_email, from_name, provider, status, last_error, paused, customer_enabled, health_score, spf_status, dkim_status, dmarc_status, mx_status, last_sent_at, sending_domains(domain)",
        )
        .eq("id", data.id)
        .maybeSingle(),
      client
        .from("warmup_settings")
        .select(SETTINGS_COLUMNS)
        .eq("sending_account_id", data.id)
        .maybeSingle(),
      client
        .from("warmup_daily_stats")
        .select(
          "day, target, planned_target, stage, stage_action, scheduled, sent, delivered, inbox, spam, deferred, rejected, not_received, bounced, complained, failed, replied, health_score",
        )
        .eq("sending_account_id", data.id)
        .gte("day", since)
        .order("day"),
      client
        .from("warmup_health")
        .select("score, status, factors, recommendation, computed_at")
        .eq("sending_account_id", data.id)
        .order("computed_at", { ascending: false })
        .limit(1),
    ]);

    if (account.error) throw new Error(account.error.message);
    if (!account.data) throw new Error("Mailbox not found");

    return {
      account: account.data,
      settings: (settings.data ?? null) as WarmupSettings | null,
      stats: (stats.data ?? []) as WarmupDayStat[],
      health: ((health.data ?? [])[0] ?? null) as WarmupHealth | null,
    };
  });

const settingsInput = z.object({
  accountId: z.string().uuid(),
  enabled: z.boolean().optional(),
  mode: z.enum(["conservative", "balanced", "aggressive"]).optional(),
  start_volume: z.number().int().min(1).max(200).optional(),
  max_volume: z.number().int().min(1).max(400).optional(),
  daily_increase: z.number().int().min(1).max(50).optional(),
  ramp_days: z.number().int().min(3).max(120).optional(),
  send_days: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  send_start_hour: z.number().int().min(0).max(23).optional(),
  send_end_hour: z.number().int().min(1).max(24).optional(),
  timezone: z.string().trim().max(60).optional(),
  reply_rate: z.number().int().min(0).max(100).optional(),
  max_bounce_rate: z.number().int().min(1).max(50).optional(),
  min_health_score: z.number().int().min(0).max(100).optional(),
  auto_pause: z.boolean().optional(),
  /** Clears a system pause so the runner can pick the mailbox up again. */
  resume: z.boolean().optional(),
});

/** Creates or updates warmup configuration for one mailbox. */
export const saveWarmupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => settingsInput.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { accountId, resume, ...patch } = data;

    const { data: account, error: accountError } = await client
      .from("sending_accounts")
      .select(
        "id, workspace_id, status, paused, customer_enabled, health_score, spf_status, dkim_status, dmarc_status",
      )
      .eq("id", accountId)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account) throw new Error("Mailbox not found");

    // Warmup is a plan feature; enforced here so API callers cannot enable it.
    const { requireWarmup } = await import("@/lib/billing/gates.server");
    await requireWarmup(account.workspace_id as string);

    const { data: existing } = await client
      .from("warmup_settings")
      .select(
        "id, enabled, started_at, paused_by_system, pause_reason, max_bounce_rate, min_health_score",
      )
      .eq("sending_account_id", accountId)
      .maybeSingle();

    const preset = patch.mode ? WARMUP_MODES.find((m) => m.id === patch.mode) : undefined;
    const body: Record<string, unknown> = { ...patch };
    if (preset && !existing) {
      body["start_volume"] = patch.start_volume ?? preset.start_volume;
      body["max_volume"] = patch.max_volume ?? preset.max_volume;
      body["daily_increase"] = patch.daily_increase ?? preset.daily_increase;
      body["ramp_days"] = patch.ramp_days ?? preset.ramp_days;
      body["reply_rate"] = patch.reply_rate ?? preset.reply_rate;
    }

    const wantsResume = Boolean(resume || patch.enabled);
    // Resume may only clear states that are actually resumable. An ACTIVE
    // bounce/complaint/provider safety block stays in place — otherwise the
    // runner would simply re-pause the mailbox seconds later.
    if (wantsResume && existing?.paused_by_system) {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      const { data: stats } = await client
        .from("warmup_daily_stats")
        .select("sent, bounced, failed")
        .eq("sending_account_id", accountId)
        .gte("day", since);

      const violation = evaluateSafetyViolation({
        stats: (stats ?? []) as SafetyStatRow[],
        maxBounceRate: Number(existing.max_bounce_rate ?? 5),
        minHealthScore: Number(existing.min_health_score ?? 0),
        healthScore: (account.health_score as number | null) ?? null,
        accountStatus: account.status as string,
        authStatuses: [account.spf_status, account.dkim_status, account.dmarc_status] as string[],
      });
      const state = classifyMailboxPause({
        manuallyPaused: !!account.paused,
        customerEnabled: account.customer_enabled !== false,
        pausedBySystem: true,
        pauseReason: (existing.pause_reason as string | null) ?? null,
        accountStatus: account.status as string,
        violation,
      });
      const decision = resumeDecision(state);
      if (!decision.allowed) {
        // Keep the stored reason current instead of showing stale copy.
        if (violation.reason && violation.reason !== existing.pause_reason) {
          await client
            .from("warmup_settings")
            .update({ pause_reason: violation.reason })
            .eq("id", existing.id);
        }
        return {
          ok: false as const,
          resumed: false as const,
          blocked: true as const,
          kind: decision.kind,
          message: decision.message,
        };
      }
    }

    if (wantsResume) {
      body["paused_by_system"] = false;
      body["pause_reason"] = null;
      body["paused_at"] = null;
    }
    if (patch.enabled) {
      body["started_at"] = existing?.started_at ?? new Date().toISOString();
    }


    if (existing) {
      const { error } = await client.from("warmup_settings").update(body).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client.from("warmup_settings").insert({
        ...body,
        workspace_id: account.workspace_id,
        sending_account_id: accountId,
      });
      if (error) throw new Error(error.message);
    }

    // Keep the mailbox row's warmup badge in sync with the engine's state.
    await client
      .from("sending_accounts")
      .update({
        warmup_status:
          patch.enabled === undefined ? undefined : patch.enabled ? "warming" : "not_started",
        ...(patch.enabled ? { warmup_started_at: body["started_at"] } : {}),
      })
      .eq("id", accountId);

    return {
      ok: true as const,
      resumed: wantsResume,
      blocked: false as const,
      kind: "none" as const,
      message: wantsResume ? "Sending resumed." : "Settings saved.",
    };
  });

/** Bulk enable/disable warmup across selected mailboxes. */
export const bulkSetWarmup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(100), enabled: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: accounts, error } = await client
      .from("sending_accounts")
      .select("id, workspace_id")
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const rows = (accounts ?? []) as Array<{ id: string; workspace_id: string }>;
    // Same plan gate as the single-mailbox action — a bulk call is not a bypass.
    if (data.enabled) {
      const { requireWarmup } = await import("@/lib/billing/gates.server");
      for (const workspaceId of new Set(rows.map((r) => r.workspace_id))) {
        await requireWarmup(workspaceId);
      }
    }

    const now = new Date().toISOString();
    let changed = 0;
    for (const account of rows) {
      const { data: existing } = await client
        .from("warmup_settings")
        .select("id, started_at")
        .eq("sending_account_id", account.id)
        .maybeSingle();
      const body = {
        enabled: data.enabled,
        paused_by_system: false,
        pause_reason: null,
        started_at: data.enabled ? (existing?.started_at ?? now) : (existing?.started_at ?? null),
      };
      const { error: writeError } = existing
        ? await client.from("warmup_settings").update(body).eq("id", existing.id)
        : await client.from("warmup_settings").insert({
            ...body,
            workspace_id: account.workspace_id,
            sending_account_id: account.id,
          });
      if (writeError) throw new Error(writeError.message);
      changed += 1;
    }

    await client
      .from("sending_accounts")
      .update({ warmup_status: data.enabled ? "warming" : "not_started" })
      .in("id", data.ids);

    return { ok: true, changed };
  });

/** Connection/test/send history for one mailbox. */
export const listMailboxChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), limit: z.number().int().min(5).max(100).default(25) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ checks: MailboxCheck[] }> => {
    const { data: rows, error } = await (context.supabase as Client)
      .from("sending_account_checks")
      .select("id, kind, ok, provider, status_code, message, duration_ms, detail, created_at")
      .eq("sending_account_id", data.id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { checks: (rows ?? []) as MailboxCheck[] };
  });

/** Deliverability insights for one mailbox, derived only from stored events. */
export const getMailboxInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), days: z.number().int().min(7).max(90).default(30) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const sinceDay = since.slice(0, 10);

    const [{ data: warmup }, { data: events }, { data: messages }] = await Promise.all([
      client
        .from("warmup_daily_stats")
        .select("day, sent, delivered, bounced, complained, failed, replied, health_score")
        .eq("sending_account_id", data.id)
        .gte("day", sinceDay)
        .order("day"),
      client
        .from("email_events")
        .select("event_type, created_at")
        .eq("sending_account_id", data.id)
        .eq("message_type", "warmup")
        .gte("created_at", since),
      client
        .from("campaign_messages")
        .select("status, sent_at")
        .eq("message_type", "campaign")
        .eq("sending_account_id", data.id)
        .gte("created_at", since),
    ]);

    const campaign = { sent: 0, failed: 0 };
    for (const m of (messages ?? []) as Array<{ status: string }>) {
      if (m.status === "sent") campaign.sent += 1;
      if (m.status === "failed") campaign.failed += 1;
    }

    const providerEvents = { delivered: 0, bounced: 0, complained: 0 };
    for (const e of (events ?? []) as Array<{ event_type: string }>) {
      const t = e.event_type.toLowerCase();
      if (t.includes("deliver")) providerEvents.delivered += 1;
      else if (t.includes("bounce")) providerEvents.bounced += 1;
      else if (t.includes("complain") || t.includes("spam")) providerEvents.complained += 1;
    }

    return {
      series: (warmup ?? []) as WarmupDayStat[],
      campaign,
      providerEvents,
      days: data.days,
    };
  });

export type DomainAlert = {
  id: string;
  domain_id: string;
  domain: string | null;
  kind: string;
  severity: string;
  title: string;
  detail: string | null;
  records: string[];
  created_at: string;
};

/** Open authentication alerts across the caller's domains. */
export const listDomainAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ alerts: DomainAlert[] }> => {
    const { data, error } = await (context.supabase as Client)
      .from("domain_alerts")
      .select(
        "id, domain_id, kind, severity, title, detail, records, resolved_at, created_at, sending_domains(domain)",
      )
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return {
      alerts: ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: row["id"] as string,
        domain_id: row["domain_id"] as string,
        domain: (row["sending_domains"] as { domain?: string } | null)?.domain ?? null,
        kind: row["kind"] as string,
        severity: row["severity"] as string,
        title: row["title"] as string,
        detail: (row["detail"] as string | null) ?? null,
        records: (row["records"] as string[] | null) ?? [],
        created_at: row["created_at"] as string,
      })),
    };
  });

export const dismissDomainAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Client)
      .from("domain_alerts")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type WarmupAnalyticsPoint = {
  day: string;
  /** Volume the ramp machine planned for that day. */
  planned: number;
  /** What the engine did that day, e.g. increase / hold / reduce. */
  action: string | null;
  stage: string | null;
  sent: number;
  delivered: number;
  inbox: number;
  spam: number;
  bounced: number;
  complained: number;
  failed: number;
  replied: number;
  not_received: number;
  deferred: number;
  rejected: number;
  health_score: number | null;
  inbox_rate: number | null;
  reply_rate: number | null;
};

export type WarmupAnalyticsMailbox = {
  id: string;
  from_email: string;
  sent: number;
  inbox: number;
  spam: number;
  bounced: number;
  replied: number;
  inbox_rate: number | null;
  reply_rate: number | null;
  bounce_rate: number | null;
  health_score: number | null;
};

/**
 * Workspace warmup analytics computed only from persisted warmup rows
 * (warmup_daily_stats rollups + warmup_jobs placement). No estimates.
 */
export const getWarmupAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        days: z.number().int().min(7).max(90).default(30),
        accountIds: z.array(z.string().uuid()).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const sinceIso = new Date(Date.now() - (data.days - 1) * 86_400_000).toISOString();
    const sinceDay = sinceIso.slice(0, 10);
    const pct = (part: number, total: number) =>
      total > 0 ? Math.round((part / total) * 1000) / 10 : null;

    const { data: accounts, error: accountsError } = await client
      .from("sending_accounts")
      .select("id, from_email, health_score")
      .order("from_email");
    if (accountsError) throw new Error(accountsError.message);

    const all = (accounts ?? []) as Array<{
      id: string;
      from_email: string;
      health_score: number | null;
    }>;
    const selected = data.accountIds?.length
      ? all.filter((a) => data.accountIds?.includes(a.id))
      : all;
    const ids = selected.map((a) => a.id);

    const empty = {
      mailboxes: all.map((a) => ({ id: a.id, from_email: a.from_email })),
      series: [] as WarmupAnalyticsPoint[],
      perMailbox: [] as WarmupAnalyticsMailbox[],
      totals: {
        sent: 0,
        delivered: 0,
        inbox: 0,
        spam: 0,
        bounced: 0,
        complained: 0,
        failed: 0,
        replied: 0,
        not_received: 0,
        deferred: 0,
        rejected: 0,
      },
      rates: {
        inbox: null as number | null,
        spam: null as number | null,
        reply: null as number | null,
        bounce: null as number | null,
        delivered: null as number | null,
      },
      placement: [] as Array<{ placement: string; count: number }>,
      current: {
        sentToday: 0,
        targetToday: null as number | null,
        dailyLimit: null as number | null,
        stage: null as string | null,
        stageDay: null as number | null,
        rampDays: null as number | null,
        lastActivityAt: null as string | null,
        healthScore: null as number | null,
        enabledMailboxes: 0,
      },
      days: data.days,
    };
    if (ids.length === 0) return empty;

    const [{ data: stats, error: statsError }, { data: jobs, error: jobsError }] =
      await Promise.all([
        client
          .from("warmup_daily_stats")
          .select(
            "sending_account_id, day, target, planned_target, stage, stage_action, sent, delivered, inbox, spam, deferred, rejected, not_received, bounced, complained, failed, replied, health_score",
          )
          .in("sending_account_id", ids)
          .gte("day", sinceDay)
          .order("day"),
        client
          .from("warmup_jobs")
          .select("placement, status, processed_at")
          .in("sending_account_id", ids)
          .gte("created_at", sinceIso)
          .limit(5000),
      ]);
    if (statsError) throw new Error(statsError.message);
    if (jobsError) throw new Error(jobsError.message);

    type Row = Record<string, number | string | null>;
    const num = (row: Row, key: string) => Number(row[key] ?? 0) || 0;

    const byDay = new Map<string, WarmupAnalyticsPoint>();
    const byAccount = new Map<string, WarmupAnalyticsMailbox>();
    for (const a of selected) {
      byAccount.set(a.id, {
        id: a.id,
        from_email: a.from_email,
        sent: 0,
        inbox: 0,
        spam: 0,
        bounced: 0,
        replied: 0,
        inbox_rate: null,
        reply_rate: null,
        bounce_rate: null,
        health_score: a.health_score,
      });
    }

    const totals = { ...empty.totals };
    const healthByDay = new Map<string, number[]>();

    for (const raw of (stats ?? []) as Row[]) {
      const day = String(raw["day"]);
      const point =
        byDay.get(day) ??
        ({
          day,
          planned: 0,
          action: null,
          stage: null,
          sent: 0,
          delivered: 0,
          inbox: 0,
          spam: 0,
          bounced: 0,
          complained: 0,
          failed: 0,
          replied: 0,
          not_received: 0,
          deferred: 0,
          rejected: 0,
          health_score: null,
          inbox_rate: null,
          reply_rate: null,
        } satisfies WarmupAnalyticsPoint);

      for (const key of [
        "sent",
        "delivered",
        "inbox",
        "spam",
        "bounced",
        "complained",
        "failed",
        "replied",
        "not_received",
        "deferred",
        "rejected",
      ] as const) {
        const value = num(raw, key);
        point[key] += value;
        totals[key] += value;
      }
      point.planned += num(raw, "planned_target") || num(raw, "target");
      if (raw["stage_action"]) point.action = String(raw["stage_action"]);
      if (raw["stage"]) point.stage = String(raw["stage"]);
      byDay.set(day, point);

      const score = raw["health_score"];
      if (score !== null && score !== undefined) {
        const list = healthByDay.get(day) ?? [];
        list.push(Number(score));
        healthByDay.set(day, list);
      }

      const mailbox = byAccount.get(String(raw["sending_account_id"]));
      if (mailbox) {
        mailbox.sent += num(raw, "sent");
        mailbox.inbox += num(raw, "inbox");
        mailbox.spam += num(raw, "spam");
        mailbox.bounced += num(raw, "bounced");
        mailbox.replied += num(raw, "replied");
      }
    }

    const series = [...byDay.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((point) => {
        const scores = healthByDay.get(point.day) ?? [];
        return {
          ...point,
          health_score: scores.length
            ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
            : null,
          inbox_rate: pct(point.inbox, point.inbox + point.spam),
          reply_rate: pct(point.replied, point.sent),
        };
      });

    const perMailbox = [...byAccount.values()].map((m) => ({
      ...m,
      inbox_rate: pct(m.inbox, m.inbox + m.spam),
      reply_rate: pct(m.replied, m.sent),
      bounce_rate: pct(m.bounced, m.sent),
    }));

    // Live warmup state for the selected mailboxes: today's real volume, the
    // configured allowance, the ramp stage and the last recorded activity.
    const todayDay = new Date().toISOString().slice(0, 10);
    const [{ data: todayStats }, { data: settingsRows }, { data: lastEvent }] = await Promise.all([
      client
        .from("warmup_daily_stats")
        .select("sent, target, health_score")
        .in("sending_account_id", ids)
        .eq("day", todayDay),
      client
        .from("warmup_settings")
        .select("enabled, mode, max_volume, ramp_days, started_at")
        .in("sending_account_id", ids),
      client
        .from("warmup_events")
        .select("created_at")
        .in("sending_account_id", ids)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const todayRows = (todayStats ?? []) as Array<{
      sent: number | null;
      target: number | null;
      health_score: number | null;
    }>;
    const settingsList = (
      (settingsRows ?? []) as Array<{
        enabled: boolean | null;
        mode: string | null;
        max_volume: number | null;
        ramp_days: number | null;
        started_at: string | null;
      }>
    ).filter((row) => row.enabled);
    const targetsToday = todayRows
      .map((row) => row.target)
      .filter((value): value is number => typeof value === "number");
    const limits = settingsList
      .map((row) => row.max_volume)
      .filter((value): value is number => typeof value === "number");
    const healthToday = todayRows
      .map((row) => row.health_score)
      .filter((value): value is number => typeof value === "number");
    const startedAt =
      settingsList
        .map((row) => row.started_at)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null;
    const rampDays =
      settingsList
        .map((row) => row.ramp_days)
        .filter((value): value is number => typeof value === "number")
        .sort((a, b) => b - a)[0] ?? null;

    const current = {
      sentToday: todayRows.reduce((sum, row) => sum + (row.sent ?? 0), 0),
      targetToday: targetsToday.length ? targetsToday.reduce((sum, value) => sum + value, 0) : null,
      dailyLimit: limits.length ? limits.reduce((sum, value) => sum + value, 0) : null,
      stage: settingsList.length ? (settingsList[0]?.mode ?? null) : null,
      stageDay: startedAt
        ? Math.max(1, Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000) + 1)
        : null,
      rampDays,
      lastActivityAt: (lastEvent?.created_at as string | undefined) ?? null,
      healthScore: healthToday.length
        ? Math.round(healthToday.reduce((sum, value) => sum + value, 0) / healthToday.length)
        : null,
      enabledMailboxes: settingsList.length,
    };

    const placementCounts = new Map<string, number>();
    for (const job of (jobs ?? []) as Array<{ placement: string | null; status: string }>) {
      const key = job.placement ?? (job.status === "failed" ? "not_delivered" : "pending");
      placementCounts.set(key, (placementCounts.get(key) ?? 0) + 1);
    }

    return {
      mailboxes: all.map((a) => ({ id: a.id, from_email: a.from_email })),
      series,
      perMailbox,
      totals,
      rates: {
        inbox: pct(totals.inbox, totals.inbox + totals.spam),
        spam: pct(totals.spam, totals.inbox + totals.spam),
        reply: pct(totals.replied, totals.sent),
        bounce: pct(totals.bounced, totals.sent),
        delivered: pct(totals.delivered, totals.sent),
      },
      current,
      placement: [...placementCounts.entries()]
        .map(([placement, count]) => ({ placement, count }))
        .sort((a, b) => b.count - a.count),
      days: data.days,
    };
  });

export type WarmupTimelineEvent = {
  id: string;
  type: string;
  detail: string | null;
  provider: string | null;
  occurred_at: string;
};

export type WarmupTimelineMessage = {
  id: string;
  from_email: string;
  to_email: string;
  subject: string;
  status: string;
  role: string | null;
  placement: string | null;
  provider_message_id: string | null;
  attempts: number;
  error: string | null;
  scheduled_at: string | null;
  processed_at: string | null;
  received_at: string | null;
  placement_checked_at: string | null;
  created_at: string;
  events: WarmupTimelineEvent[];
};

/**
 * Per-message warmup run timeline. Every row is a real warmup job (created by
 * the warmup engine only) together with the provider/inbound events recorded
 * against it, so a single message can be traced from queued → sent → delivered
 * → placement → bounce/reply.
 */
export const getWarmupTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        accountId: z.string().uuid().optional(),
        status: z.enum(["all", "pending", "sent", "failed", "bounced", "replied"]).default("all"),
        limit: z.number().int().min(10).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;

    let query = client
      .from("warmup_jobs")
      .select(
        "id, from_email, to_email, subject, status, role, placement, provider_message_id, attempts, error, scheduled_at, processed_at, received_at, placement_checked_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.accountId) query = query.eq("sending_account_id", data.accountId);
    if (data.status !== "all") query = query.eq("status", data.status);

    const { data: jobs, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (jobs ?? []) as Array<Omit<WarmupTimelineMessage, "events">>;
    if (rows.length === 0) return { messages: [] as WarmupTimelineMessage[] };

    const { data: events, error: eventsError } = await client
      .from("warmup_events")
      .select("id, job_id, type, detail, provider, occurred_at")
      .in(
        "job_id",
        rows.map((row) => row.id),
      )
      .order("occurred_at", { ascending: true });
    if (eventsError) throw new Error(eventsError.message);

    const byJob = new Map<string, WarmupTimelineEvent[]>();
    for (const raw of (events ?? []) as Array<WarmupTimelineEvent & { job_id: string }>) {
      const list = byJob.get(raw.job_id) ?? [];
      list.push({
        id: raw.id,
        type: raw.type,
        detail: raw.detail,
        provider: raw.provider,
        occurred_at: raw.occurred_at,
      });
      byJob.set(raw.job_id, list);
    }

    return {
      messages: rows.map((row) => ({ ...row, events: byJob.get(row.id) ?? [] })),
    };
  });

/**
 * Runs the production warmup pipeline for a single mailbox right now.
 *
 * Same scheduler, same provider abstraction, same metering as the cron runner —
 * it only bypasses the time-of-day window so the flow can be verified without
 * waiting. Daily targets and plan allowances still cap it, so repeated runs
 * cannot exceed the mailbox limit.
 */
export const runWarmupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ accountId: z.string().uuid(), max: z.number().int().min(1).max(10).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // RLS proves the caller may touch this mailbox before we escalate.
    const { data: account, error } = await client
      .from("sending_accounts")
      .select("id, workspace_id, from_email")
      .eq("id", data.accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) throw new Error("Mailbox not found");

    // A mailbox the customer paused (mailboxes.is_active = false) may not send
    // anything at all, warmup included. Refuse up front with the real reason.
    const { isMailboxPaused, PAUSED_MAILBOX_MESSAGE } = await import(
      "@/lib/mailbox-active.server"
    );
    if (
      await isMailboxPaused(client, account.workspace_id as string, account.from_email as string)
    ) {
      throw new Error(PAUSED_MAILBOX_MESSAGE);
    }

    const { requireWarmup } = await import("@/lib/billing/gates.server");
    await requireWarmup(account.workspace_id as string);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runWarmupForAccount } = await import("@/lib/warmup-engine.server");
    const result = await runWarmupForAccount(supabaseAdmin, data.accountId, {
      max: data.max ?? 1,
    });

    return {
      ok: result.sent > 0,
      sent: result.sent,
      scheduled: result.scheduled,
      failed: result.failed,
      reason: result.reason,
      errors: result.errors,
    };
  });
