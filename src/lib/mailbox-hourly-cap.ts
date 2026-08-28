/**
 * Hard platform ceiling: a mailbox may never send more than 70 emails in any
 * rolling hour. This is a safety limit, not a customer setting — configured
 * values above it are clamped everywhere (UI, server validators, dispatcher),
 * so neither the API nor a manipulated UI can exceed it.
 *
 * Pure helpers only; no scheduling, timezone, daily-limit or pacing logic here.
 */

export const MAX_MAILBOX_EMAILS_PER_HOUR = 70;

export const MAX_MAILBOX_HOURLY_MESSAGE = "Maximum 70 emails per mailbox per hour.";

/** Clamps any user/API supplied hourly value into 1..70. */
export function clampMailboxHourlyLimit(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_MAILBOX_EMAILS_PER_HOUR);
}

export function exceedsMailboxHourlyCap(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > MAX_MAILBOX_EMAILS_PER_HOUR;
}

/**
 * The hourly limit actually enforced for a mailbox: its own limit when set and
 * lower, otherwise the platform ceiling. Never returns 0/unlimited.
 */
export function effectiveMailboxHourlyLimit(limit: number | null | undefined): number {
  const n = Math.floor(Number(limit ?? 0));
  if (!Number.isFinite(n) || n <= 0) return MAX_MAILBOX_EMAILS_PER_HOUR;
  return Math.min(n, MAX_MAILBOX_EMAILS_PER_HOUR);
}
