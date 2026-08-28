/**
 * Date-aware mailbox daily usage.
 *
 * `sending_accounts.sent_today` is a persistent counter that is only ever
 * incremented by a send. Nothing resets it at midnight, so a mailbox that once
 * reached its daily limit stayed blocked forever. These helpers make the stored
 * counter date-aware: it only counts when the mailbox actually sent inside the
 * current sending day (`last_sent_at`), and it is always clamped to the
 * mailbox's own daily limit so a corrupted/overshot value cannot block sending
 * beyond the real allowance.
 *
 * No schema change: `last_sent_at` and `sent_today` already exist.
 */

export type MailboxDailyUsageRow = {
  sent_today?: number | null;
  daily_limit?: number | null;
  last_sent_at?: string | null;
};

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Clamps a counter into `[0, daily_limit]` (no clamp when no limit is set). */
export function clampToDailyLimit(count: number, dailyLimit: number | null | undefined): number {
  const limit = toNumber(dailyLimit);
  const safe = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  return limit > 0 ? Math.min(safe, limit) : safe;
}

/**
 * The stored counter's contribution to *today's* usage. Returns 0 when the last
 * recorded send happened before the current sending day started, which is what
 * gives a mailbox its capacity back automatically at the day boundary.
 */
export function storedSentToday(row: MailboxDailyUsageRow, dayStart: Date): number {
  const stored = toNumber(row.sent_today);
  if (stored === 0) return 0;
  const last = row.last_sent_at ? new Date(row.last_sent_at) : null;
  // A counter with no send timestamp cannot be attributed to today.
  if (!last || Number.isNaN(last.getTime())) return 0;
  if (last.getTime() < dayStart.getTime()) return 0;
  return clampToDailyLimit(stored, row.daily_limit);
}

/**
 * Authoritative "emails already sent by this mailbox today": the higher of the
 * dynamically counted sends and the (date-aware, clamped) stored counter, so
 * manual inbox sends and campaign sends both count exactly once.
 */
export function mailboxSentToday(
  row: MailboxDailyUsageRow,
  dayStart: Date,
  dynamicSentToday = 0,
): number {
  return clampToDailyLimit(
    Math.max(toNumber(dynamicSentToday), storedSentToday(row, dayStart)),
    row.daily_limit,
  );
}

/** Remaining capacity for the current sending day. */
export function mailboxDailyRemaining(
  row: MailboxDailyUsageRow,
  dayStart: Date,
  dynamicSentToday = 0,
): number {
  const limit = toNumber(row.daily_limit);
  if (limit <= 0) return 0;
  return Math.max(0, limit - mailboxSentToday(row, dayStart, dynamicSentToday));
}

/** The value to persist after `count` further sends today. */
export function nextStoredSentToday(
  row: MailboxDailyUsageRow,
  dayStart: Date,
  count: number,
): number {
  return clampToDailyLimit(storedSentToday(row, dayStart) + Math.max(0, count), row.daily_limit);
}

/** Start of the current sending day (UTC unless a timezone-aware start is supplied). */
export function utcStartOfDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Mailbox sending capacity is a ROLLING window, not a calendar day: a mailbox
 * regains capacity 12 hours after the sends that consumed it, never at
 * midnight.
 */
export const MAILBOX_WINDOW_HOURS = 12;

/** Start of the current rolling mailbox sending window. */
export function mailboxWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - MAILBOX_WINDOW_HOURS * 3_600_000);
}
