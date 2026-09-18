/**
 * Warmup delivery tracking — one shared source of truth.
 *
 * Every warmup message moves through the same internal states whatever provider
 * or mailbox carried it:
 *
 *   queued → sending → sent → delivered
 *                           ↘ failed / bounced
 *
 * `sent` means the mailbox/provider accepted the hand-off. It is never treated
 * as an arrival. A message only becomes `delivered` when a real confirmation
 * exists: the receiving warmup mailbox handed the message back to us (inbound
 * feed or IMAP read), the provider reported a delivery for that message id, or
 * the peer replied to it — a reply cannot exist without arrival.
 *
 * Sends we cannot observe (a pool address on a mailbox we do not read) stay
 * `sent` and are reported as "unconfirmed", never as delivered and never as a
 * failure.
 */

export type WarmupDeliveryState =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced";

/** Terminal negatives outrank a confirmation: a later bounce is still a bounce. */
const RANK: Record<WarmupDeliveryState, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  failed: 4,
  bounced: 5,
};

/** True when `next` is a stronger signal than `current` and may overwrite it. */
export function advancesWarmupDelivery(
  current: WarmupDeliveryState | null | undefined,
  next: WarmupDeliveryState,
): boolean {
  return RANK[next] > RANK[current ?? "queued"];
}

/**
 * Normalizes any provider or internal warmup event name to an internal state.
 * `null` means "carries no delivery verdict" (deferrals, complaints, opens).
 */
export function normalizeWarmupDeliveryState(kind: string | null | undefined): WarmupDeliveryState | null {
  const value = (kind ?? "").toLowerCase();
  if (!value) return null;
  if (value.includes("bounce")) return "bounced";
  if (value.includes("fail") || value.includes("reject")) return "failed";
  if (
    value.includes("deliver") ||
    value.includes("inbox_placement") ||
    value.includes("spam_placement") ||
    value.includes("received") ||
    value.includes("repl")
  ) {
    return "delivered";
  }
  if (value.includes("sent") || value.includes("accept")) return "sent";
  if (value.includes("process") || value.includes("sending")) return "sending";
  if (value.includes("queue") || value.includes("schedul")) return "queued";
  return null;
}

/** Event kinds that prove the message arrived at the receiving mailbox. */
export function isWarmupArrivalProof(kind: string | null | undefined): boolean {
  return normalizeWarmupDeliveryState(kind) === "delivered";
}

export type WarmupDeliveryTotals = {
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
  notReceived: number;
};

export type WarmupDeliveryCounts = {
  sent: number;
  /** Confirmed arrivals only. */
  delivered: number;
  /** Confirmed negatives (bounced + failed + confirmed non-arrival). */
  negative: number;
  /** Accepted by the mailbox, no arrival signal available (yet). */
  unconfirmed: number;
  /** Share of sends confirmed delivered, or null when nothing was sent. */
  rate: number | null;
};

/**
 * The single calculation every warmup surface uses: dashboard row, mailbox
 * detail, history and analytics all derive their numbers from here so they can
 * never drift apart.
 */
export function warmupDeliveryCounts(totals: Partial<WarmupDeliveryTotals>): WarmupDeliveryCounts {
  const sent = Math.max(0, totals.sent ?? 0);
  const delivered = Math.max(0, Math.min(sent, totals.delivered ?? 0));
  const negative = Math.max(
    0,
    (totals.bounced ?? 0) + (totals.failed ?? 0) + (totals.notReceived ?? 0),
  );
  const unconfirmed = Math.max(0, sent - delivered - negative);
  return {
    sent,
    delivered,
    negative,
    unconfirmed,
    rate: sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : null,
  };
}

/**
 * Honest one-line summary for the dashboard cell. Confirmed arrivals are shown
 * as delivered; anything we cannot confirm is labelled as such instead of being
 * silently reported as "0 delivered".
 */
export function warmupDeliveryLabel(counts: WarmupDeliveryCounts): string {
  if (counts.sent === 0) return "no sends yet";
  if (counts.delivered > 0) {
    return counts.unconfirmed > 0
      ? `${counts.delivered} delivered · ${counts.unconfirmed} unconfirmed`
      : `${counts.delivered} delivered`;
  }
  if (counts.unconfirmed > 0) return `${counts.unconfirmed} unconfirmed`;
  return "0 delivered";
}

/** Tooltip/legend text explaining what the label means. */
export const WARMUP_DELIVERY_EXPLANATION =
  "Delivered counts warmup emails confirmed to have arrived — the receiving mailbox handed the message back, the provider reported a delivery, or the peer replied. Unconfirmed means the mailbox accepted the send but no arrival confirmation is available for that recipient.";
