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
  id: string;
  email: string;
  displayName: string | null;
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
            "id, from_email, from_name, paused, customer_enabled, health_score, hourly_limit, daily_limit, sent_today, last_sent_at, warmup_status, warmup_daily_target, spf_status, dkim_status, dmarc_status, mx_status",
          )
          .eq("workspace_id", data.workspaceId)
          .in("from_email", emails)
      : { data: [] };

    type AccountRecord = {
      id: string;
      from_email: string;
      from_name: string | null;
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
    const { data: warmupRows } = accountIds.length
      ? await client
          .from("warmup_settings")
          .select("sending_account_id, enabled, daily_target, paused_by_system, pause_reason")
          .in("sending_account_id", accountIds)
      : { data: [] };
    type WarmupRecord = {
      sending_account_id: string;
      enabled: boolean | null;
      daily_target: number | null;
      paused_by_system: boolean | null;
      pause_reason: string | null;
    };
    const warmupByAccount = new Map(
      ((warmupRows ?? []) as WarmupRecord[]).map((row) => [row.sending_account_id, row]),
    );

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

    const dayStart = mailboxWindowStart();
    const rows: WorkspaceMailboxRow[] = mailboxes.map((row) => {
      const account = byEmail.get(row.email_address.toLowerCase()) ?? null;
      const warmup = account ? warmupByAccount.get(account.id) ?? null : null;
      return {
        id: row.id,
        email: row.email_address,
        displayName: row.display_name ?? account?.from_name ?? null,
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
        warmupDailyTarget: warmup?.daily_target ?? account?.warmup_daily_target ?? null,
        warmupEnabled: warmup ? warmup.enabled === true : null,
        warmupPauseReason: warmup?.paused_by_system ? warmup.pause_reason ?? null : null,
        spf: account?.spf_status ?? null,
        dkim: account?.dkim_status ?? null,
        dmarc: account?.dmarc_status ?? null,
        mx: account?.mx_status ?? null,
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
    // RLS proves membership before any credential is read.
    const { data: row, error } = await client
      .from("mailboxes")
      .select(
        "id, workspace_id, email_address, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password, imap_host, imap_port, imap_secure, imap_username, imap_password",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Mailbox not found");
    if (!row.smtp_host || !row.imap_host) {
      throw new Error("This mailbox has no saved server details to re-check.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

    await client
      .from("mailboxes")
      .update({
        status: result.ok ? "connected" : "failed",
        last_tested_at: result.testedAt,
      })
      .eq("id", data.id);

    return {
      ok: result.ok,
      smtp: result.smtp,
      imap: result.imap,
      status: result.ok ? "connected" : "failed",
    };
  });
