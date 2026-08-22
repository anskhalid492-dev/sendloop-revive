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
import { WARMUP_MODES } from "@/lib/warmup-model";
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
  "id, sending_account_id, enabled, mode, start_volume, max_volume, daily_increase, ramp_days, send_days, send_start_hour, send_end_hour, timezone, reply_rate, max_bounce_rate, min_health_score, auto_pause, paused_by_system, pause_reason, paused_at, started_at";

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
  inbox_today: number;
  spam_today: number;
  bounced_today: number;
  replied_today: number;
  max_volume: number;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
  mx_status: string;
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

    const [{ data: settings }, { data: stats }] = await Promise.all([
      client.from("warmup_settings").select(SETTINGS_COLUMNS).in("sending_account_id", ids),
      client
        .from("warmup_daily_stats")
        .select("sending_account_id, target, sent, delivered, inbox, spam, bounced, replied")
        .in("sending_account_id", ids)
        .eq("day", today),
    ]);

    const settingsById = new Map(
      ((settings ?? []) as Array<Record<string, unknown>>).map((s) => [s["sending_account_id"] as string, s]),
    );
    const statsById = new Map(
      ((stats ?? []) as Array<Record<string, unknown>>).map((s) => [s["sending_account_id"] as string, s]),
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
        sent_today: (stat?.["sent"] as number) ?? 0,
        delivered_today: (stat?.["delivered"] as number) ?? 0,
        inbox_today: (stat?.["inbox"] as number) ?? 0,
        spam_today: (stat?.["spam"] as number) ?? 0,
        bounced_today: (stat?.["bounced"] as number) ?? 0,
        replied_today: (stat?.["replied"] as number) ?? 0,
        max_volume: (setting?.["max_volume"] as number) ?? 0,
        spf_status: a["spf_status"] as string,
        dkim_status: a["dkim_status"] as string,
        dmarc_status: a["dmarc_status"] as string,
        mx_status: a["mx_status"] as string,
      };
    });

    return { accounts: rows };
  });

/** Per-mailbox detail: settings, daily series, health history, recent jobs. */
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

    const [account, settings, stats, health, jobs] = await Promise.all([
      client
        .from("sending_accounts")
        .select(
          "id, from_email, from_name, provider, status, last_error, paused, customer_enabled, health_score, spf_status, dkim_status, dmarc_status, mx_status, last_sent_at, sending_domains(domain)",
        )
        .eq("id", data.id)
        .maybeSingle(),
      client.from("warmup_settings").select(SETTINGS_COLUMNS).eq("sending_account_id", data.id).maybeSingle(),
      client
        .from("warmup_daily_stats")
        .select(
          "day, target, scheduled, sent, delivered, inbox, spam, deferred, rejected, not_received, bounced, complained, failed, replied, health_score",
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
      client
        .from("warmup_jobs")
        .select(
          "id, role, status, placement, received_at, to_email, subject, scheduled_at, processed_at, attempts, provider, provider_message_id, error",
        )
        .eq("sending_account_id", data.id)
        .order("scheduled_at", { ascending: false })
        .limit(25),
    ]);

    if (account.error) throw new Error(account.error.message);
    if (!account.data) throw new Error("Mailbox not found");

    return {
      account: account.data,
      settings: (settings.data ?? null) as WarmupSettings | null,
      stats: (stats.data ?? []) as WarmupDayStat[],
      health: ((health.data ?? [])[0] ?? null) as WarmupHealth | null,
      jobs: (jobs.data ?? []) as WarmupJob[],
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
      .select("id, workspace_id, status")
      .eq("id", accountId)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account) throw new Error("Mailbox not found");

    // Warmup is a plan feature; enforced here so API callers cannot enable it.
    const { requireEntitlement } = await import("@/lib/billing/usage.server");
    await requireEntitlement(account.workspace_id as string, "warmup");

    const { data: existing } = await client
      .from("warmup_settings")
      .select("id, enabled, started_at")
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
    if (resume) {
      body["paused_by_system"] = false;
      body["pause_reason"] = null;
      body["paused_at"] = null;
    }
    if (patch.enabled) {
      body["started_at"] = existing?.started_at ?? new Date().toISOString();
      body["paused_by_system"] = false;
      body["pause_reason"] = null;
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
        warmup_status: patch.enabled === undefined ? undefined : patch.enabled ? "warming" : "not_started",
        ...(patch.enabled ? { warmup_started_at: body["started_at"] } : {}),
      })
      .eq("id", accountId);

    return { ok: true };
  });

/** Bulk enable/disable warmup across selected mailboxes. */
export const bulkSetWarmup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(100), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: accounts, error } = await client
      .from("sending_accounts")
      .select("id, workspace_id")
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const now = new Date().toISOString();
    let changed = 0;
    for (const account of (accounts ?? []) as Array<{ id: string; workspace_id: string }>) {
      const { data: existing } = await client
        .from("warmup_settings")
        .select("id, started_at")
        .eq("sending_account_id", account.id)
        .maybeSingle();
      const body = {
        enabled: data.enabled,
        paused_by_system: false,
        pause_reason: null,
        started_at: data.enabled ? (existing?.started_at ?? now) : existing?.started_at ?? null,
      };
      const { error: writeError } = existing
        ? await client.from("warmup_settings").update(body).eq("id", existing.id)
        : await client
            .from("warmup_settings")
            .insert({ ...body, workspace_id: account.workspace_id, sending_account_id: account.id });
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
    z.object({ id: z.string().uuid(), limit: z.number().int().min(5).max(100).default(25) }).parse(input),
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
    z.object({ id: z.string().uuid(), days: z.number().int().min(7).max(90).default(30) }).parse(input),
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
        .gte("created_at", since),
      client
        .from("campaign_messages")
        .select("status, sent_at")
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
      .select("id, domain_id, kind, severity, title, detail, records, resolved_at, created_at, sending_domains(domain)")
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
            "sending_account_id, day, sent, delivered, inbox, spam, deferred, rejected, not_received, bounced, complained, failed, replied, health_score",
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
    const settingsList = ((settingsRows ?? []) as Array<{
      enabled: boolean | null;
      mode: string | null;
      max_volume: number | null;
      ramp_days: number | null;
      started_at: string | null;
    }>).filter((row) => row.enabled);
    const targetsToday = todayRows
      .map((row) => row.target)
      .filter((value): value is number => typeof value === "number");
    const limits = settingsList
      .map((row) => row.max_volume)
      .filter((value): value is number => typeof value === "number");
    const healthToday = todayRows
      .map((row) => row.health_score)
      .filter((value): value is number => typeof value === "number");
    const startedAt = settingsList
      .map((row) => row.started_at)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
    const rampDays = settingsList
      .map((row) => row.ramp_days)
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => b - a)[0] ?? null;

    const current = {
      sentToday: todayRows.reduce((sum, row) => sum + (row.sent ?? 0), 0),
      targetToday: targetsToday.length
        ? targetsToday.reduce((sum, value) => sum + value, 0)
        : null,
      dailyLimit: limits.length ? limits.reduce((sum, value) => sum + value, 0) : null,
      stage: settingsList.length
        ? (settingsList[0]?.mode ?? null)
        : null,
      stageDay: startedAt
        ? Math.max(
            1,
            Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000) + 1,
          )
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
