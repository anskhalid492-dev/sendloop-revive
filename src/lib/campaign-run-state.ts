import { classifyEmailOutcome } from "./email-outcome";
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
  daily_quota_reached: "Send limit reached",
  lifetime_limit_reached: "Total send limit reached",
  waiting_for_next_run: "Waiting for next window",
  completed: "Completed",
  paused: "Paused",
  blocked: "Needs attention",
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

/**
 * Setup failures: nothing was ever offered to the recipient, the *account*
 * configuration refused the send (paused mailbox, missing connection, relay
 * unreachable, bad credentials). The customer can fix these, so they must be
 * retried once fixed — even if the wording happens to trip a permanent
 * pattern, and even after the normal attempt budget is spent.
 */
const SETUP_FAILURE_PATTERNS: RegExp[] = [
  /mailbox\s*is\s*paused/i,
  /no\s*(connected|active)\s*mailbox/i,
  /mailbox\s*(is\s*)?not\s*(connected|active)/i,
  /reactivate\s*it\s*under\s*email\s*accounts/i,
  /connect\s*(your|a)\s*mailbox/i,
  // Only relay *configuration/availability* problems — never a relay-reported
  // permanent SMTP rejection, whose text also mentions the relay.
  /relay\s*(is\s*)?not\s*configured/i,
  /missing\s*relay\s*secret/i,
  /relay\s*returned\s*(an\s*unreadable|50[0-9])/i,
  /relay\s*(is\s*)?(unavailable|unreachable|degraded)/i,
  /SERVICE_DEGRADED/i,
  /provider\s*(is\s*)?(unavailable|disabled|not\s*configured)/i,
  /authentication\s*fail/i,
  /invalid\s*(credentials|login|password)/i,
  /login\s*(failed|denied)/i,
  /535|534|530/,
  /connection\s*(refused|reset|timed?\s*out|closed)/i,
  /stream\s*was\s*cancelled/i,
  /unknown\s*action/i,
  /not\s*configured/i,
];

/** True when the failure is an account/configuration problem the customer can fix. */
export function isSetupFailure(lastError: string | null | undefined): boolean {
  const text = (lastError ?? "").trim();
  if (!text) return false;
  return SETUP_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

/** True when the address/recipient itself was permanently rejected. */
export function isPermanentFailure(lastError: string | null | undefined): boolean {
  const text = (lastError ?? "").trim();
  if (!text) return false;
  if (classifyEmailOutcome(text).outcome === "bounced") return true;
  return PERMANENT_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

/** True when a failed attempt may be retried on a later run. */
export function isRetryableFailure(lastError: string | null | undefined): boolean {
  // A permanent rejection always wins: retrying a dead address can only bounce.
  if (isPermanentFailure(lastError)) return false;
  if (isSetupFailure(lastError)) return true;
  // Anything else (including no recorded reason) is transient; the attempt
  // counter still bounds how often it is retried.
  return true;
}
