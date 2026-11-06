/**
 * Pure model for the dashboard command center.
 *
 * Everything here is deterministic and free of I/O so the derived numbers,
 * the "needs your attention" items and the automatic insights can be tested
 * directly. Nothing in this file invents data: every helper returns an empty
 * result when the underlying counts are missing or too small to be meaningful.
 */
import type { CampaignRunState } from "@/lib/campaign-run-state";

export type PeriodTotals = {
  sent: number;
  delivered: number;
  replies: number;
  positive: number;
  meetings: number;
  bounced: number;
  uniqueRecipients: number;
};

export const EMPTY_TOTALS: PeriodTotals = {
  sent: 0,
  delivered: 0,
  replies: 0,
  positive: 0,
  meetings: 0,
  bounced: 0,
  uniqueRecipients: 0,
};

export type SeriesPoint = {
  date: string;
  sent: number;
  delivered: number;
  replies: number;
  positive: number;
  meetings: number;
};

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  runState: CampaignRunState;
  runLabel: string;
  nextRunAt: string | null;
  leads: number;
  /** Lifetime successful sends. */
  sentLifetime: number;
  /** Successful sends inside the campaign's current local sending day. */
  sentToday: number;
  /** Accepted sends inside the selected range (the bounce-rate base). */
  sentInRange?: number;
  /** Confirmed delivered: per-message receipts only. */
  delivered: number;
  replies: number;
  positive: number;
  meetings: number;
  bounced: number;
  remainingDailyCapacity: number | null;
  dailyQuota: number;
};

export type MailboxRow = {
  id: string;
  label: string;
  email: string;
  state: "active" | "warming" | "paused" | "blocked" | "capacity";
  stateLabel: string;
  reason: string | null;
  healthScore: number | null;
  sent: number;
  delivered: number;
  bounced: number;
  replies: number;
  dailyLimit: number;
  usedInWindow: number;
  available: number;
};

export type SendingHealth = {
  score: number;
  total: number;
  healthy: number;
  warming: number;
  paused: number;
  blocked: number;
  domainsReady: number;
  domainsTotal: number;
  capacity: number;
  usedInWindow: number;
  available: number;
};

export type FunnelStep = { key: string; label: string; value: number };

export type ActionItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  actionLabel: string;
  to: string;
};

export type Insight = { id: string; tone: "positive" | "negative" | "neutral"; text: string };

export function pct(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Percentage change vs the previous period. Null when there is no baseline. */
export function delta(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

/* ------------------------------------------------------------------ funnel */

export function buildFunnel(input: {
  leads: number;
  sent: number;
  delivered: number;
  replies: number;
  positive: number;
  meetings: number;
}): FunnelStep[] {
  return [
    { key: "leads", label: "Leads", value: input.leads },
    { key: "sent", label: "Emails sent", value: input.sent },
    { key: "delivered", label: "Delivered", value: input.delivered },
    { key: "replies", label: "Replies", value: input.replies },
    { key: "positive", label: "Positive replies", value: input.positive },
    { key: "meetings", label: "Meetings", value: input.meetings },
  ];
}

/* ---------------------------------------------------------- action center */

export type ActionInput = {
  campaigns: CampaignRow[];
  mailboxes: MailboxRow[];
  domainsPending: number;
  unreadReplies: number;
  retryableFailures: number;
  hasLeads: boolean;
  hasMailbox: boolean;
};

/** Actionable, real problems only — an empty array means "all caught up". */
export function buildActionItems(input: ActionInput): ActionItem[] {
  const items: ActionItem[] = [];

  for (const box of input.mailboxes) {
    if (box.state === "blocked") {
      items.push({
        id: `mailbox-blocked-${box.id}`,
        severity: "critical",
        title: `${box.label} is blocked`,
        detail: box.reason ?? "This mailbox can't send right now.",
        actionLabel: "Review mailbox",
        to: "/warmup",
      });
    }
  }

  const warming = input.mailboxes.filter((m) => m.state === "warming");
  if (warming.length > 0) {
    items.push({
      id: "mailboxes-warming",
      severity: "info",
      title: `${warming.length} mailbox${warming.length > 1 ? "es are" : " is"} still warming up`,
      detail: "Volume stays limited until warmup completes.",
      actionLabel: "Open warmup",
      to: "/warmup",
    });
  }

  if (input.domainsPending > 0) {
    items.push({
      id: "domains-pending",
      severity: "warning",
      title: `${input.domainsPending} domain${input.domainsPending > 1 ? "s need" : " needs"} verification`,
      detail: "Unverified domains can block sending.",
      actionLabel: "Verify domain",
      to: "/sending",
    });
  }

  if (!input.hasMailbox) {
    items.push({
      id: "no-mailbox",
      severity: "critical",
      title: "No mailbox connected",
      detail: "Connect a mailbox before launching a campaign.",
      actionLabel: "Connect mailbox",
      to: "/sending",
    });
  }

  if (!input.hasLeads) {
    items.push({
      id: "no-leads",
      severity: "warning",
      title: "No leads imported yet",
      detail: "Import a list for your campaigns.",
      actionLabel: "Import leads",
      to: "/leads",
    });
  }

  for (const campaign of input.campaigns) {
    if (campaign.runState === "running" && campaign.leads === 0) {
      items.push({
        id: `campaign-empty-${campaign.id}`,
        severity: "warning",
        title: `${campaign.name} has no leads`,
        detail: "Active but has nothing to send.",
        actionLabel: "Add leads",
        to: "/campaigns",
      });
    }
    if (campaign.runState === "daily_quota_reached") {
      items.push({
        id: `campaign-quota-${campaign.id}`,
        severity: "info",
        title: `${campaign.name} reached today's quota`,
        detail: "Continues at the next scheduled run.",
        actionLabel: "Open campaign",
        to: "/campaigns",
      });
    }
    if (campaign.runState === "lifetime_limit_reached") {
      items.push({
        id: `campaign-limit-${campaign.id}`,
        severity: "warning",
        title: `${campaign.name} hit its total send limit`,
        detail: "Queued until the limit is raised.",
        actionLabel: "Adjust limit",
        to: "/campaigns",
      });
    }
    if (campaign.runState === "scheduled") {
      items.push({
        id: `campaign-scheduled-${campaign.id}`,
        severity: "info",
        title: `${campaign.name} is scheduled`,
        detail: "Starts at its next scheduled window.",
        actionLabel: "Open campaign",
        to: "/campaigns",
      });
    }
  }

  if (input.retryableFailures > 0) {
    items.push({
      id: "retryable-failures",
      severity: "warning",
      title: `${input.retryableFailures} email${input.retryableFailures > 1 ? "s" : ""} failed and can be retried`,
      detail: "Temporary failures — retried automatically.",
      actionLabel: "View campaigns",
      to: "/campaigns",
    });
  }

  if (input.unreadReplies > 0) {
    items.push({
      id: "unread-replies",
      severity: "critical",
      title: `${input.unreadReplies} unread repl${input.unreadReplies > 1 ? "ies" : "y"}`,
      detail: "Prospects are waiting.",
      actionLabel: "Open inbox",
      to: "/inbox",
    });
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

/* -------------------------------------------------------------- insights */

/** Minimum sends before a rate is worth talking about. */
export const INSIGHT_MIN_SENT = 25;

export type InsightInput = {
  campaigns: CampaignRow[];
  mailboxes: MailboxRow[];
  current: PeriodTotals;
  previous: PeriodTotals;
  series: SeriesPoint[];
  days: number;
};

/** Automatic insights derived only from real, statistically usable numbers. */
export function buildInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];
  const byReplyRate = [...input.campaigns]
    .filter((c) => c.sentLifetime >= INSIGHT_MIN_SENT)
    .sort((a, b) => pct(b.replies, b.sentLifetime) - pct(a.replies, a.sentLifetime));

  const best = byReplyRate[0];
  if (best) {
    insights.push({
      id: "best-campaign",
      tone: "positive",
      text: `${best.name} has the highest reply rate at ${pct(best.replies, best.sentLifetime).toFixed(1)}%.`,
    });
  }

  const worst = byReplyRate[byReplyRate.length - 1];
  if (worst && best && worst.id !== best.id && pct(worst.replies, worst.sentLifetime) === 0) {
    insights.push({
      id: "zero-reply-campaign",
      tone: "negative",
      text: `${worst.name} has not produced a reply from ${worst.sentLifetime.toLocaleString()} emails — the messaging may need a rewrite.`,
    });
  }

  if (input.current.sent >= INSIGHT_MIN_SENT && input.previous.sent >= INSIGHT_MIN_SENT) {
    const nowRate = pct(input.current.replies, input.current.sent);
    const beforeRate = pct(input.previous.replies, input.previous.sent);
    const change = delta(nowRate, beforeRate);
    if (change !== null && Math.abs(change) >= 10) {
      insights.push({
        id: "reply-rate-trend",
        tone: change > 0 ? "positive" : "negative",
        text: `Your reply rate ${change > 0 ? "improved" : "dropped"} ${Math.abs(change)}% versus the previous ${input.days} days (${nowRate.toFixed(1)}% vs ${beforeRate.toFixed(1)}%).`,
      });
    }
  }

  const risky = input.mailboxes.filter(
    (m) => m.sent >= INSIGHT_MIN_SENT && pct(m.bounced, m.sent) >= 3,
  );
  if (risky.length > 0) {
    insights.push({
      id: "bounce-risk",
      tone: "negative",
      text: `Bounce rate is elevated on ${risky.length} mailbox${risky.length > 1 ? "es" : ""} — pause or clean the affected lists before it hurts deliverability.`,
    });
  }

  const bestDay = bestWeekday(input.series);
  if (bestDay) {
    insights.push({ id: "best-day", tone: "neutral", text: bestDay });
  }

  return insights.slice(0, 5);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * "X replies more than Y" only when both weekdays have enough sending volume
 * to compare, otherwise nothing is claimed.
 */
export function bestWeekday(series: SeriesPoint[]): string | null {
  const totals = new Map<number, { sent: number; replies: number }>();
  for (const point of series) {
    const day = new Date(`${point.date}T12:00:00Z`).getUTCDay();
    const entry = totals.get(day) ?? { sent: 0, replies: 0 };
    entry.sent += point.sent;
    entry.replies += point.replies;
    totals.set(day, entry);
  }
  const usable = Array.from(totals.entries())
    .filter(([, v]) => v.sent >= INSIGHT_MIN_SENT)
    .map(([day, v]) => ({ day, rate: pct(v.replies, v.sent) }))
    .sort((a, b) => b.rate - a.rate);
  if (usable.length < 2) return null;
  const top = usable[0];
  const bottom = usable[usable.length - 1];
  if (!top || !bottom) return null;
  if (top.rate <= 0 || bottom.rate <= 0) return null;
  const diff = Math.round(((top.rate - bottom.rate) / bottom.rate) * 100);
  if (diff < 15) return null;
  return `${WEEKDAYS[top.day]} sends replied ${diff}% more often than ${WEEKDAYS[bottom.day]}.`;
}

/** Ranking by outcome quality, not raw volume. */
export function rankCampaigns(rows: CampaignRow[], limit = 5): CampaignRow[] {
  return [...rows]
    .filter((c) => c.sentLifetime > 0)
    .sort((a, b) => {
      const scoreA = a.meetings * 10 + a.positive * 4 + pct(a.replies, a.sentLifetime);
      const scoreB = b.meetings * 10 + b.positive * 4 + pct(b.replies, b.sentLifetime);
      return scoreB - scoreA;
    })
    .slice(0, limit);
}
