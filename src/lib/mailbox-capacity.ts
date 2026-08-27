/**
 * Shared mailbox sending-capacity rules.
 *
 * This is the single source of truth for "can this mailbox send another email
 * right now" used by the Unified Inbox compose/reply flow. It reads the same
 * mailbox limits (`daily_limit`, `hourly_limit`, `sent_today`, pause/enable
 * state) that campaign dispatch relies on — it does not introduce a second
 * limit system and never mutates any counter.
 */

import { mailboxSentToday, utcStartOfDay } from "@/lib/mailbox-daily-usage";

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
  dayStart: Date = utcStartOfDay(),
): MailboxCapacity {
  // Date-aware: a stored counter from a previous day no longer consumes today's
  // allowance, and it can never exceed the mailbox's own daily limit.
  const sentToday = mailboxSentToday(row, dayStart);
  const dailyLimit = Number(row.daily_limit ?? 0);
  const hourlyLimit = Number(row.hourly_limit ?? 0);
  const dailyRemaining = Math.max(0, dailyLimit - sentToday);
  const hourlyRemaining = hourlyLimit > 0 ? Math.max(0, hourlyLimit - sentThisHour) : Infinity;

  let reason: MailboxBlockReason = null;
  if (row.paused) reason = "paused";
  else if (row.customer_enabled === false || row.status === "disabled") reason = "disabled";
  else if (dailyRemaining <= 0) reason = "daily";
  else if (hourlyRemaining <= 0) reason = "hourly";

  const reasonLabel =
    reason === "paused"
      ? "Paused"
      : reason === "disabled"
        ? "Unavailable"
        : reason === "daily"
          ? "Daily limit reached"
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
    hourlyRemaining: hourlyLimit > 0 ? Math.max(0, hourlyLimit - sentThisHour) : 0,
    available: reason === null,
    reason,
    reasonLabel,
  };
}

/** Friendly, customer-safe copy for a blocked mailbox. */
export function mailboxBlockedCopy(capacity: MailboxCapacity) {
  const address = capacity.from_email ?? "This mailbox";
  switch (capacity.reason) {
    case "daily":
      return `${address} has reached its daily sending limit. Select another mailbox to continue.`;
    case "hourly":
      return `${address} has reached its hourly sending limit. Select another mailbox or try again later.`;
    case "paused":
      return `${address} is paused. Select another mailbox to continue.`;
    default:
      return `${address} is currently unavailable. Select another mailbox to continue.`;
  }
}
