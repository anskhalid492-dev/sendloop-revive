/** Client-safe analytics types and rate formulas. */
import {
  bounceRatePercent,
  clickRatePercent,
  openRatePercent,
  replyRatePercent,
  unsubscribeRatePercent,
} from "@/lib/engagement-rates";

export type AnalyticsSummary = {
  contacted?: number;
  negativeReplies?: number;
  totalOpens?: number;
  /** True only when all sends have explicit delivery/bounce evidence. */
  deliveryComplete?: boolean;
  /** False when the optional provider-event read failed. */
  deliveryEventsAvailable?: boolean;
  /** Legacy failed rows without an occurrence timestamp cannot be date-attributed. */
  failureHistoryIncomplete?: boolean;
  /** Known unsent failures without a reliable date, kept separate from period totals. */
  undatedFailed?: number;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  /** Replies marked positive, including CRM statuses like "Interested". */
  positiveReplies: number;
  bounced: number;
  unsubscribed: number;
  complained: number;
  failed: number;
  held?: number;
  attempted?: number;
};

/** Visible failure inventory: period failures plus explicitly labelled undated history. */
export function failedSendCount(summary: Pick<AnalyticsSummary, "failed" | "undatedFailed">): number {
  return summary.failed + (summary.undatedFailed ?? 0);
}

export type AnalyticsTimeseriesPoint = {
  bucket: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  positiveReplies: number;
  bounced: number;
  unsubscribed: number;
};

export type AnalyticsCampaignRow = {
  campaignId: string;
  /** False when the campaign has open tracking switched off. */
  openTracking?: boolean;
  name: string;
  status: string;
  /** Audience size for the campaign, when known. */
  leads?: number;
  sent: number;
  /** Unique people emailed — the denominator for people-based rates. */
  contacted?: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  positiveReplies: number;
  /** Clear "no" responses. Still a reply, never a positive one. */
  negativeReplies?: number;
  /** Automatic away messages. Counted as replies, excluded from interest. */
  outOfOfficeReplies?: number;
  bounced: number;
  unsubscribed: number;
  complained: number;
  failed: number;
  held?: number;
  attempted?: number;
};

export type AnalyticsAccountRow = {
  accountId: string;
  fromEmail: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  bounced: number;
  unsubscribed: number;
};

type RateBase = { sent: number; delivered?: number; bounced?: number; contacted?: number };

export function rate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

/**
 * Engagement rates all come from the one shared calculation in
 * `engagement-rates.ts`: unique people divided by reachable PEOPLE
 * (contacted minus confirmed bounces). The base is people, not emails,
 * so a multi-step sequence never dilutes the rate. Admin uses the exact
 * same helpers. Rows without a contacted count (e.g. a single sequence
 * step, where one email = one person) fall back to their send count.
 */
const peopleBase = (r: RateBase) => ({ contacted: r.contacted ?? r.sent, bounced: r.bounced });
export const openRate = (r: RateBase & { opens: number }) => openRatePercent(r.opens, peopleBase(r));
export const clickRate = (r: RateBase & { clicks: number }) => clickRatePercent(r.clicks, peopleBase(r));
export const replyRate = (r: RateBase & { replies: number }) => replyRatePercent(r.replies, peopleBase(r));
/** Bounce rate = bounces / sent: it measures the sends themselves. */
export const bounceRate = (r: RateBase & { bounced: number }) => bounceRatePercent(r.bounced, r.sent);
export const unsubRate = (r: RateBase & { unsubscribed: number }) =>
  unsubscribeRatePercent(r.unsubscribed, peopleBase(r));

/** Formats an open-rate cell, distinguishing "disabled" from "no data". */
export function formatOpenRate(row: {
  opens: number;
  sent: number;
  contacted?: number;
  bounced?: number;
  openTracking?: boolean;
}): string {
  if (row.openTracking === false) return "Disabled";
  return formatPct(openRatePercent(row.opens, peopleBase(row)));
}

export function formatPct(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString();
}

export function deliveryPresentation(r: AnalyticsSummary): { value: string; description: string } {
  return { value: formatCount(r.delivered), description: `${formatPct(rate(r.delivered, r.sent))} of sent · sent minus bounced` };
}
