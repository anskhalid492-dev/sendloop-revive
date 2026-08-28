/**
 * Single source of truth for *why* a mailbox is not sending, and whether the
 * customer's "Resume" action is allowed to clear that state.
 *
 * The distinction this module enforces:
 *
 *  - A **safety block** (bounce rate, complaint rate, provider/auth failure)
 *    protects the domain. Resume must never clear it while the violation is
 *    still active.
 *  - A **manual pause** or a **stale safety block** (the violation is no longer
 *    present in the current data) is resumable.
 *  - **Temporarily out of sending capacity** (the rolling 12-hour window is
 *    full) is NOT a block at all: the mailbox becomes eligible again on its own
 *    as soon as the oldest sends fall outside the window.
 *
 * Everything here is pure so both the warmup safety guard and the Resume
 * server function evaluate the exact same conditions — which is what stops a
 * resumed mailbox from being re-paused seconds later by the runner.
 */

export type MailboxPauseKind =
  | "none"
  /** A. Customer (or admin) pressed Pause. */
  | "manual"
  /** B. Rolling-window sending capacity is temporarily exhausted. */
  | "capacity"
  /** C. Bounce-rate safety block. */
  | "bounce_safety"
  /** D. Complaint-rate safety block. */
  | "complaint_safety"
  /** E. Provider connection / authentication failure. */
  | "provider_failure"
  /** F. Mailbox switched off by the customer. */
  | "disabled"
  /** G. Any other automatic safety block (health score, failure rate). */
  | "auto_safety";

export type SafetyStatRow = {
  sent?: number | null;
  bounced?: number | null;
  failed?: number | null;
  complained?: number | null;
};

/** Below this many sends the rates are noise, so no safety block is raised. */
export const SAFETY_MIN_SAMPLE = 10;
/** Complaint ceiling used when a workspace has not configured its own. */
export const DEFAULT_MAX_COMPLAINT_RATE = 0.5;

export type SafetyTotals = {
  sent: number;
  bounced: number;
  failed: number;
  complained: number;
};

export function aggregateSafetyStats(rows: SafetyStatRow[]): SafetyTotals {
  return rows.reduce<SafetyTotals>(
    (acc, row) => ({
      sent: acc.sent + Number(row.sent ?? 0),
      bounced: acc.bounced + Number(row.bounced ?? 0),
      failed: acc.failed + Number(row.failed ?? 0),
      complained: acc.complained + Number(row.complained ?? 0),
    }),
    { sent: 0, bounced: 0, failed: 0, complained: 0 },
  );
}

export function bounceRatePct(totals: SafetyTotals): number {
  return totals.sent > 0 ? (totals.bounced / totals.sent) * 100 : 0;
}

export function complaintRatePct(totals: SafetyTotals): number {
  return totals.sent > 0 ? (totals.complained / totals.sent) * 100 : 0;
}

export type SafetyViolation = {
  kind: MailboxPauseKind;
  active: boolean;
  reason: string | null;
};

export const NO_VIOLATION: SafetyViolation = { kind: "none", active: false, reason: null };

/**
 * Evaluates the *current* safety condition of a mailbox. Order and thresholds
 * intentionally mirror the historical warmup guard — nothing is loosened here.
 */
export function evaluateSafetyViolation(input: {
  stats: SafetyStatRow[];
  maxBounceRate: number;
  maxComplaintRate?: number | null;
  minHealthScore: number;
  healthScore?: number | null;
  accountStatus?: string | null;
  authStatuses?: Array<string | null | undefined>;
  minSample?: number;
}): SafetyViolation {
  const totals = aggregateSafetyStats(input.stats);
  const minSample = input.minSample ?? SAFETY_MIN_SAMPLE;
  const maxComplaint = input.maxComplaintRate ?? DEFAULT_MAX_COMPLAINT_RATE;

  if (totals.sent >= minSample && bounceRatePct(totals) > input.maxBounceRate) {
    return {
      kind: "bounce_safety",
      active: true,
      reason: `Bounce rate ${bounceRatePct(totals).toFixed(1)}% exceeded the ${input.maxBounceRate}% limit.`,
    };
  }
  if (totals.sent >= minSample && complaintRatePct(totals) > maxComplaint) {
    return {
      kind: "complaint_safety",
      active: true,
      reason: `Complaint rate ${complaintRatePct(totals).toFixed(2)}% exceeded the ${maxComplaint}% limit.`,
    };
  }
  if (
    totals.sent >= minSample &&
    (totals.failed / Math.max(1, totals.sent + totals.failed)) * 100 > 30
  ) {
    return {
      kind: "auto_safety",
      active: true,
      reason: "More than 30% of provider send attempts failed.",
    };
  }
  if ((input.healthScore ?? 100) < input.minHealthScore) {
    return {
      kind: "auto_safety",
      active: true,
      reason: `Health score ${input.healthScore} is below the ${input.minHealthScore} minimum.`,
    };
  }
  if (input.accountStatus === "failed") {
    return {
      kind: "provider_failure",
      active: true,
      reason: "The mailbox connection test is failing.",
    };
  }
  if ((input.authStatuses ?? []).includes("fail")) {
    return {
      kind: "provider_failure",
      active: true,
      reason: "Domain authentication (SPF/DKIM/DMARC) is failing.",
    };
  }
  return NO_VIOLATION;
}

export type MailboxPauseState = {
  kind: MailboxPauseKind;
  /** True when a customer "Resume" click is allowed to clear this state. */
  resumable: boolean;
  /** True for states that clear themselves without any action. */
  temporary: boolean;
  label: string;
  detail: string | null;
};

/**
 * Turns raw mailbox flags plus the current safety evaluation into the state the
 * UI renders and the Resume action obeys.
 */
export function classifyMailboxPause(input: {
  manuallyPaused?: boolean | null;
  customerEnabled?: boolean | null;
  pausedBySystem?: boolean | null;
  pauseReason?: string | null;
  accountStatus?: string | null;
  capacityExhausted?: boolean | null;
  violation?: SafetyViolation | null;
}): MailboxPauseState {
  const violation = input.violation ?? NO_VIOLATION;

  if (input.customerEnabled === false) {
    return {
      kind: "disabled",
      resumable: false,
      temporary: false,
      label: "Disabled",
      detail: "This mailbox is switched off. Re-enable it before resuming sending.",
    };
  }

  if (violation.active && violation.kind === "provider_failure") {
    return {
      kind: "provider_failure",
      resumable: false,
      temporary: false,
      label: "Blocked by provider/authentication failure",
      detail: violation.reason,
    };
  }
  if (input.accountStatus === "failed") {
    return {
      kind: "provider_failure",
      resumable: false,
      temporary: false,
      label: "Blocked by provider/authentication failure",
      detail: "The mailbox connection test is failing.",
    };
  }

  if (violation.active) {
    return {
      kind: violation.kind,
      resumable: false,
      temporary: false,
      label:
        violation.kind === "bounce_safety"
          ? "Blocked by bounce-rate protection"
          : violation.kind === "complaint_safety"
            ? "Blocked by complaint-rate protection"
            : "Blocked by automatic safety protection",
      detail: violation.reason,
    };
  }

  // A system pause whose underlying condition is gone is stale — resumable.
  if (input.pausedBySystem) {
    return {
      kind: "auto_safety",
      resumable: true,
      temporary: false,
      label: "Paused",
      detail:
        input.pauseReason ??
        "This mailbox was paused automatically. The condition is no longer active.",
    };
  }

  if (input.manuallyPaused) {
    return {
      kind: "manual",
      resumable: true,
      temporary: false,
      label: "Paused",
      detail: "Paused manually.",
    };
  }

  if (input.capacityExhausted) {
    return {
      kind: "capacity",
      resumable: true,
      temporary: true,
      label: "Temporarily unavailable",
      detail: "Sending capacity for the current 12-hour window is used up.",
    };
  }

  return { kind: "none", resumable: true, temporary: false, label: "Active", detail: null };
}

export type ResumeDecision = {
  allowed: boolean;
  kind: MailboxPauseKind;
  message: string;
};

/** What the Resume button is allowed to do for a given state. */
export function resumeDecision(state: MailboxPauseState): ResumeDecision {
  if (state.kind === "capacity") {
    return {
      allowed: true,
      kind: state.kind,
      message:
        "This mailbox is not blocked — it is temporarily out of sending capacity and becomes eligible again automatically.",
    };
  }
  if (!state.resumable) {
    return {
      allowed: false,
      kind: state.kind,
      message: `${state.label}. Resume cannot override this safety block. ${state.detail ?? ""}`.trim(),
    };
  }
  return { allowed: true, kind: state.kind, message: "Sending resumed." };
}

/* --------------------------------------------------- live safety snapshot */

/** Rolling window (days) the bounce/complaint rates are measured over. */
export const SAFETY_WINDOW_DAYS = 7;

/** Safety conditions are re-evaluated by the runner on the hour. */
export function nextSafetyEvaluationAt(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

export type SafetyMetrics = {
  windowDays: number;
  sent: number;
  bounced: number;
  complained: number;
  failed: number;
  bounceRate: number;
  complaintRate: number;
  maxBounceRate: number;
  maxComplaintRate: number;
  /** Below this many sends in the window, rates are not enforced. */
  minSample: number;
  sampleSufficient: boolean;
};

export type MailboxSafetySnapshot = {
  state: MailboxPauseState;
  violation: SafetyViolation;
  metrics: SafetyMetrics;
  /** A stored system pause whose condition is no longer present. */
  stale: boolean;
  nextEvaluationAt: string;
};

/**
 * One evaluation used by the mailbox list, the Resume action and the runner so
 * the UI can never show a stale "Blocked by bounce-rate protection" badge for a
 * mailbox whose recent numbers are healthy again.
 */
export function evaluateMailboxSafety(input: {
  stats: SafetyStatRow[];
  maxBounceRate: number;
  maxComplaintRate?: number | null;
  minHealthScore: number;
  healthScore?: number | null;
  accountStatus?: string | null;
  authStatuses?: Array<string | null | undefined>;
  minSample?: number;
  manuallyPaused?: boolean | null;
  customerEnabled?: boolean | null;
  pausedBySystem?: boolean | null;
  pauseReason?: string | null;
  capacityExhausted?: boolean | null;
  windowDays?: number;
  now?: Date;
}): MailboxSafetySnapshot {
  const minSample = input.minSample ?? SAFETY_MIN_SAMPLE;
  const totals = aggregateSafetyStats(input.stats);
  const violation = evaluateSafetyViolation({
    stats: input.stats,
    maxBounceRate: input.maxBounceRate,
    maxComplaintRate: input.maxComplaintRate ?? null,
    minHealthScore: input.minHealthScore,
    healthScore: input.healthScore ?? null,
    accountStatus: input.accountStatus ?? null,
    authStatuses: input.authStatuses ?? [],
    minSample,
  });
  const state = classifyMailboxPause({
    manuallyPaused: input.manuallyPaused ?? false,
    customerEnabled: input.customerEnabled ?? true,
    pausedBySystem: input.pausedBySystem ?? false,
    pauseReason: input.pauseReason ?? null,
    accountStatus: input.accountStatus ?? null,
    capacityExhausted: input.capacityExhausted ?? false,
    violation,
  });

  return {
    state,
    violation,
    stale: Boolean(input.pausedBySystem) && !violation.active,
    nextEvaluationAt: nextSafetyEvaluationAt(input.now ?? new Date()).toISOString(),
    metrics: {
      windowDays: input.windowDays ?? SAFETY_WINDOW_DAYS,
      sent: totals.sent,
      bounced: totals.bounced,
      complained: totals.complained,
      failed: totals.failed,
      bounceRate: Math.round(bounceRatePct(totals) * 10) / 10,
      complaintRate: Math.round(complaintRatePct(totals) * 100) / 100,
      maxBounceRate: input.maxBounceRate,
      maxComplaintRate: input.maxComplaintRate ?? DEFAULT_MAX_COMPLAINT_RATE,
      minSample,
      sampleSufficient: totals.sent >= minSample,
    },
  };
}

