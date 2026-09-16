/**
 * The single shared engagement-rate calculation.
 *
 * Every surface that shows an open, click or reply rate — Admin → Outreach,
 * workspace Analytics, the campaign Overview/Analytics tabs and the public API
 * — MUST use these helpers. Keeping one implementation is the whole point: two
 * copies of the formula drifted apart before (Admin divided unique openers by
 * sent while Analytics divided opened emails by the delivered flag), and the
 * same class of bug hit inbound MIME decoding.
 *
 * Numerator: unique people. One contact that opens three follow-ups is one
 * open, never three.
 *
 * Denominator ("reachable"): emails accepted for sending, minus confirmed hard
 * bounces. Customer mailboxes send over SMTP through the relay and no provider
 * reports a delivery confirmation, so the `delivered` flag is empty for those
 * sends and can never be the base. Bounces are detected by the inbox polling
 * work, so `sent - bounced` is the closest honest proxy for "landed in a real
 * mailbox".
 */

export type ReachableBase = {
  /** Emails accepted by the sending mailbox / provider. */
  sent: number;
  /** Confirmed hard bounces for those emails. */
  bounced?: number;
};

/** Emails that reached a real mailbox as far as we can confirm. */
export function reachable(base: ReachableBase): number {
  return Math.max(0, (base.sent ?? 0) - (base.bounced ?? 0));
}

/** A percentage with one decimal, or 0 when there is nothing to divide by. */
export function ratePercent(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Any engagement rate: unique people / reachable emails. */
export function engagementRatePercent(uniquePeople: number, base: ReachableBase): number {
  return ratePercent(uniquePeople, reachable(base));
}

/** Open rate = unique openers (Apple prefetches excluded) / reachable. */
export function openRatePercent(uniqueOpens: number, base: ReachableBase | number): number {
  return engagementRatePercent(uniqueOpens, typeof base === "number" ? { sent: base } : base);
}

/** Click rate = unique clickers / reachable. */
export function clickRatePercent(uniqueClicks: number, base: ReachableBase): number {
  return engagementRatePercent(uniqueClicks, base);
}

/** Reply rate = unique repliers / reachable. */
export function replyRatePercent(uniqueReplies: number, base: ReachableBase): number {
  return engagementRatePercent(uniqueReplies, base);
}

/** Bounce rate stays over raw sent: it measures the sends themselves. */
export function bounceRatePercent(bounced: number, sent: number): number {
  return ratePercent(bounced, sent);
}

/** Unsubscribe rate = unsubscribes / reachable. */
export function unsubscribeRatePercent(unsubscribed: number, base: ReachableBase): number {
  return engagementRatePercent(unsubscribed, base);
}
