/**
 * Pure aggregation for the Campaigns listing table.
 *
 * All numbers come from real rows (recipients, messages, replies, CRM stages)
 * so the table never shows synthetic statistics.
 */

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
    sent_at?: string | null;
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
    const sent = messages.filter((m) => m.status === "sent").length;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const sentToday = messages.filter(
      (m) => m.status === "sent" && m.sent_at && new Date(m.sent_at).getTime() >= dayStart.getTime(),
    ).length;
    // Bounced rows keep status "failed" historically but are identified by
    // bounced_at. They are reported separately and never counted as failed.
    const bounced = messages.filter((m) => m.bounced_at != null).length;
    const failed = messages.filter((m) => m.status === "failed" && m.bounced_at == null).length;

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
      failed,
      replies: replyKeys.size,
      replyRate: sent > 0 ? (replyKeys.size / sent) * 100 : 0,
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

export const CAMPAIGN_STATUS_STYLES: Record<CampaignOverviewRow["displayStatus"], string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/15 text-emerald-600",
  paused: "bg-amber-500/15 text-amber-600",
  completed: "bg-primary/10 text-primary",
  failed: "bg-destructive/15 text-destructive",
  archived: "bg-muted text-muted-foreground",
  scheduled: "bg-primary/10 text-primary",
};
