/**
 * Shared mailbox sending-capacity rules.
 *
 * This is the single source of truth for "can this mailbox send another email
 * right now" used by the Unified Inbox compose/reply flow. It reads the same
 * mailbox limits (`daily_limit`, `hourly_limit`, `sent_today`, pause/enable
 * state) that campaign dispatch relies on — it does not introduce a second
 * limit system and never mutates any counter.
 */

import { laneHourlyLimit, type SendingLane } from "@/lib/mailbox-hourly-cap";

export type { SendingLane } from "@/lib/mailbox-hourly-cap";
import {
  mailboxCapacityReturnsAt,
  mailboxSentToday,
  mailboxWindowStart,
} from "@/lib/mailbox-daily-usage";

export type MailboxCapacityRow = {
  id: string;
  label?: string | null;
  from_name: string | null;
  from_email: string | null;
  paused?: boolean | null;
  customer_enabled?: boolean | null;
  status?: string | null;
  sent_today?: number | null;
  daily_limit?: number | null;
  hourly_limit?: number | null;
  /** Used to decide whether `sent_today` still belongs to the current day. */
  last_sent_at?: string | null;
};

export type MailboxBlockReason = "paused" | "disabled" | "daily" | "hourly" | null;

export type MailboxCapacity = {
  id: string;
  label: string | null;
  from_name: string | null;
  from_email: string | null;
  sentToday: number;
  dailyLimit: number;
  dailyRemaining: number;
  sentThisHour: number;
  hourlyLimit: number;
  hourlyRemaining: number;
  available: boolean;
  reason: MailboxBlockReason;
  reasonLabel: string | null;
  /**
   * True when the mailbox is only *temporarily* out of sending capacity (the
   * rolling 12-hour window is full). This is not a safety block: the mailbox
   * becomes eligible again on its own.
   */
  temporary: boolean;
  /** ISO time the rolling window frees capacity again, when known. */
  nextAvailableAt: string | null;
};

/** Marker so the client can recognise a capacity block and keep the draft. */
export const MAILBOX_LIMIT_CODE = "MAILBOX_LIMIT";

export function isMailboxLimitError(message: string | null | undefined) {
  return Boolean(message && message.startsWith(`${MAILBOX_LIMIT_CODE}:`));
}

export function mailboxLimitMessage(message: string) {
  return message.replace(`${MAILBOX_LIMIT_CODE}: `, "");
}

export function evaluateMailboxCapacity(
  row: MailboxCapacityRow,
  sentThisHour = 0,
  dayStart: Date = mailboxWindowStart(),
  lane: SendingLane = "campaign",
): MailboxCapacity {
  // Date-aware: a stored counter from a previous day no longer consumes today's
  // allowance, and it can never exceed the mailbox's own daily limit.
  const sentToday = mailboxSentToday(row, dayStart);
  const dailyLimit = Number(row.daily_limit ?? 0);
  // Hard platform ceiling: never above 70/hour per mailbox, whatever is stored.
  // Campaign sending is additionally held below the reply reservation so an
  // automated campaign can never consume a mailbox's whole hourly capacity.
  const hourlyLimit = laneHourlyLimit(row.hourly_limit, lane);
  const dailyRemaining = Math.max(0, dailyLimit - sentToday);
  const hourlyRemaining = Math.max(0, hourlyLimit - sentThisHour);

  let reason: MailboxBlockReason = null;
  if (row.paused) reason = "paused";
  else if (row.customer_enabled === false || row.status === "disabled") reason = "disabled";
  // MunchReach's own daily/hourly pacing limits govern automated campaign
  // sending only. A human reply from the Unified Inbox is never blocked by
  // them — only real safety states (paused/disabled) and the provider itself
  // can stop it.
  else if (lane === "campaign" && dailyRemaining <= 0) reason = "daily";
  else if (lane === "campaign" && hourlyRemaining <= 0) reason = "hourly";

  const next = new Date(dayStart.getTime() + 12 * 3_600_000);

  const reasonLabel =
    reason === "paused"
      ? "Paused"
      : reason === "disabled"
        ? "Unavailable"
        : reason === "daily"
          ? "Temporarily unavailable"
          : reason === "hourly"
            ? "Hourly limit reached"
            : null;

  return {
    id: row.id,
    label: row.label ?? null,
    from_name: row.from_name,
    from_email: row.from_email,
    sentToday,
    dailyLimit,
    dailyRemaining,
    sentThisHour,
    hourlyLimit,
    hourlyRemaining,
    available: reason === null,
    reason,
    reasonLabel,
    temporary: reason === "daily" || reason === "hourly",
    nextAvailableAt:
      reason === "daily" ? (mailboxCapacityReturnsAt(row, next)?.toISOString() ?? null) : null,
  };
}

/** Friendly, customer-safe copy for a blocked mailbox. */
export function mailboxBlockedCopy(capacity: MailboxCapacity) {
  const address = capacity.from_email ?? "This mailbox";
  switch (capacity.reason) {
    case "daily":
      return `${address} is temporarily out of sending capacity for the current 12-hour window. Capacity returns automatically — or select another mailbox.`;
    case "hourly":
      return `${address} has reached its hourly campaign sending limit. Campaign sending resumes automatically next hour.`;
    case "paused":
      return `${address} is paused. Select another mailbox to continue.`;
    default:
      return `${address} is currently unavailable. Select another mailbox to continue.`;
  }
}
