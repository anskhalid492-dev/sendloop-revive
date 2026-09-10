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

/* ------------------------------------------------------------------ *
 * Sending lanes: automated campaign sends vs. human inbox replies.
 *
 * Human replies must never be blocked by MunchReach's own campaign pacing
 * limits, and automated campaigns must never be able to consume 100% of a
 * mailbox's hourly capacity. A small slice of every mailbox's hourly limit is
 * therefore reserved for human replies: campaigns plan and dispatch against
 * the reduced number, replies are not gated by it at all.
 * ------------------------------------------------------------------ */

export type SendingLane = "campaign" | "reply";

/** Share of a mailbox's hourly limit held back from automated campaigns. */
export const REPLY_RESERVE_RATIO = (() => {
  const raw = Number(process.env["MAILBOX_REPLY_RESERVE_RATIO"]);
  if (Number.isFinite(raw) && raw > 0 && raw < 0.5) return raw;
  return 0.1;
})();

/** Emails per hour held back for human replies on a given mailbox. */
export function replyReserveForHourlyLimit(limit: number | null | undefined): number {
  const effective = effectiveMailboxHourlyLimit(limit);
  if (effective <= 1) return 0;
  return Math.min(effective - 1, Math.max(1, Math.round(effective * REPLY_RESERVE_RATIO)));
}

/** The hourly limit automated campaign sending may actually use. */
export function campaignHourlyLimit(limit: number | null | undefined): number {
  const effective = effectiveMailboxHourlyLimit(limit);
  return Math.max(1, effective - replyReserveForHourlyLimit(limit));
}

/** The hourly limit for a lane: campaigns are reserved-down, replies are not. */
export function laneHourlyLimit(limit: number | null | undefined, lane: SendingLane): number {
  return lane === "reply" ? effectiveMailboxHourlyLimit(limit) : campaignHourlyLimit(limit);
}
