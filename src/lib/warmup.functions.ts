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
        .select("sending_account_id, target, sent, delivered, bounced, replied")
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
        .select("day, target, scheduled, sent, delivered, bounced, complained, failed, replied, health_score")
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
          "id, role, status, to_email, subject, scheduled_at, processed_at, attempts, provider, provider_message_id, error",
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

/** Open authentication alerts across the caller's domains. */
export const listDomainAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as Client)
      .from("domain_alerts")
      .select("id, domain_id, kind, severity, title, detail, records, resolved_at, created_at, sending_domains(domain)")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return {
      alerts: ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...row,
        domain: (row["sending_domains"] as { domain?: string } | null)?.domain ?? null,
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
