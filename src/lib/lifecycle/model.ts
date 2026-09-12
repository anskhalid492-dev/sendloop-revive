/**
 * Lifecycle step model (pure, no I/O).
 *
 * Maps a track + current state onto the next step, its event key, its due date
 * and the state it moves the enrollment into. The engine only executes; every
 * schedule decision is made here so it can be unit tested.
 */
import type { LifecycleConfig, LifecycleState, LifecycleTrack } from "./config";

export const LIFECYCLE_EVENT_KEYS = {
  freeOffer5: "lifecycle.free_offer_5",
  freeOffer10: "lifecycle.free_offer_10",
  inactive1: "lifecycle.inactive_reengage_1",
  inactive2: "lifecycle.inactive_reengage_2",
  inactive3: "lifecycle.inactive_reengage_3",
  finalWarning: "lifecycle.inactive_final_warning",
  terminated: "lifecycle.account_terminated",
} as const;

export type LifecycleStep = {
  /** Idempotency key inside one enrollment. */
  stepKey: string;
  kind: "email" | "termination";
  /** Template event key (null for the termination action itself). */
  eventKey: string | null;
  /** Day offset from the enrollment baseline. */
  day: number;
  /** State the enrollment moves to once the step succeeds. */
  nextState: LifecycleState;
  /** Discount percentage attached to the email, when any. */
  discountPercent?: number;
};

export function freeTrialSteps(config: LifecycleConfig): LifecycleStep[] {
  const c = config.free_trial;
  return [
    {
      stepKey: "email_1",
      kind: "email",
      eventKey: LIFECYCLE_EVENT_KEYS.freeOffer5,
      day: c.email_1_day,
      nextState: "email_1_sent",
      discountPercent: c.discount_1_percent,
    },
    {
      stepKey: "email_2",
      kind: "email",
      eventKey: LIFECYCLE_EVENT_KEYS.freeOffer10,
      day: c.email_2_day,
      nextState: "email_2_sent",
      discountPercent: c.discount_2_percent,
    },
  ];
}

export function inactiveSteps(config: LifecycleConfig): LifecycleStep[] {
  const c = config.inactive;
  const steps: LifecycleStep[] = [
    {
      stepKey: "email_1",
      kind: "email",
      eventKey: LIFECYCLE_EVENT_KEYS.inactive1,
      day: c.email_1_day,
      nextState: "email_1_sent",
    },
    {
      stepKey: "email_2",
      kind: "email",
      eventKey: LIFECYCLE_EVENT_KEYS.inactive2,
      day: c.email_2_day,
      nextState: "email_2_sent",
    },
    {
      stepKey: "email_3",
      kind: "email",
      eventKey: LIFECYCLE_EVENT_KEYS.inactive3,
      day: c.email_3_day,
      nextState: "email_3_sent",
    },
    {
      stepKey: "final_warning",
      kind: "email",
      eventKey: LIFECYCLE_EVENT_KEYS.finalWarning,
      day: c.final_warning_day,
      nextState: "final_warning_sent",
    },
  ];
  if (c.terminate) {
    steps.push({
      stepKey: "termination",
      kind: "termination",
      eventKey: null,
      day: c.termination_day,
      nextState: "terminated",
    });
  }
  return steps;
}

export function trackSteps(track: LifecycleTrack, config: LifecycleConfig): LifecycleStep[] {
  return track === "free_trial" ? freeTrialSteps(config) : inactiveSteps(config);
}

/** Steps already covered by a state, in sequence order. */
const STATE_ORDER: LifecycleState[] = [
  "eligible",
  "email_1_sent",
  "email_2_sent",
  "email_3_sent",
  "final_warning_sent",
  "terminated",
];

export function isOpenState(state: string): boolean {
  return (
    state === "eligible" ||
    state === "email_1_sent" ||
    state === "email_2_sent" ||
    state === "email_3_sent" ||
    state === "final_warning_sent"
  );
}

/** The next step for an enrollment in `state`, or null when the track is done. */
export function nextStep(
  track: LifecycleTrack,
  state: LifecycleState,
  config: LifecycleConfig,
): LifecycleStep | null {
  const steps = trackSteps(track, config);
  const doneIndex = STATE_ORDER.indexOf(state);
  if (doneIndex < 0) return null;
  return steps.find((step) => STATE_ORDER.indexOf(step.nextState) > doneIndex) ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Absolute UTC instant a step becomes due. */
export function stepDueAt(baseline: Date | string, day: number): Date {
  const base = typeof baseline === "string" ? new Date(baseline) : baseline;
  return new Date(base.getTime() + day * DAY_MS);
}

export function daysBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  return (b.getTime() - a.getTime()) / DAY_MS;
}

/** When the next action for this enrollment is due (null when finished). */
export function nextActionAt(
  track: LifecycleTrack,
  state: LifecycleState,
  baseline: Date | string,
  config: LifecycleConfig,
): string | null {
  const step = nextStep(track, state, config);
  if (!step) return null;
  return stepDueAt(baseline, step.day).toISOString();
}

/** Termination date shown to the customer in the final-warning email. */
export function terminationDate(baseline: Date | string, config: LifecycleConfig): Date {
  return stepDueAt(baseline, config.inactive.termination_day);
}

/** Human date used in emails — always UTC so a job rerun renders identically. */
export function formatEmailDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
