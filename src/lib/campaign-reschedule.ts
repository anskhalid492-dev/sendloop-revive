/**
 * Re-planning of an existing campaign queue after the schedule settings change.
 *
 * `scheduled_at` is always derived from the campaign's selected sending days +
 * sending window + timezone. Nothing here talks to the database so the
 * calculation stays unit-testable.
 */
import { isInSendWindow, windowStartAt, type ScheduleWindow } from "./campaign-schedule";

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
): RescheduleUpdate[] {
  const updates: RescheduleUpdate[] = [];
  for (const row of rows) {
    const parsed = row.scheduled_at ? new Date(row.scheduled_at) : null;
    const current = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    const pullForward = row.pull_forward !== false;
    const floor = pullForward || !current ? now : current.getTime() < now.getTime() ? now : current;
    const next = earliestEligibleAt(floor, window).toISOString();
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
