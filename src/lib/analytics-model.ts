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
  /** Audience size for the campaign, when known. */
  leads?: number;
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

type RateBase = { sent: number; delivered: number; bounced?: number };

export function rate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

/**
 * Engagement rates all come from the one shared calculation in
 * `engagement-rates.ts`: unique people divided by reachable emails
 * (sent minus confirmed bounces). Admin uses the exact same helpers.
 */
export const openRate = (r: RateBase & { opens: number; deliveryComplete?: boolean }) => r.deliveryComplete ? rate(r.opens, r.delivered) : openRatePercent(r.opens, r);
export const clickRate = (r: RateBase & { clicks: number }) => clickRatePercent(r.clicks, r);
export const replyRate = (r: RateBase & { replies: number; deliveryComplete?: boolean }) => r.deliveryComplete ? rate(r.replies, r.delivered) : replyRatePercent(r.replies, r);
/** Bounce rate = bounces / sent: it measures the sends themselves. */
export const bounceRate = (r: RateBase & { bounced: number }) => bounceRatePercent(r.bounced, r.sent);
export const unsubRate = (r: RateBase & { unsubscribed: number }) =>
  unsubscribeRatePercent(r.unsubscribed, r);

/** Formats an open-rate cell, distinguishing "disabled" from "no data". */
export function formatOpenRate(row: {
  opens: number;
  sent: number;
  bounced?: number;
  openTracking?: boolean;
}): string {
  if (row.openTracking === false) return "Disabled";
  return formatPct(openRatePercent(row.opens, row));
}

export function formatPct(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString();
}

export function deliveryPresentation(r: AnalyticsSummary): { value: string; description: string } {
  if (r.deliveryEventsAvailable === false) return { value: "—", description: "Delivery confirmations unavailable" };
  if (!r.delivered && r.sent && !r.deliveryComplete) return { value: "—", description: "No confirmed delivery receipts" };
  return { value: formatCount(r.delivered), description: `${formatPct(rate(r.delivered, r.sent))} confirmed · ${r.deliveryComplete ? "complete receipts" : "partial receipts"}` };
}
