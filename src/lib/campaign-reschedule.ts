/**
 * Re-planning of an existing campaign queue after the schedule settings change.
 *
 * `scheduled_at` is always derived from the campaign's selected sending days +
 * sending window + timezone. Nothing here talks to the database so the
 * calculation stays unit-testable.
 */
import { isInSendWindow, windowStartAt, zonedDayKey, type ScheduleWindow } from "./campaign-schedule";

export type QueuedMessageRow = {
  id: string;
  scheduled_at: string | null;
  /**
   * First-step rows may be pulled FORWARD onto today's window when today is a
   * selected sending day. Follow-ups keep their own due time as the floor so a
   * configured wait is never shortened.
   */
  pull_forward?: boolean;
};

export type RescheduleUpdate = { id: string; scheduledAt: string };

export type QueueCapacity = {
  /** 0 means unlimited. */
  dailyLimit: number;
  /** Sends already accepted or claimed, keyed by campaign-local YYYY-MM-DD. */
  occupiedByDay?: ReadonlyMap<string, number>;
};

/**
 * Earliest moment at or after `floor` that sits inside a configured window.
 * A floor already inside a window is kept exactly (send now), otherwise the
 * next configured window start is used.
 */
export function earliestEligibleAt(floor: Date, window: ScheduleWindow): Date {
  if (isInSendWindow(floor, window)) return floor;
  return windowStartAt(floor, window, { includeCurrentDay: true });
}

/** Returns only the queued rows whose `scheduled_at` must change. */
export function planQueueReschedule(
  rows: QueuedMessageRow[],
  window: ScheduleWindow,
  now: Date,
  capacity: QueueCapacity = { dailyLimit: 0 },
): RescheduleUpdate[] {
  const updates: RescheduleUpdate[] = [];
  const plannedByDay = new Map<string, number>();
  const dailyLimit = Math.max(0, Math.floor(capacity.dailyLimit));

  for (const row of rows) {
    const parsed = row.scheduled_at ? new Date(row.scheduled_at) : null;
    const current = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    const pullForward = row.pull_forward !== false;
    const floor = pullForward || !current ? now : current.getTime() < now.getTime() ? now : current;
    let candidate = earliestEligibleAt(floor, window);

    if (dailyLimit > 0) {
      for (let dayAttempts = 0; dayAttempts < 15; dayAttempts += 1) {
        const day = zonedDayKey(candidate, window.timezone);
        const occupied = capacity.occupiedByDay?.get(day) ?? 0;
        const planned = plannedByDay.get(day) ?? 0;
        if (occupied + planned < dailyLimit) {
          plannedByDay.set(day, planned + 1);
          break;
        }
        candidate = windowStartAt(candidate, window, { includeCurrentDay: false });
      }
    }

    // A due row already in this same legal window remains stable. This avoids
    // rewriting its timestamp to a slightly newer `now` on every cron tick.
    const candidateDay = zonedDayKey(candidate, window.timezone);
    const keepCurrent = current &&
      isInSendWindow(current, window) &&
      current.getTime() <= now.getTime() &&
      candidate.getTime() <= now.getTime() &&
      zonedDayKey(current, window.timezone) === candidateDay;
    const next = (keepCurrent ? current : candidate).toISOString();
    if (!current || current.toISOString() !== next) {
      updates.push({ id: row.id, scheduledAt: next });
    }
  }
  return updates;
}


/** Groups updates so identical timestamps are written in one statement. */
export function groupRescheduleUpdates(updates: RescheduleUpdate[]): Array<{ scheduledAt: string; ids: string[] }> {
  const byTime = new Map<string, string[]>();
  for (const update of updates) {
    const list = byTime.get(update.scheduledAt) ?? [];
    list.push(update.id);
    byTime.set(update.scheduledAt, list);
  }
  return [...byTime.entries()].map(([scheduledAt, ids]) => ({ scheduledAt, ids }));
}
