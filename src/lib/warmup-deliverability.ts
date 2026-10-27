/**
 * Warmup deliverability — observed evidence only.
 *
 * Every number is derived from individual warmup_jobs rows (one row = one
 * warmup email), deduplicated by job id, inside one measurement window.
 *
 *   Inbox / Spam  → only when the receiving mailbox was actually read and the
 *                   message was found in its inbox or spam/junk folder.
 *   Bounce        → confirmed bounce state/placement on the job.
 *   Reply         → the peer's reply job was actually sent.
 *   Unverified    → attempted, not bounced/failed, but no folder observation.
 *
 * SMTP acceptance or "received_unknown" (arrived, folder unknown) never counts
 * as inbox. Health score is never used here.
 */

export const DELIVERABILITY_PERIODS = ["today", "last7", "last30", "all"] as const;
export type DeliverabilityPeriod = (typeof DELIVERABILITY_PERIODS)[number];

export const PERIOD_LABEL: Record<DeliverabilityPeriod, string> = {
  today: "Today",
  last7: "Last 7 days",
  last30: "Last 30 days",
  all: "All time",
};

/** Below this many emails in a denominator a rate is shown as "Not enough data". */
export const MIN_SAMPLE = 10;

export type DeliverabilityJob = {
  id: string;
  sending_account_id: string;
  role?: string | null;
  status?: string | null;
  delivery_state?: string | null;
  placement?: string | null;
  idempotency_key?: string | null;
  processed_at?: string | null;
};

export type Rate = { value: number | null; numerator: number; denominator: number };

export type DeliverabilityMetrics = {
  sent: number;
  measured: number;
  inbox: number;
  spam: number;
  bounced: number;
  failed: number;
  unverified: number;
  replied: number;
  eligibleForReply: number;
  inboxRate: Rate;
  spamRate: Rate;
  bounceRate: Rate;
  replyRate: Rate;
  unverifiedRate: Rate;
};

/** UTC start of the window, or null for all time. */
export function periodStart(period: DeliverabilityPeriod, now = new Date()): string | null {
  if (period === "all") return null;
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const back = period === "today" ? 0 : period === "last7" ? 6 : 29;
  return new Date(day - back * 86_400_000).toISOString();
}

export function rateOf(numerator: number, denominator: number, min = MIN_SAMPLE): Rate {
  return {
    numerator,
    denominator,
    value: denominator >= min && denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null,
  };
}

const ATTEMPTED_STATUS = new Set(["sent", "delivered", "replied", "bounced", "failed"]);
const ATTEMPTED_STATE = new Set(["sent", "delivered", "bounced", "failed"]);

function isAttempted(j: DeliverabilityJob) {
  return ATTEMPTED_STATUS.has(j.status ?? "") || ATTEMPTED_STATE.has(j.delivery_state ?? "");
}
function isBounced(j: DeliverabilityJob) {
  return j.delivery_state === "bounced" || j.status === "bounced" || j.placement === "not_delivered";
}
function isFailed(j: DeliverabilityJob) {
  return !isBounced(j) && (j.delivery_state === "failed" || j.status === "failed");
}
function isSentReply(j: DeliverabilityJob) {
  return j.role === "reply" && ["sent", "delivered", "replied"].includes(j.status ?? "");
}

/**
 * Computes metrics for the given jobs. `jobs` must already be limited to one
 * window; duplicates (same id) are counted once.
 */
export function computeDeliverability(jobs: DeliverabilityJob[]): DeliverabilityMetrics {
  const unique = new Map<string, DeliverabilityJob>();
  for (const j of jobs) if (j?.id && !unique.has(j.id)) unique.set(j.id, j);

  const repliedTo = new Set<string>();
  for (const j of unique.values()) {
    if (isSentReply(j) && j.idempotency_key?.startsWith("reply:")) repliedTo.add(j.idempotency_key.slice(6));
  }

  let sent = 0, inbox = 0, spam = 0, bounced = 0, failed = 0, unverified = 0, replied = 0, eligible = 0;
  for (const j of unique.values()) {
    if (j.role === "reply") continue; // replies are peer traffic, not this mailbox's warmup sends
    if (!isAttempted(j)) continue;
    sent += 1;
    if (isBounced(j)) { bounced += 1; continue; }
    if (isFailed(j)) { failed += 1; continue; }
    if (j.placement === "inbox") inbox += 1;
    else if (j.placement === "spam") spam += 1;
    else unverified += 1;
    const arrived = j.placement === "inbox" || j.placement === "spam" || j.placement === "received_unknown"
      || j.delivery_state === "delivered" || j.status === "replied";
    if (arrived) {
      eligible += 1;
      if (j.status === "replied" || repliedTo.has(j.id)) replied += 1;
    }
  }
  const measured = inbox + spam;
  return {
    sent, measured, inbox, spam, bounced, failed, unverified, replied, eligibleForReply: eligible,
    inboxRate: rateOf(inbox, measured),
    spamRate: rateOf(spam, measured),
    bounceRate: rateOf(bounced, sent),
    replyRate: rateOf(replied, eligible),
    unverifiedRate: rateOf(unverified, sent),
  };
}

export function groupDeliverability(jobs: DeliverabilityJob[]): Map<string, DeliverabilityMetrics> {
  const by = new Map<string, DeliverabilityJob[]>();
  for (const j of jobs) {
    const list = by.get(j.sending_account_id);
    if (list) list.push(j); else by.set(j.sending_account_id, [j]);
  }
  // Reply jobs belong to the peer mailbox; give every mailbox the full reply set.
  const replies = jobs.filter((j) => j.role === "reply");
  const out = new Map<string, DeliverabilityMetrics>();
  for (const [id, list] of by) out.set(id, computeDeliverability([...list, ...replies]));
  return out;
}

export function formatRateValue(rate: Rate): string {
  return rate.value === null ? "Not enough data" : `${rate.value.toFixed(1)}%`;
}

export function formatRateSample(rate: Rate, unit = "measured"): string {
  return `${rate.numerator.toLocaleString()} of ${rate.denominator.toLocaleString()} ${unit}`;
}
