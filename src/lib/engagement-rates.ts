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
 * Denominator ("reachable"): unique PEOPLE emailed (contacted), minus the
 * people whose mail confirmed-bounced. The base is people, not emails: a
 * three-step sequence sends one person three emails, so dividing people by
 * emails would cut a real 43% open rate down to a misleading 24%. Customer
 * mailboxes send over SMTP through the relay and no provider reports a
 * delivery confirmation, so the `delivered` flag is empty for those sends and
 * can never be the base. Bounces are detected by the inbox polling work, so
 * `contacted - bounced` is the closest honest proxy for "landed in a real
 * mailbox".
 */

export type ReachableBase = {
  /** Emails accepted by the sending mailbox / provider. */
  sent: number;
  /** Confirmed hard bounces for those emails. */
  bounced?: number;
};

/**
 * People-based rate base: the counting unit matches the numerator (unique
 * people), so multi-step sequences can never dilute the rate.
 */
export type PeopleBase = {
  /** Unique people emailed (contacted) in the measured scope. */
  contacted: number;
  /** Unique people whose mail confirmed-bounced. */
  bounced?: number | undefined;
};

/** Emails that reached a real mailbox as far as we can confirm. */
export function reachable(base: ReachableBase): number {
  return Math.max(0, (base.sent ?? 0) - (base.bounced ?? 0));
}

/** People who received at least one email as far as we can confirm. */
export function reachablePeople(base: PeopleBase): number {
  return Math.max(0, (base.contacted ?? 0) - (base.bounced ?? 0));
}

/** A percentage with one decimal, or 0 when there is nothing to divide by. */
export function ratePercent(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Any engagement rate: unique people / reachable people. */
export function engagementRatePercent(uniquePeople: number, base: PeopleBase): number {
  return ratePercent(uniquePeople, reachablePeople(base));
}

/** Open rate = unique openers (Apple prefetches excluded) / reachable people. */
export function openRatePercent(uniqueOpens: number, base: PeopleBase | number): number {
  return engagementRatePercent(uniqueOpens, typeof base === "number" ? { contacted: base } : base);
}

/** Click rate = unique clickers / reachable people. */
export function clickRatePercent(uniqueClicks: number, base: PeopleBase | number): number {
  return engagementRatePercent(uniqueClicks, typeof base === "number" ? { contacted: base } : base);
}

/** Reply rate = unique repliers / reachable people. */
export function replyRatePercent(uniqueReplies: number, base: PeopleBase | number): number {
  return engagementRatePercent(uniqueReplies, typeof base === "number" ? { contacted: base } : base);
}

/** Bounce rate stays over raw sent: it measures the sends themselves. */
export function bounceRatePercent(bounced: number, sent: number): number {
  return ratePercent(bounced, sent);
}

/** Unsubscribe rate = unsubscribes / reachable people. */
export function unsubscribeRatePercent(unsubscribed: number, base: PeopleBase | number): number {
  return engagementRatePercent(unsubscribed, typeof base === "number" ? { contacted: base } : base);
}

/**
 * Confirmed delivered = explicit per-message delivery receipts only, capped by
 * reachable sends. Provider/SMTP acceptance is never treated as delivery; the
 * accepted-but-unconfirmed emails are reported separately as "Accepted".
 * Every surface that shows a delivered count MUST use this helper or the shared
 * message outcomes in `@/lib/message-outcomes`.
 */
export function deliveredCount(base: ReachableBase & { confirmedDelivered?: number }): number {
  return Math.min(reachable(base), Math.max(0, base.confirmedDelivered ?? 0));
}
