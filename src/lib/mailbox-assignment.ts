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
  provider?: string | null;
};

/**
 * Providers governed by the shared MunchReach infrastructure toggles in
 * `email_providers`. Everything else is a CUSTOMER-CONNECTED mailbox (SMTP /
 * IMAP / Google / Microsoft sending through the relay): those are owned by the
 * customer, are never listed in `email_providers`, and must therefore never be
 * ruled ineligible by that table — doing so left whole campaigns stuck on
 * "No sending mailbox is available".
 */
export const MANAGED_SHARED_PROVIDERS = new Set([
  "ses",
  "resend",
  "maileroo",
  "emailit",
  "sendgrid",
  "mailgun",
  "postmark",
]);

/** True when the provider's availability is decided by `email_providers`. */
export function isManagedSharedProvider(provider: string | null | undefined): boolean {
  return MANAGED_SHARED_PROVIDERS.has(String(provider ?? "").toLowerCase());
}

/**
 * A mailbox that is allowed to send right now (ignoring capacity).
 *
 * `allowedProviders`, when given, is the set of shared providers currently
 * enabled for customer sending. A mailbox on a disabled shared provider (e.g.
 * SES turned off) is ineligible: its messages must be repaired onto another
 * mailbox instead of being claimed and deferred forever. Customer-connected
 * mailboxes are not affected by that set.
 */
export function isEligibleMailbox(
  account: AssignableMailbox | null | undefined,
  allowedProviders?: Set<string> | null,
): boolean {
  if (!account) return false;
  if (account.paused) return false;
  if (account.customer_enabled === false) return false;
  if (account.status === "disabled") return false;
  if (account.status === "disconnected") return false;
  if (
    allowedProviders &&
    isManagedSharedProvider(account.provider) &&
    !allowedProviders.has(String(account.provider ?? ""))
  ) {
    return false;
  }
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
  /** Providers currently enabled for customer sending, when known. */
  allowedProviders?: Set<string> | null;
}): string | null {
  const usage = input.usageById ?? new Map<string, number>();
  let best: { id: string; used: number } | null = null;
  for (const id of input.poolIds) {
    const account = input.accountsById.get(id);
    if (!isEligibleMailbox(account, input.allowedProviders)) continue;
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
