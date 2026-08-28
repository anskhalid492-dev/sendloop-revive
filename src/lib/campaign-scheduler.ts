/**
 * Pure scheduling helpers for the campaign cron invocation.
 *
 * The cron endpoint must always answer well inside the platform's HTTP request
 * timeout. Instead of processing every campaign in one long request (which is
 * what made the 8:00/8:05 invocations time out), each invocation works within a
 * time budget and hands the rest of the queue to the next invocation. These
 * helpers are pure so the behaviour is unit-testable without a database.
 */

export type SchedulerLease = {
  token: string;
  expiresAt: string;
} | null;

/** Default wall-clock budget for one cron invocation (ms). */
export const SCHEDULER_BUDGET_MS = 20_000;

/** How long a scheduler lease is held before it is considered abandoned (ms). */
export const SCHEDULER_LEASE_TTL_MS = 60_000;

/** True when another invocation still holds a valid (non-expired) lease. */
export function isLeaseHeld(lease: SchedulerLease, now: Date): boolean {
  if (!lease?.expiresAt) return false;
  const expires = new Date(lease.expiresAt).getTime();
  if (!Number.isFinite(expires)) return false;
  return expires > now.getTime();
}

/**
 * Rotates the campaign list so the invocation continues after the campaign the
 * previous (budget-exhausted) invocation stopped at. Without this a repeatedly
 * timing-out scheduler would always re-process the first campaigns and starve
 * the tail of the queue.
 */
export function orderCampaignsForRun<T extends { id: string }>(
  campaigns: T[],
  cursorId: string | null,
): T[] {
  if (!cursorId) return [...campaigns];
  const index = campaigns.findIndex((c) => c.id === cursorId);
  if (index < 0) return [...campaigns];
  return [...campaigns.slice(index + 1), ...campaigns.slice(0, index + 1)];
}

/** True while there is enough budget left to start another campaign. */
export function hasBudgetRemaining(startedAtMs: number, nowMs: number, budgetMs: number): boolean {
  return nowMs - startedAtMs < budgetMs;
}
