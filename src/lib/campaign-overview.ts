/**
 * Pure aggregation for the Campaigns listing table.
 *
 * All numbers come from real rows (recipients, messages, events, replies, CRM stages)
 * so the table never shows synthetic statistics.
 */

import { openRatePercent, replyRatePercent } from "@/lib/engagement-rates";

export type CampaignOverviewAccount = {
  id: string;
  from_email: string;
  from_name: string;
  paused: boolean;
  customer_enabled: boolean;
  status: string;
  warmup_status: string;
  daily_limit?: number | null;
};

export type CampaignOverviewRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  displayStatus: "draft" | "active" | "paused" | "completed" | "failed" | "archived" | "scheduled";
  category: string;
  createdAt: string;
  launchedAt: string | null;
  account: CampaignOverviewAccount | null;
  accountCount: number;
  leads: number;
  sent: number;
  /** Unique people emailed — the base for people-based rates. */
  contacted: number;
  /** Emails accepted for sending minus confirmed bounces. */
  reached: number;
  /** Unique recipients/people with a real open signal. */
  opened: number;
  /** Opened divided by reachable people, using the shared engagement formula. */
  openRate: number;
  /** Bounces (bounced_at set) — never included in `failed`. */
  bounced: number;
  /** Internal send failures only — never includes bounces. */
  failed: number;
  replies: number;
  replyRate: number;
  positiveReplies: number;
  meetings: number;
  /** Customer-chosen campaign daily sending limit (campaigns.daily_cap). */
  dailyCap: number;
  /** Emails this campaign already sent today. */
  sentToday: number;
  /** Combined daily capacity of the mailboxes attached to this campaign. */
  mailboxDailyCapacity: number;
};

type CampaignInput = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  tags: string[] | null;
  created_at: string;
  launched_at: string | null;
  sending_account_ids: string[] | null;
  daily_cap?: number | null;
};

type Inputs = {
  campaigns: CampaignInput[];
  recipients: Array<{ campaign_id: string; lead_id: string | null }>;
  messages: Array<{
    campaign_id: string;
    status: string;
    to_email: string | null;
    recipient_id?: string | null;
    lead_id?: string | null;
    sent_at?: string | null;
    delivered_at?: string | null;
    opened_at?: string | null;
    bounced_at?: string | null;
  }>;
  replies: Array<{ campaign_id: string | null; lead_id: string | null; from_email: string; sentiment: string }>;
  meetings: Array<{ campaign_id: string | null; lead_id: string | null; prospect_email: string; status: string }>;
  accounts: CampaignOverviewAccount[];
};

const MEETING_STATUSES = new Set(["meeting_booked", "meeting_completed"]);

export function accountOnline(account: CampaignOverviewAccount | null): boolean {
  if (!account) return false;
  return !account.paused && account.customer_enabled && account.status !== "failed" && account.status !== "disabled";
}

export function deriveDisplayStatus(
  status: string,
  sent: number,
  failed: number,
): CampaignOverviewRow["displayStatus"] {
  // The database enum has no "failed" state, so a campaign that only produced
  // failed messages is surfaced as Failed instead of silently looking Active.
  if (failed > 0 && sent === 0 && (status === "active" || status === "scheduled")) return "failed";
  switch (status) {
    case "active":
    case "paused":
    case "completed":
    case "archived":
    case "scheduled":
    case "draft":
      return status;
    default:
      return "draft";
  }
}

export function buildCampaignOverview(input: Inputs): CampaignOverviewRow[] {
  const accountById = new Map(input.accounts.map((a) => [a.id, a]));

  return input.campaigns.map((c) => {
    const recipients = input.recipients.filter((r) => r.campaign_id === c.id);
    const messages = input.messages.filter((m) => m.campaign_id === c.id);
    const sent = messages.filter((m) => m.status === "sent" || m.sent_at).length;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const sentToday = messages.filter(
      (m) => m.status === "sent" && m.sent_at && new Date(m.sent_at).getTime() >= dayStart.getTime(),
    ).length;
    // Bounced rows keep status "failed" historically but are identified by
    // bounced_at. They are reported separately and never counted as failed.
    const bounced = messages.filter((m) => m.bounced_at != null).length;
    const failed = messages.filter((m) => m.status === "failed" && m.bounced_at == null).length;
    const confirmedDelivered = messages.filter((m) => m.delivered_at != null && m.bounced_at == null).length;
    const opened = new Set(
      messages
        .filter((m) => m.opened_at != null)
        .map((m) => m.recipient_id ?? m.lead_id ?? m.to_email?.toLowerCase() ?? `${c.id}:open`),
    ).size;
    // Unique people emailed: the rate base, so multi-step sequences never
    // dilute open/reply rates (one person, three steps = one contact).
    const contacted = new Set(
      messages
        .filter((m) => m.status === "sent" || m.sent_at)
        .map((m) => m.recipient_id ?? m.lead_id ?? m.to_email?.toLowerCase() ?? `${c.id}:sent`),
    ).size;
    const reached = Math.max(confirmedDelivered, messages.filter((m) => (m.status === "sent" || m.sent_at) && m.bounced_at == null).length);

    const replyKeys = new Set(
      input.replies
        .filter((r) => r.campaign_id === c.id)
        .map((r) => r.lead_id ?? r.from_email.toLowerCase()),
    );
    const positiveKeys = new Set(
      input.replies
        .filter((r) => r.campaign_id === c.id && r.sentiment === "positive")
        .map((r) => r.lead_id ?? r.from_email.toLowerCase()),
    );
    const meetingKeys = new Set(
      input.meetings
        .filter((m) => m.campaign_id === c.id && MEETING_STATUSES.has(m.status))
        .map((m) => m.lead_id ?? m.prospect_email.toLowerCase()),
    );

    const accountId = (c.sending_account_ids ?? [])[0];
    const account = accountId ? (accountById.get(accountId) ?? null) : null;

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      status: c.status,
      displayStatus: deriveDisplayStatus(c.status, sent, failed),
      category: (c.tags ?? []).filter(Boolean).join(" / "),
      createdAt: c.created_at,
      launchedAt: c.launched_at,
      account,
      accountCount: (c.sending_account_ids ?? []).length,
      leads: recipients.length,
      sent,
      contacted,
      reached,
      opened,
      openRate: openRatePercent(opened, { contacted, bounced }),
      bounced,
      failed,
      replies: replyKeys.size,
      replyRate: replyRatePercent(replyKeys.size, { contacted, bounced }),
      positiveReplies: positiveKeys.size,
      meetings: meetingKeys.size,
      dailyCap: Number(c.daily_cap ?? 0),
      sentToday,
      mailboxDailyCapacity: (c.sending_account_ids ?? []).reduce(
        (sum, id) => sum + Number(accountById.get(id)?.daily_limit ?? 0),
        0,
      ),
    };
  });
}

/** Per-campaign totals aggregated by `campaign_overview_rollup` in Postgres. */
export type CampaignRollupRow = {
  campaign_id: string;
  leads?: number | null;
  sent?: number | null;
  /** Unique people emailed; older rollups may not return it. */
  contacted?: number | null;
  sent_today?: number | null;
  delivered?: number | null;
  reached?: number | null;
  opened?: number | null;
  bounced?: number | null;
  failed?: number | null;
  replies?: number | null;
  replied?: number | null;
  positive_replies?: number | null;
  positive_replied?: number | null;
  meetings?: number | null;
};

/**
 * Overlay database-side aggregates onto the listing rows.
 *
 * The listing never downloads recipients or messages, so these numbers are the
 * authoritative ones: a campaign with 10,000 leads costs the same as one with
 * ten.
 */
export function applyCampaignRollup(
  rows: CampaignOverviewRow[],
  rollup: readonly CampaignRollupRow[],
  displayStatus: typeof deriveDisplayStatus = deriveDisplayStatus,
): CampaignOverviewRow[] {
  const n = (value: unknown) => Number(value ?? 0) || 0;
  const byId = new Map(rollup.map((r) => [r.campaign_id, r]));
  for (const row of rows) {
    const hit = byId.get(row.id);
    if (!hit) continue;
    if (hit.leads != null) row.leads = n(hit.leads);
    if (hit.sent != null) row.sent = n(hit.sent);
    if (hit.contacted != null) row.contacted = n(hit.contacted);
    if (hit.sent_today != null) row.sentToday = n(hit.sent_today);
    if (hit.bounced != null) row.bounced = n(hit.bounced);
    if (hit.reached != null || hit.delivered != null) row.reached = n(hit.delivered ?? hit.reached);
    if (hit.opened != null) row.opened = n(hit.opened);
    // People-based base; an older rollup without `contacted` falls back to
    // its own authoritative send count, never a stale client-side number.
    const base = {
      contacted: hit.contacted != null ? n(hit.contacted) : row.sent,
      bounced: row.bounced,
    };
    row.openRate = openRatePercent(row.opened, base);
    if (hit.failed != null) row.failed = n(hit.failed);
    if (hit.replies != null || hit.replied != null) row.replies = n(hit.replies ?? hit.replied);
    if (hit.positive_replies != null || hit.positive_replied != null) {
      row.positiveReplies = n(hit.positive_replies ?? hit.positive_replied);
    }
    if (hit.meetings != null) row.meetings = n(hit.meetings);
    row.replyRate = replyRatePercent(row.replies, base);
    row.displayStatus = displayStatus(row.status, row.sent, row.failed);
  }
  return rows;
}

export const CAMPAIGN_STATUS_STYLES: Record<CampaignOverviewRow["displayStatus"], string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/15 text-emerald-600",
  paused: "bg-amber-500/15 text-amber-600",
  completed: "bg-primary/10 text-primary",
  failed: "bg-destructive/15 text-destructive",
  archived: "bg-muted text-muted-foreground",
  scheduled: "bg-primary/10 text-primary",
};
