/**
 * Campaign daily limit vs. real mailbox capacity.
 *
 * The customer-chosen campaign daily limit (`campaigns.daily_cap`) is the ONLY
 * authoritative daily limit for sending. `campaigns.email_send_limit` is a
 * legacy LIFETIME allowance checked once at launch; it never gates a day's
 * sending and `emails_sent_count` / `limit_reached_at` are legacy counters that
 * must never block dispatch.
 *
 * A campaign can only ever send as many emails per day as its eligible
 * mailboxes allow. That ceiling is computed here — it NEVER changes the stored
 * `daily_cap`, it only tells the planner and the UI what is achievable today.
 *
 * Pure helpers only: no Supabase, fully unit-testable.
 */
import { isEligibleMailbox, type AssignableMailbox } from "./mailbox-assignment";
import { effectiveMailboxHourlyLimit } from "./mailbox-hourly-cap";

export type CapacityMailbox = AssignableMailbox & {
  hourly_limit?: number | null;
};

export type CapacityOptions = {
  /** Length of the campaign's daily sending window, in hours. 0 = unknown. */
  windowHours?: number;
  /** Providers currently enabled for customer sending, when known. */
  allowedProviders?: Set<string> | null;
};

/** Mailboxes that may receive new assignments right now. */
export function eligibleMailboxes(
  mailboxes: CapacityMailbox[],
  allowedProviders?: Set<string> | null,
): CapacityMailbox[] {
  return mailboxes.filter((m) => isEligibleMailbox(m, allowedProviders));
}

/**
 * What ONE mailbox can send in a single sending day: its daily limit, further
 * limited by what its hourly limit allows inside the sending window.
 */
export function mailboxDayCapacity(mailbox: CapacityMailbox, windowHours = 0): number {
  const daily = Math.max(0, Math.floor(Number(mailbox.daily_limit ?? 0)));
  if (daily <= 0) return 0;
  const hours = Math.max(0, Math.floor(windowHours));
  if (hours <= 0) return daily;
  return Math.min(daily, effectiveMailboxHourlyLimit(mailbox.hourly_limit) * hours);
}

/** Total emails every eligible mailbox can send in one sending day. */
export function mailboxDailyCapacity(
  mailboxes: CapacityMailbox[],
  options: CapacityOptions = {},
): number {
  return eligibleMailboxes(mailboxes, options.allowedProviders).reduce(
    (sum, m) => sum + mailboxDayCapacity(m, options.windowHours ?? 0),
    0,
  );
}

export type CampaignDailyPlan = {
  /** The stored, customer-chosen limit — never lowered by this module. */
  configuredLimit: number;
  /** What the eligible mailboxes can actually deliver today. */
  mailboxCapacity: number;
  /** The number the planner/dispatcher may actually use today. */
  achievableLimit: number;
  bottleneck: "campaign" | "mailboxes" | "none";
};

/**
 * Combines the campaign limit with real mailbox capacity. The stored limit is
 * preserved verbatim: when mailboxes are the smaller number they cap today's
 * sending only, so raising mailbox limits later unlocks the full campaign limit
 * with no further code or configuration change.
 */
export function campaignDailyPlan(input: {
  /** `campaigns.daily_cap`; 0 = unlimited. */
  configuredLimit: number;
  /** 0 when unknown (no mailbox rows loaded) — then the campaign limit stands. */
  mailboxCapacity: number;
}): CampaignDailyPlan {
  const configuredLimit = Math.max(0, Math.floor(Number(input.configuredLimit) || 0));
  const mailboxCapacity = Math.max(0, Math.floor(Number(input.mailboxCapacity) || 0));
  if (mailboxCapacity <= 0) {
    return {
      configuredLimit,
      mailboxCapacity,
      achievableLimit: configuredLimit,
      bottleneck: configuredLimit > 0 ? "campaign" : "none",
    };
  }
  if (configuredLimit <= 0) {
    return { configuredLimit, mailboxCapacity, achievableLimit: mailboxCapacity, bottleneck: "mailboxes" };
  }
  const achievableLimit = Math.min(configuredLimit, mailboxCapacity);
  return {
    configuredLimit,
    mailboxCapacity,
    achievableLimit,
    bottleneck: achievableLimit === configuredLimit ? "campaign" : "mailboxes",
  };
}

/**
 * Spreads `count` messages across eligible mailboxes, weighted by each
 * mailbox's remaining day capacity and INTERLEAVED so no mailbox ever receives
 * one contiguous block of the queue.
 */
export function allocateAcrossMailboxes(
  count: number,
  mailboxes: CapacityMailbox[],
  options: CapacityOptions & { usedById?: ReadonlyMap<string, number> } = {},
): string[] {
  const total = Math.max(0, Math.floor(count));
  const pool = eligibleMailboxes(mailboxes, options.allowedProviders)
    .map((m) => ({
      id: m.id,
      remaining: Math.max(
        0,
        mailboxDayCapacity(m, options.windowHours ?? 0) - (options.usedById?.get(m.id) ?? 0),
      ),
    }))
    .filter((m) => m.remaining > 0);
  if (!pool.length || total === 0) return [];

  const assignments: string[] = [];
  // Round-robin over the pool, one message per mailbox per pass, so the queue
  // alternates mailboxes; a mailbox drops out as soon as its capacity is spent.
  while (assignments.length < total) {
    let placed = false;
    for (const mailbox of pool) {
      if (assignments.length >= total) break;
      if (mailbox.remaining <= 0) continue;
      assignments.push(mailbox.id);
      mailbox.remaining -= 1;
      placed = true;
    }
    if (!placed) break; // every mailbox is full: the rest waits for another day
  }
  return assignments;
}
