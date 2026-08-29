/**
 * Re-planning of an existing campaign queue after the schedule settings change.
 *
 * `scheduled_at` is always derived from the campaign's selected sending days +
 * sending window + timezone. Nothing here talks to the database so the
 * calculation stays unit-testable.
 */
import { alignToSendWindow, type ScheduleWindow } from "./campaign-schedule";

export type QueuedMessageRow = { id: string; scheduled_at: string | null };

export type RescheduleUpdate = { id: string; scheduledAt: string };

/** Returns only the queued rows whose `scheduled_at` must change. */
export function planQueueReschedule(
  rows: QueuedMessageRow[],
  window: ScheduleWindow,
  now: Date,
): RescheduleUpdate[] {
  const updates: RescheduleUpdate[] = [];
  for (const row of rows) {
    const current = row.scheduled_at ? new Date(row.scheduled_at) : null;
    const next = alignToSendWindow(current, window, now).toISOString();
    if (!current || Number.isNaN(current.getTime()) || current.toISOString() !== next) {
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
