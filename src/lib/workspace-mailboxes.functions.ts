/**
 * The customer-facing Mailboxes page (/mailboxes).
 *
 * Read-mostly view over the EXISTING data: the `mailboxes` table (mailboxes the
 * customer connected with their own SMTP/IMAP credentials), enriched with the
 * real sending/warmup/authentication state already recorded for that address in
 * `sending_accounts`, `warmup_settings` and `campaign_messages`.
 *
 * Nothing is invented here: any value the database does not hold is returned as
 * null and rendered as "not available". No new tables, no scheduler, queue,
 * routing, pacing or warmup logic is touched.
 *
 * Search, filtering, sorting and pagination all happen server-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mailboxWindowStart, storedSentToday } from "@/lib/mailbox-daily-usage";
import { mailboxReplyToSchema } from "@/lib/mailbox-reply-to";
import { PROGRESSION_COLUMNS, resolveWarmupProgression, type ProgressionSettings } from "@/lib/warmup-progression";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type MailboxCampaignRef = {
  id: string;
  name: string;
  /** draft | scheduled | active | paused | completed | archived — the real value. */
  status: string;
  /** Messages still queued for this mailbox on that campaign, or null if unknown. */
  queued: number | null;
};

export type WorkspaceMailboxRow = {
  warmupDay?: number;
  warmupStage?: number;
  warmupMode?: string;
  warmupSentToday?: number;
  warmupNextLimit?: number;
  id: string;
  email: string;
  displayName: string | null;
  replyTo: string | null;
  /** pending | connected | failed — straight from the row. */
  status: string;
  /** The customer's own pause switch (`mailboxes.is_active`). */
  isActive: boolean;
  smtpHost: string | null;
  imapHost: string | null;
  dailySendLimit: number;
  warmupEnabledFlag: boolean;
  lastTestedAt: string | null;
  createdAt: string;
  /** Real campaigns whose sending pool includes this mailbox's address. */
  campaigns: MailboxCampaignRef[];


  /** Everything below comes from the sending record for this same address. */
  sendingAccountId: string | null;
  paused: boolean | null;
  customerEnabled: boolean | null;
  healthScore: number | null;
  hourlyLimit: number | null;
  sentThisHour: number | null;
  dailyLimit: number | null;
  sentToday: number | null;
  lastSentAt: string | null;
  warmupStatus: string | null;
  warmupDailyTarget: number | null;
  warmupEnabled: boolean | null;
  warmupPauseReason: string | null;
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  mx: string | null;

  /**
   * Verdict from the last independent DNS check of this mailbox's OWN domain
   * (pass | warn | fail | unchecked). Null until the check has been deployed
   * and has run for this mailbox.
   */
  authStatus: string | null;
  authReason: string | null;
  authCheckedAt: string | null;
};

export type WorkspaceMailboxSummary = {
  /** Every self-connected mailbox in the workspace, whatever its state. */
  total: number;
  /** status = connected AND is_active — the mailboxes that can actually send. */
  usable: number;
  /** Connected but paused by the customer. */
  paused: number;
  pending: number;
  failed: number;
};

export type WorkspaceMailboxPage = {
  rows: WorkspaceMailboxRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Older addresses on file that have no self-connected mailbox yet. */
  legacyCount: number;
  summary: WorkspaceMailboxSummary;
};

const listInput = z.object({
  workspaceId: z.string().uuid(),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]).default(25),
  search: z.string().trim().max(200).default(""),
  status: z.enum(["all", "connected", "pending", "failed"]).default("all"),
  warmup: z.enum(["all", "enabled", "disabled"]).default("all"),
  active: z.enum(["all", "active", "inactive"]).default("all"),
});

/** PostgREST `or()` is comma/parenthesis delimited, so those are stripped. */
function safeSearch(term: string): string {
  return term.replace(/[%,()*]/g, " ").trim();
}

export const listWorkspaceMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<WorkspaceMailboxPage> => {
    const client = context.supabase as Client;

    // RLS (`is_workspace_member`) is the workspace isolation boundary: a caller
    // can never read another workspace's mailboxes through this client.
    let query = client
      .from("mailboxes")
      .select(
        "id, email_address, display_name, smtp_host, imap_host, status, is_active, daily_send_limit, warmup_enabled, last_tested_at, created_at",
        { count: "exact" },
      )
      .eq("workspace_id", data.workspaceId);

    const term = safeSearch(data.search);
    if (term) {
      query = query.or(`email_address.ilike.%${term}%,display_name.ilike.%${term}%`);
    }
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.warmup !== "all") query = query.eq("warmup_enabled", data.warmup === "enabled");
    if (data.active !== "all") query = query.eq("is_active", data.active === "active");

    const from = (data.page - 1) * data.pageSize;
    const {
      data: pageRows,
      count,
      error,
    } = await query.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    type MailboxRecord = {
      id: string;
      email_address: string;
      display_name: string | null;
      smtp_host: string | null;
      imap_host: string | null;
      status: string;
      is_active: boolean | null;
      daily_send_limit: number | null;
      warmup_enabled: boolean | null;
      last_tested_at: string | null;
      created_at: string;
    };
    const mailboxes = (pageRows ?? []) as MailboxRecord[];
    const emails = mailboxes.map((row) => row.email_address);

    // Only the addresses on this page are enriched — never the whole workspace.
    const { data: accountRows } = emails.length
      ? await client
          .from("sending_accounts")
          .select(
            "id, from_email, from_name, reply_to, paused, customer_enabled, health_score, hourly_limit, daily_limit, sent_today, last_sent_at, warmup_status, warmup_daily_target, spf_status, dkim_status, dmarc_status, mx_status",
          )
          .eq("workspace_id", data.workspaceId)
          .in("from_email", emails)
      : { data: [] };

    type AccountRecord = {
      id: string;
      from_email: string;
      from_name: string | null;
      reply_to: string | null;
      paused: boolean | null;
      customer_enabled: boolean | null;
      health_score: number | null;
      hourly_limit: number | null;
      daily_limit: number | null;
      sent_today: number | null;
      last_sent_at: string | null;
      warmup_status: string | null;
      warmup_daily_target: number | null;
      spf_status: string | null;
      dkim_status: string | null;
      dmarc_status: string | null;
      mx_status: string | null;
    };
    const accounts = (accountRows ?? []) as AccountRecord[];
    const byEmail = new Map(accounts.map((row) => [row.from_email.toLowerCase(), row]));
    const accountIds = accounts.map((row) => row.id);

    // Real warmup state lives in warmup_settings, keyed by sending account.
    const { data: warmupRows, error: warmupError } = accountIds.length
      ? await client
          .from("warmup_settings")
          .select("sending_account_id, enabled, max_volume, paused_by_system, pause_reason, started_at, current_volume, ramp_stage, " + PROGRESSION_COLUMNS)
          .in("sending_account_id", accountIds)
      : { data: [], error: null };
    if (warmupError) throw new Error("Warmup progression requires the database upgrade before mailbox details can be displayed.");
    type WarmupRecord = ProgressionSettings & {
      sending_account_id: string;
      enabled: boolean | null;
      max_volume: number | null;
      current_volume: number | null;
      ramp_stage: string | null;

      paused_by_system: boolean | null;
      pause_reason: string | null;
    };
    const warmupByAccount = new Map(
      ((warmupRows ?? []) as WarmupRecord[]).map((row) => [row.sending_account_id, row]),
    );
    const { data: warmupStats } = accountIds.length ? await client.from("warmup_daily_stats")
      .select("sending_account_id, sent, target").in("sending_account_id", accountIds).eq("day", new Date().toISOString().slice(0, 10)) : { data: [] };
    const warmupStatsById = new Map<string, { sent: number; target: number }>((warmupStats ?? []).map((s: { sending_account_id: string; sent: number; target: number }) => [s.sending_account_id, s]));

    // Sends in the last hour, counted exactly the way dispatch counts them.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: hourlyRows } = accountIds.length
      ? await client
          .from("campaign_messages")
          .select("sending_account_id")
          .eq("status", "sent")
          .gte("sent_at", hourAgo)
          .in("sending_account_id", accountIds)
          .limit(5000)
      : { data: [] };
    const sentThisHour = new Map<string, number>();
    for (const row of (hourlyRows ?? []) as Array<{ sending_account_id: string | null }>) {
      if (!row.sending_account_id) continue;
      sentThisHour.set(row.sending_account_id, (sentThisHour.get(row.sending_account_id) ?? 0) + 1);
    }

    // Real campaign usage: a campaign uses this mailbox when its sending pool
    // (campaigns.sending_account_ids) contains the mailbox's sending account.
    const campaignsByAccount = await loadCampaignUsage(client, data.workspaceId, accountIds);

    // Authentication verdicts are read separately so the whole listing still
    // works before the additive auth columns are deployed.
    const authByMailbox = new Map<
      string,
      { auth_status: string | null; auth_reason: string | null; auth_checked_at: string | null }
    >();
    if (mailboxes.length > 0) {
      const { data: authRows } = await client
        .from("mailboxes")
        .select("id, auth_status, auth_reason, auth_checked_at")
        .in(
          "id",
          mailboxes.map((row) => row.id),
        );
      for (const authRow of (authRows ?? []) as Array<{
        id: string;
        auth_status: string | null;
        auth_reason: string | null;
        auth_checked_at: string | null;
      }>) {
        authByMailbox.set(authRow.id, {
          auth_status: authRow.auth_status ?? null,
          auth_reason: authRow.auth_reason ?? null,
          auth_checked_at: authRow.auth_checked_at ?? null,
        });
      }
    }

    const dayStart = mailboxWindowStart();
    const rows: WorkspaceMailboxRow[] = mailboxes.map((row) => {
      const account = byEmail.get(row.email_address.toLowerCase()) ?? null;
      const warmup = account ? warmupByAccount.get(account.id) ?? null : null;
      const progression = resolveWarmupProgression(warmup ?? {}, !row.is_active || !warmup?.enabled || !!warmup.paused_by_system || warmup.ramp_stage === "recovery" || !!account?.paused || account?.customer_enabled === false || (account?.health_score !== null && account?.health_score !== undefined && account.health_score < 70));
      const automatic = warmup?.progression_mode && warmup.progression_mode !== "legacy";
      const warmupStat = account ? warmupStatsById.get(account.id) : undefined;
      const auth = authByMailbox.get(row.id) ?? null;
      return {
        id: row.id,
        email: row.email_address,
        displayName: row.display_name ?? account?.from_name ?? null,
        replyTo: account?.reply_to ?? null,
        status: row.status,
        isActive: row.is_active !== false,
        smtpHost: row.smtp_host ?? null,
        imapHost: row.imap_host ?? null,
        dailySendLimit: row.daily_send_limit ?? 0,
        warmupEnabledFlag: row.warmup_enabled === true,
        lastTestedAt: row.last_tested_at ?? null,
        createdAt: row.created_at,
        campaigns: account ? campaignsByAccount.get(account.id) ?? [] : [],

        sendingAccountId: account?.id ?? null,
        paused: account ? account.paused === true : null,
        customerEnabled: account ? account.customer_enabled !== false : null,
        healthScore: account?.health_score ?? null,
        hourlyLimit: account?.hourly_limit ?? null,
        sentThisHour: account ? sentThisHour.get(account.id) ?? 0 : null,
        dailyLimit: account?.daily_limit ?? null,
        sentToday: account
          ? storedSentToday({ sent_today: account.sent_today, last_sent_at: account.last_sent_at }, dayStart)
          : null,
        lastSentAt: account?.last_sent_at ?? null,
        warmupStatus: account?.warmup_status ?? null,
        warmupDailyTarget: automatic ? progression.effectiveLimit : warmupStat?.target ?? warmup?.current_volume ?? account?.warmup_daily_target ?? null,
        warmupDay: progression.day,
        warmupStage: progression.stage,
        warmupMode: warmup?.progression_mode ?? "legacy",
        warmupSentToday: warmupStat?.sent ?? 0,
        warmupNextLimit: progression.nextLimit,
        warmupEnabled: warmup ? warmup.enabled === true : row.warmup_enabled === true,
        warmupPauseReason: warmup?.paused_by_system ? warmup.pause_reason ?? null : null,
        spf: account?.spf_status ?? null,
        dkim: account?.dkim_status ?? null,
        dmarc: account?.dmarc_status ?? null,
        mx: account?.mx_status ?? null,
        authStatus: auth?.auth_status ?? null,
        authReason: auth?.auth_reason ?? null,
        authCheckedAt: auth?.auth_checked_at ?? null,
      };
    });

    // How many older addresses are on file without a self-connected mailbox.
    // Bounded read: only the address column, capped.
    const { data: legacyRows } = await client
      .from("sending_accounts")
      .select("from_email")
      .eq("workspace_id", data.workspaceId)
      .limit(500);
    const { data: allMailboxes } = await client
      .from("mailboxes")
      .select("email_address, status, is_active")
      .eq("workspace_id", data.workspaceId)
      .limit(2000);
    type SummaryRecord = { email_address: string; status: string; is_active: boolean | null };
    const everyMailbox = (allMailboxes ?? []) as SummaryRecord[];
    const connected = new Set(everyMailbox.map((row) => row.email_address.toLowerCase()));
    const legacyCount = ((legacyRows ?? []) as Array<{ from_email: string | null }>).filter(
      (row) => row.from_email && !connected.has(row.from_email.toLowerCase()),
    ).length;

    // Header counts describe the whole workspace, not just the current page.
    const summary: WorkspaceMailboxSummary = {
      total: everyMailbox.length,
      usable: everyMailbox.filter((row) => row.status === "connected" && row.is_active !== false)
        .length,
      paused: everyMailbox.filter((row) => row.status === "connected" && row.is_active === false)
        .length,
      pending: everyMailbox.filter((row) => row.status === "pending").length,
      failed: everyMailbox.filter((row) => row.status === "failed").length,
    };

    return {
      rows,
      total: count ?? rows.length,
      page: data.page,
      pageSize: data.pageSize,
      legacyCount,
      summary,
    };
  });

/**
 * Campaigns that use each of these sending accounts, with the number of
 * messages still queued for that account on that campaign. Real data only:
 * campaigns come from `campaigns.sending_account_ids`, queued volume from
 * `campaign_messages`. Returns an empty map when there is nothing to look up.
 */
async function loadCampaignUsage(
  client: Client,
  workspaceId: string,
  accountIds: string[],
): Promise<Map<string, MailboxCampaignRef[]>> {
  const byAccount = new Map<string, MailboxCampaignRef[]>();
  if (accountIds.length === 0) return byAccount;

  const { data: campaignRows } = await client
    .from("campaigns")
    .select("id, name, status, sending_account_ids")
    .eq("workspace_id", workspaceId)
    .overlaps("sending_account_ids", accountIds)
    .order("created_at", { ascending: false })
    .limit(500);
  type CampaignRecord = {
    id: string;
    name: string | null;
    status: string | null;
    sending_account_ids: string[] | null;
  };
  const campaigns = (campaignRows ?? []) as CampaignRecord[];
  if (campaigns.length === 0) return byAccount;

  // Queued volume per (campaign, account), counted from the real queue.
  const { data: queuedRows } = await client
    .from("campaign_messages")
    .select("campaign_id, sending_account_id")
    .eq("workspace_id", workspaceId)
    .in("status", ["pending", "scheduled"])
    .in("sending_account_id", accountIds)
    .limit(10000);
  const queued = new Map<string, number>();
  for (const row of (queuedRows ?? []) as Array<{
    campaign_id: string | null;
    sending_account_id: string | null;
  }>) {
    if (!row.campaign_id || !row.sending_account_id) continue;
    const key = `${row.campaign_id}:${row.sending_account_id}`;
    queued.set(key, (queued.get(key) ?? 0) + 1);
  }

  for (const campaign of campaigns) {
    for (const accountId of campaign.sending_account_ids ?? []) {
      if (!accountIds.includes(accountId)) continue;
      const list = byAccount.get(accountId) ?? [];
      list.push({
        id: campaign.id,
        name: campaign.name ?? "Untitled campaign",
        status: campaign.status ?? "draft",
        queued: queued.get(`${campaign.id}:${accountId}`) ?? 0,
      });
      byAccount.set(accountId, list);
    }
  }
  return byAccount;
}

/**
 * Re-tests a saved mailbox with its stored credentials through the existing
 * mailbox-smtp-relay, and records the real result on the row.
 */
export const recheckWorkspaceMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // RLS proves membership first. The member-scoped client only ever reads
    // non-credential columns; login details are read server-side afterwards.
    const { data: member, error } = await client
      .from("mailboxes")
      .select("id, workspace_id, email_address")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!member) throw new Error("Mailbox not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: credError } = await supabaseAdmin
      .from("mailboxes")
      .select(
        "id, workspace_id, email_address, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password, imap_host, imap_port, imap_secure, imap_username, imap_password",
      )
      .eq("id", member.id)
      .maybeSingle();
    if (credError) throw new Error(credError.message);
    if (!row) throw new Error("Mailbox not found");
    if (!row.smtp_host || !row.imap_host) {
      throw new Error("This mailbox has no saved server details to re-check.");
    }

    const readSecret = async (id: string | null) => {
      if (!id) return null;
      const { data: value } = await supabaseAdmin.rpc("mailbox_read_secret", { _id: id });
      return value ? String(value) : null;
    };
    const smtpPassword = await readSecret(row.smtp_password as string | null);
    const imapPassword = await readSecret(row.imap_password as string | null);
    if (!smtpPassword || !imapPassword) {
      throw new Error("The saved passwords could not be read. Reconnect this mailbox.");
    }

    const { relayTestMailboxEndpoints } = await import("@/lib/mailbox-relay.server");
    const result = await relayTestMailboxEndpoints(
      {
        host: row.smtp_host as string,
        port: row.smtp_port as number,
        security: row.smtp_secure ? "ssl" : "tls",
        username: row.smtp_username as string,
        password: smtpPassword,
      },
      {
        host: row.imap_host as string,
        port: row.imap_port as number,
        security: row.imap_secure ? "ssl" : "tls",
        username: row.imap_username as string,
        password: imapPassword,
      },
    );

    const { error: saveError } = await client
      .from("mailboxes")
      .update({
        status: result.ok ? "connected" : "failed",
        last_tested_at: result.testedAt,
      })
      .eq("id", data.id);
    if (result.ok && !saveError) {
      const { notifyOnboardingAction } = await import("@/lib/engagement-notices.server");
      await notifyOnboardingAction(supabaseAdmin, member.workspace_id, "onboarding.mailbox_ready");
    }

    return {
      ok: result.ok,
      smtp: result.smtp,
      imap: result.imap,
      status: result.ok ? "connected" : "failed",
    };
  });

/**
 * Turns the customer's own pause switch (`mailboxes.is_active`) on or off for
 * one or more of their mailboxes. Independent of `status`: a connected mailbox
 * can be paused, and reactivating it does not re-test the connection.
 *
 * Nothing else on the row is touched, and no scheduling, pacing or warmup
 * setting is changed — enforcement happens at send time.
 */
export const setWorkspaceMailboxActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(200), active: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // RLS is the isolation boundary: rows in other workspaces simply don't match.
    const { data: updated, error } = await client
      .from("mailboxes")
      .update({ is_active: data.active, updated_at: new Date().toISOString() })
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    return { updated: ((updated ?? []) as Array<{ id: string }>).length, active: data.active };
  });

/**
 * Saves the sender name shown next to this mailbox's address in the recipient's
 * inbox. Name only: no credential, limit, pacing or status is touched, and
 * clearing it simply sends from the bare email address again.
 */
export const setWorkspaceMailboxSenderName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), displayName: z.string().trim().max(120) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // RLS keeps this to the caller's own workspace.
    const { data: updated, error } = await client
      .from("mailboxes")
      .update({
        display_name: data.displayName === "" ? null : data.displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id, display_name");
    if (error) throw new Error(error.message);
    const row = (updated ?? [])[0] as { display_name: string | null } | undefined;
    if (!row) throw new Error("That mailbox could not be found.");
    return { displayName: row.display_name };
  });

/** RLS-backed update to the existing one-per-address sending record. */
export const setWorkspaceMailboxReplyTo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), replyTo: mailboxReplyToSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: mailbox, error: readError } = await client.from("mailboxes")
      .select("id, workspace_id, email_address").eq("id", data.id).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!mailbox) throw new Error("That mailbox could not be found.");
    const { data: updated, error } = await client.from("sending_accounts")
      .update({ reply_to: data.replyTo || null })
      .eq("workspace_id", mailbox.workspace_id).eq("from_email", mailbox.email_address)
      .select("id, reply_to").maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("You cannot change this mailbox, or its sending account is not ready yet.");
    const { data: receiver } = data.replyTo ? await client.from("mailboxes")
      .select("id").eq("workspace_id", mailbox.workspace_id).eq("email_address", data.replyTo)
      .eq("status", "connected").eq("is_active", true).maybeSingle() : { data: null };
    return { replyTo: updated.reply_to as string | null, receivingMailboxConnected: !data.replyTo || Boolean(receiver) };
  });

export type MailboxDeletionCheck = {
  mailboxId: string;
  email: string;
  /** Campaigns whose sending pool still contains this mailbox. */
  campaigns: MailboxCampaignRef[];
  /** Messages still queued for this mailbox across all campaigns. */
  queued: number;
  warmupEnabled: boolean;
  conversations: number;
  canDelete: boolean;
  /** Plain-language reason when deletion is blocked. */
  blockedReason: string | null;
};

/** Shared dependency lookup used by both the confirmation modal and the delete itself. */
async function inspectMailboxForDeletion(
  client: Client,
  mailboxId: string,
): Promise<MailboxDeletionCheck> {
  const { data: row, error } = await client
    .from("mailboxes")
    .select("id, workspace_id, email_address")
    .eq("id", mailboxId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Mailbox not found");

  const workspaceId = row.workspace_id as string;
  const email = (row.email_address as string).toLowerCase();

  const { data: accountRows } = await client
    .from("sending_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("from_email", email);
  const accountIds = ((accountRows ?? []) as Array<{ id: string }>).map((account) => account.id);

  const usage = await loadCampaignUsage(client, workspaceId, accountIds);
  const campaigns: MailboxCampaignRef[] = [];
  for (const list of usage.values()) campaigns.push(...list);

  const queued = campaigns.reduce((total, campaign) => total + (campaign.queued ?? 0), 0);

  let warmupEnabled = false;
  if (accountIds.length > 0) {
    const { data: warmupRows } = await client
      .from("warmup_settings")
      .select("enabled")
      .in("sending_account_id", accountIds);
    warmupEnabled = ((warmupRows ?? []) as Array<{ enabled: boolean | null }>).some(
      (settings) => settings.enabled === true,
    );
  }

  let conversations = 0;
  if (accountIds.length > 0) {
    const { count } = await client
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("sending_account_id", accountIds);
    conversations = count ?? 0;
  }

  const live = campaigns.filter((campaign) =>
    ["active", "scheduled", "paused"].includes(campaign.status),
  );
  const blockedReason =
    live.length > 0
      ? "This mailbox is still assigned to campaigns. Remove it from those campaigns first, or pause it instead of deleting it."
      : queued > 0
        ? "Messages are still queued for this mailbox. Wait for the queue to clear or remove it from those campaigns first."
        : null;

  return {
    mailboxId,
    email: row.email_address as string,
    campaigns,
    queued,
    warmupEnabled,
    conversations,
    canDelete: blockedReason === null,
    blockedReason,
  };
}

/** Read-only dependency report shown in the delete confirmation modal. */
export const checkWorkspaceMailboxDeletion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<MailboxDeletionCheck> =>
    inspectMailboxForDeletion(context.supabase as Client, data.id),
  );

/**
 * Removes a self-connected mailbox. Only the `mailboxes` row is deleted: the
 * sending record, campaign history, conversations and warmup history are all
 * left exactly as they are. Refuses while live campaigns or a queue still
 * depend on it, so nothing breaks silently.
 */
export const deleteWorkspaceMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // Re-checked server-side: the modal's answer is never trusted.
    const check = await inspectMailboxForDeletion(client, data.id);
    if (!check.canDelete) throw new Error(check.blockedReason as string);

    const { error } = await client.from("mailboxes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, email: check.email };
  });

/**
 * Sends a one-off test email THROUGH THIS MAILBOX ONLY, using its own stored
 * SMTP credentials via the existing mailbox-smtp-relay. It never falls back to
 * another mailbox or provider, and it writes no campaign message row, so
 * campaign analytics and sending statistics are untouched.
 */
export const sendWorkspaceMailboxTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        to: z.string().trim().email(),
        subject: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // RLS proves membership before any credential is read.
    const { data: row, error } = await client
      .from("mailboxes")
      .select("id, workspace_id, email_address, display_name, status, is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Mailbox not found");

    if (row.is_active === false) {
      const { PAUSED_MAILBOX_MESSAGE } = await import("@/lib/mailbox-active.server");
      throw new Error(PAUSED_MAILBOX_MESSAGE);
    }
    if (row.status !== "connected") {
      throw new Error(
        row.status === "failed"
          ? "This mailbox's last connection check failed, so a test cannot be sent. Re-check the connection first."
          : "This mailbox is not connected yet, so a test cannot be sent. Re-check the connection first.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { findCustomerMailbox, sendViaCustomerMailbox } = await import(
      "@/lib/customer-mailbox-send.server"
    );
    const mailbox = await findCustomerMailbox(
      supabaseAdmin,
      row.workspace_id as string,
      row.email_address as string,
    );
    if (!mailbox) {
      throw new Error(
        "This mailbox has no usable saved server details. Reconnect it, then send the test again.",
      );
    }

    const result = await sendViaCustomerMailbox(supabaseAdmin, mailbox, {
      to: data.to,
      subject: data.subject,
      text: data.body,
      fromName: (row.display_name as string | null) ?? null,
      // Marks the message as a mailbox test so it is never mistaken for campaign traffic.
      headers: { "X-MunchReach-Mailbox-Test": "1" },
    });

    await client
      .from("mailboxes")
      .update({ last_tested_at: new Date().toISOString() })
      .eq("id", data.id);

    if (!result.ok) throw new Error(result.message);
    return { ok: true, messageId: result.messageId, message: result.message };
  });

/**
 * Turns warm-up on or off for a self-connected mailbox.
 *
 * Eligibility is simply `status = 'connected'` AND `is_active = true`: in the
 * current architecture a connected mailbox is by definition ready to send, so
 * there is no separate "registered for sending" step for the customer to do.
 *
 * The warm-up engine (settings, jobs, daily stats, health) is keyed to a
 * `sending_accounts` row by `sending_account_id`, so this handler makes sure the
 * bookkeeping row for the mailbox's own address exists before writing the
 * warm-up setting. That row carries no credentials — warm-up still sends
 * through the customer's own mailbox via the relay. Pacing, ramp, safety and
 * auto-pause logic are untouched.
 */
export const setMailboxWarmup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(100), enabled: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // RLS decides which mailboxes the caller may see at all.
    const { data: rows, error } = await client
      .from("mailboxes")
      .select("id, workspace_id, email_address, display_name, status, is_active, daily_send_limit")
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      workspace_id: string;
      email_address: string;
      display_name: string | null;
      status: string;
      is_active: boolean | null;
      daily_send_limit: number | null;
    };
    const mailboxes = (rows ?? []) as Row[];
    if (mailboxes.length === 0) throw new Error("Mailbox not found");
    for (const workspaceId of new Set(mailboxes.map(row => row.workspace_id))) {
      const { data: allowed, error: permissionError } = await client.rpc("has_workspace_role", { _workspace_id: workspaceId, _user_id: context.userId, _roles: ["owner", "admin", "campaign_manager"] });
      if (permissionError || !allowed) throw new Error("You do not have permission to edit warmup settings.");
    }

    // Warmup is a plan feature. Checked per workspace before anything is
    // written, so no route, bulk action or API caller can switch it on without
    // the entitlement.
    if (data.enabled) {
      const { requireWarmup } = await import("@/lib/billing/gates.server");
      for (const workspaceId of new Set(mailboxes.map((row) => row.workspace_id))) {
        await requireWarmup(workspaceId);
      }
    }

    if (data.enabled) {
      const unusable = mailboxes.filter(
        (row) => row.status !== "connected" || row.is_active === false,
      );
      if (unusable.length === mailboxes.length) {
        const first = unusable[0] as Row;
        if (first.is_active === false) {
          const { PAUSED_MAILBOX_MESSAGE } = await import("@/lib/mailbox-active.server");
          throw new Error(PAUSED_MAILBOX_MESSAGE);
        }
        throw new Error(
          "Warm-up needs a connected mailbox. Re-check the connection first, then turn warm-up on.",
        );
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    let changed = 0;

    for (const row of mailboxes) {
      if (data.enabled && (row.status !== "connected" || row.is_active === false)) continue;

      // Find, or create, the warm-up bookkeeping row for this exact address.
      const { data: existingAccount } = await supabaseAdmin
        .from("sending_accounts")
        .select("id")
        .eq("workspace_id", row.workspace_id)
        .eq("from_email", row.email_address)
        .maybeSingle();

      let accountId = (existingAccount as { id: string } | null)?.id ?? null;

      if (!accountId) {
        if (!data.enabled) continue; // nothing to switch off
        const { data: created, error: createError } = await supabaseAdmin
          .from("sending_accounts")
          .insert({
            workspace_id: row.workspace_id,
            // Self-connected: the credentials live with the mailbox, not here.
            provider: "smtp",
            connection_method: "self_connected",
            label: row.email_address,
            from_name: row.display_name ?? row.email_address.split("@")[0] ?? row.email_address,
            from_email: row.email_address,
            // The connection was proven by the mailbox login test.
            status: "verified",
            customer_enabled: true,
            paused: false,
            ...(row.daily_send_limit ? { daily_limit: row.daily_send_limit } : {}),
          })
          .select("id")
          .single();
        if (createError) throw new Error(createError.message);
        accountId = (created as { id: string }).id;
      }

      const { data: existingSettings } = await supabaseAdmin
        .from("warmup_settings")
        .select("id, started_at")
        .eq("sending_account_id", accountId)
        .maybeSingle();
      const settings = existingSettings as { id: string; started_at: string | null } | null;

      // Delegate existing settings to the same permission/safety-aware action
      // as the dashboard; a list toggle cannot clear an active system pause.
      if (settings) {
        const { saveWarmupSettings } = await import("@/lib/warmup.functions");
        const result = await saveWarmupSettings({ data: { accountId, enabled: data.enabled, resume: data.enabled } });
        if (result.blocked) throw new Error(result.message);
        await supabaseAdmin.from("mailboxes").update({ warmup_enabled: data.enabled, updated_at: now }).eq("id", row.id);
        changed += 1;
        continue;
      }

      const body = {
        enabled: data.enabled,
        paused_by_system: false,
        pause_reason: null,
        started_at: data.enabled ? now : null,
      };

      const { error: writeError } = await supabaseAdmin.from("warmup_settings").insert({
            ...body,
            workspace_id: row.workspace_id,
            sending_account_id: accountId,
          });
      if (writeError) throw new Error(writeError.message);

      // Keep the mailbox row's own flag in step with what the customer sees.
      await supabaseAdmin
        .from("mailboxes")
        .update({ warmup_enabled: data.enabled, updated_at: now })
        .eq("id", row.id);

      changed += 1;
    }

    return { changed, enabled: data.enabled };
  });
