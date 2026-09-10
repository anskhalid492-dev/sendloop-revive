/** Client-safe analytics types and rate formulas. */

export type AnalyticsSummary = {
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
};

export type AnalyticsTimeseriesPoint = {
  bucket: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  bounced: number;
  unsubscribed: number;
};

export type AnalyticsCampaignRow = {
  campaignId: string;
  /** False when the campaign has open tracking switched off. */
  openTracking?: boolean;
  name: string;
  status: string;
  sent: number;
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

type RateBase = { sent: number; delivered: number };

export function rate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

/** Open rate = unique opens / delivered. */
export const openRate = (r: RateBase & { opens: number }) => rate(r.opens, r.delivered);
/** Click rate = unique clicks / delivered. */
export const clickRate = (r: RateBase & { clicks: number }) => rate(r.clicks, r.delivered);
/** Reply rate = replies / delivered. */
export const replyRate = (r: RateBase & { replies: number }) => rate(r.replies, r.delivered);
/** Bounce rate = bounces / sent. */
export const bounceRate = (r: RateBase & { bounced: number }) => rate(r.bounced, r.sent);
/** Unsubscribe rate = unsubscribes / delivered. */
export const unsubRate = (r: RateBase & { unsubscribed: number }) =>
  rate(r.unsubscribed, r.delivered);

/** Formats an open-rate cell, distinguishing "disabled" from "no data". */
export function formatOpenRate(row: {
  opens: number;
  delivered: number;
  openTracking?: boolean;
}): string {
  if (row.openTracking === false) return "Disabled";
  return formatPct(rate(row.opens, row.delivered));
}

export function formatPct(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString();
}
