/**
 * Pure campaign run/recurrence model.
 *
 * A recurring campaign is a *daily* job: every configured sending day it opens
 * a new run with a fresh daily quota. The next run is derived from the campaign
 * schedule + timezone only — never from when the last email happened to be
 * sent, and never from a lifetime "sent" total.
 */
import { campaignScheduleState, type ScheduleWindow } from "@/lib/campaign-schedule";

export type CampaignRunState =
  | "draft"
  | "scheduled"
  | "running"
  | "daily_quota_reached"
  | "lifetime_limit_reached"
  | "waiting_for_next_run"
  | "completed"
  | "paused"
  | "blocked"
  | "archived";

export const CAMPAIGN_RUN_STATE_LABELS: Record<CampaignRunState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  running: "Running",
  daily_quota_reached: "Daily quota reached",
  lifetime_limit_reached: "Send limit reached",
  waiting_for_next_run: "Waiting for next run",
  completed: "Completed",
  paused: "Paused",
  blocked: "Blocked",
  archived: "Archived",
};


/**
 * The first send slot strictly after the current sending day, i.e. the start of
 * the campaign's next run. Timezone and send days are respected, so a Friday
 * evening run on a Mon–Fri campaign points at Monday.
 */
export function nextRunAt(now: Date, window: ScheduleWindow): Date {
  // Strictly the next sending day's configured start time. Never `now`, never
  // the last send, never the cron tick.
  return campaignScheduleState(now, window).nextWindowStart;
}

/**
 * When the campaign may next send: the current run's configured start time
 * while today's window is still open and the quota is not exhausted,
 * otherwise the next scheduled day's start time.
 */
export function nextEligibleAt(
  now: Date,
  window: ScheduleWindow,
  quotaExhausted: boolean,
): Date {
  if (quotaExhausted) return nextRunAt(now, window);
  return campaignScheduleState(now, window).eligibleWindowStart;
}

export type RunStateInput = {
  status: string;
  /** Campaign daily quota (`campaigns.daily_cap`); 0 = unlimited. */
  dailyQuota: number;
  /** Successful sends inside the current local sending day. */
  sentToday: number;
  /** Recipients that still have something left to send (ever). */
  remainingRecipients: number;
  /** Lifetime allowance (`campaigns.email_send_limit`); 0 = unlimited. */
  lifetimeLimit?: number;
  /** Lifetime successful sends for this campaign. */
  lifetimeSent?: number;
  /** True when a safety/provider condition blocks sending right now. */
  blocked?: boolean;
  now: Date;
  window: ScheduleWindow;
};

export type RunStatus = {
  state: CampaignRunState;
  label: string;
  /** Successful sends still allowed in the current run (null = unlimited). */
  remainingDailyCapacity: number | null;
  nextRunAt: string | null;
  inWindow: boolean;
};

/**
 * Derives the run state. Reaching the daily quota is explicitly NOT "paused"
 * and NOT "completed": the campaign waits and becomes eligible again at its
 * next scheduled run. Reaching the lifetime allowance is its own state too —
 * only an empty audience is "completed".
 */
export function campaignRunStatus(input: RunStateInput): RunStatus {
  const { status, dailyQuota, sentToday, remainingRecipients, now, window } = input;
  const quota = dailyQuota > 0 ? dailyQuota : 0;
  const remainingDailyCapacity = quota > 0 ? Math.max(0, quota - Math.max(0, sentToday)) : null;
  const quotaExhausted = quota > 0 && sentToday >= quota;
  const lifetimeLimit = Number(input.lifetimeLimit ?? 0) || 0;
  const lifetimeExhausted = lifetimeLimit > 0 && Number(input.lifetimeSent ?? 0) >= lifetimeLimit;
  const schedule = campaignScheduleState(now, window);
  const inWindow = schedule.inWindow;

  const finish = (state: CampaignRunState, next: Date | null): RunStatus => ({
    state,
    label: CAMPAIGN_RUN_STATE_LABELS[state],
    remainingDailyCapacity,
    nextRunAt: next ? next.toISOString() : null,
    inWindow,
  });

  if (status === "draft") return finish("draft", null);
  if (status === "archived") return finish("archived", null);
  if (status === "paused") return finish("paused", null);
  if (status === "completed") return finish("completed", null);
  if (input.blocked) return finish("blocked", nextRunAt(now, window));
  if (remainingRecipients <= 0) return finish("completed", null);
  if (lifetimeExhausted) return finish("lifetime_limit_reached", null);

  if (status === "scheduled") return finish("scheduled", nextEligibleAt(now, window, false));
  if (quotaExhausted) return finish("daily_quota_reached", nextRunAt(now, window));
  if (!inWindow) return finish("waiting_for_next_run", schedule.eligibleWindowStart);
  return finish("running", nextEligibleAt(now, window, false));
}

/**
 * Permanent send failures. These are never retried: the address or the
 * recipient itself is the problem, so another attempt can only ever fail.
 */
const PERMANENT_FAILURE_PATTERNS: RegExp[] = [
  /hard\s*bounce/i,
  /permanent(ly)?\s*(fail|reject|bounce)/i,
  /invalid\s*(recipient|address|email|destination)/i,
  /no\s*such\s*(user|mailbox|recipient)/i,
  /mailbox\s*(does\s*not\s*exist|unavailable\s*permanently)/i,
  /address\s*rejected/i,
  /recipient\s*(suppressed|blocked|blacklisted)/i,
  /suppress(ed|ion)/i,
  /unsubscrib/i,
  /complaint/i,
  /5\.[17]\.\d+/,
  /domain\s*(not\s*found|does\s*not\s*exist)/i,
  /account\s*disabled/i,
  /message\s*rejected/i,
];

/** True when a failed attempt may be retried on a later run. */
export function isRetryableFailure(lastError: string | null | undefined): boolean {
  const text = (lastError ?? "").trim();
  // No recorded reason: treat as transient (the attempt counter still bounds it).
  if (!text) return true;
  return !PERMANENT_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}
