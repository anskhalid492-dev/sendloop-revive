/**
 * Scheduler liveness evaluation.
 *
 * The campaign engine only auto-runs when an external scheduler (production
 * pg_cron) keeps calling `/api/public/cron/run-campaigns`. That registration
 * lives in the database, outside the application deployment, so it can be lost
 * silently — which is exactly what happened when no `cron.job` row existed and
 * campaigns only moved when someone pressed "send due now".
 *
 * Every invocation of the runner endpoint records a heartbeat; these pure
 * helpers turn that heartbeat into an explicit health state the admin console
 * shows, so a missing cron registration is visible instead of silent.
 */

/** How often production pg_cron is expected to invoke the campaign runner. */
export const SCHEDULER_EXPECTED_INTERVAL_MS = 5 * 60_000;

/** Ticks may be missed transiently; only alert after this many intervals. */
export const SCHEDULER_STALE_AFTER_MS = 3 * SCHEDULER_EXPECTED_INTERVAL_MS;

export type SchedulerHealthState = "healthy" | "stale" | "never";

export type SchedulerHealth = {
  state: SchedulerHealthState;
  lastTickAt: string | null;
  minutesSinceTick: number | null;
  message: string;
};

export type SchedulerHeartbeat = { lastTickAt?: string | null } | null | undefined;

export function evaluateSchedulerHealth(
  heartbeat: SchedulerHeartbeat,
  now: Date = new Date(),
  staleAfterMs: number = SCHEDULER_STALE_AFTER_MS,
): SchedulerHealth {
  const raw = heartbeat?.lastTickAt ?? null;
  const ts = raw ? new Date(raw).getTime() : NaN;
  if (!raw || !Number.isFinite(ts)) {
    return {
      state: "never",
      lastTickAt: null,
      minutesSinceTick: null,
      message:
        "No scheduler tick has ever been recorded. Register the production cron job that calls the campaign runner.",
    };
  }

  const elapsed = Math.max(0, now.getTime() - ts);
  const minutes = Math.floor(elapsed / 60_000);
  if (elapsed > staleAfterMs) {
    return {
      state: "stale",
      lastTickAt: raw,
      minutesSinceTick: minutes,
      message: `The campaign scheduler has not ticked for ${minutes} minutes. Campaigns will not auto-send until the cron job runs again.`,
    };
  }
  return {
    state: "healthy",
    lastTickAt: raw,
    minutesSinceTick: minutes,
    message: `Last scheduler tick ${minutes} minute${minutes === 1 ? "" : "s"} ago.`,
  };
}
