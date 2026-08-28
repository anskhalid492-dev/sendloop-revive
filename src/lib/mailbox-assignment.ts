/**
 * Mailbox assignment for campaign messages.
 *
 * A queued `campaign_message` can reach the dispatcher without a usable
 * mailbox: the row was created before any mailbox was selected, or the mailbox
 * it pointed at was deleted/detached afterwards. Failing such a message is
 * wrong — the recipient is fine, only the sender is missing — so the dispatcher
 * repairs the assignment from the campaign's own mailbox pool, and defers the
 * message when the pool is temporarily empty.
 *
 * Pure helpers only: no Supabase, fully unit-testable.
 */

export type AssignableMailbox = {
  id: string;
  paused?: boolean | null;
  customer_enabled?: boolean | null;
  status?: string | null;
  daily_limit?: number | null;
};

/** A mailbox that is allowed to send right now (ignoring capacity). */
export function isEligibleMailbox(account: AssignableMailbox | null | undefined): boolean {
  if (!account) return false;
  if (account.paused) return false;
  if (account.customer_enabled === false) return false;
  if (account.status === "disabled") return false;
  return true;
}

/**
 * Picks the least-loaded eligible mailbox from the campaign's pool that still
 * has capacity left. Returns `null` when every mailbox is ineligible or full —
 * a TEMPORARY condition the caller must handle by deferring, never by failing.
 */
export function selectMailboxForMessage(input: {
  /** Mailbox ids configured on the campaign, in configured order. */
  poolIds: string[];
  accountsById: Map<string, AssignableMailbox>;
  /** Sends already consumed in the current rolling window, per mailbox id. */
  usageById?: Map<string, number>;
}): string | null {
  const usage = input.usageById ?? new Map<string, number>();
  let best: { id: string; used: number } | null = null;
  for (const id of input.poolIds) {
    const account = input.accountsById.get(id);
    if (!isEligibleMailbox(account)) continue;
    const limit = Number(account?.daily_limit ?? 0);
    const used = Number(usage.get(id) ?? 0);
    if (limit > 0 && used >= limit) continue;
    if (!best || used < best.used) best = { id, used };
  }
  return best?.id ?? null;
}

/** Default retry delay when no mailbox is available (temporary condition). */
export const MAILBOX_RETRY_DELAY_MS = 15 * 60 * 1000;

/**
 * When to retry a message that could not be assigned a mailbox. Stays inside
 * the current sending window when possible; otherwise the caller's next window
 * start is used.
 */
export function mailboxRetryAt(now: Date, nextWindowStart?: Date | null): Date {
  const retry = new Date(now.getTime() + MAILBOX_RETRY_DELAY_MS);
  if (nextWindowStart && !Number.isNaN(nextWindowStart.getTime())) {
    // Never retry earlier than the delay, and never later than needed.
    return retry.getTime() < nextWindowStart.getTime() ? retry : nextWindowStart;
  }
  return retry;
}

export const NO_MAILBOX_AVAILABLE_MESSAGE =
  "No sending mailbox is available right now — the message stays queued and will retry.";
