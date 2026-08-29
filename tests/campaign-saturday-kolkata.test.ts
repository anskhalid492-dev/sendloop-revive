import { describe, expect, test } from "vitest";
import { isInSendWindow, normalizeSendDays, windowStartAt } from "@/lib/campaign-schedule";
import { earliestEligibleAt, planQueueReschedule } from "@/lib/campaign-reschedule";

// Sun–Sat selected, 09:00–17:00 Asia/Kolkata (UTC+5:30, no DST).
const kolkata = {
  timezone: "Asia/Kolkata",
  sendDays: [0, 1, 2, 3, 4, 5, 6],
  startHour: 9,
  endHour: 17,
};

// Saturday 2026-08-29.
const satBeforeWindow = new Date("2026-08-29T02:00:00Z"); // 07:30 IST
const satInWindow = new Date("2026-08-29T06:00:00Z"); // 11:30 IST
const mondaySlot = "2026-08-31T16:00:00.000Z";

describe("Saturday + Asia/Kolkata with Sun–Sat selected", () => {
  test("Sun–Sat means every day is valid, no Mon–Fri fallback", () => {
    expect(normalizeSendDays([0, 1, 2, 3, 4, 5, 6])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(isInSendWindow(satInWindow, kolkata)).toBe(true);
  });

  test("before today's window the next slot is today 09:00 IST, not Monday", () => {
    expect(windowStartAt(satBeforeWindow, kolkata).toISOString()).toBe("2026-08-29T03:30:00.000Z");
    expect(earliestEligibleAt(satBeforeWindow, kolkata).toISOString()).toBe("2026-08-29T03:30:00.000Z");
  });

  test("inside today's window a message is eligible right now", () => {
    expect(earliestEligibleAt(satInWindow, kolkata).toISOString()).toBe(satInWindow.toISOString());
  });

  test("first-step queue parked on Monday is pulled forward to today", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `m${i}`,
      scheduled_at: mondaySlot,
      pull_forward: true,
    }));
    const updates = planQueueReschedule(rows, kolkata, satInWindow);
    expect(updates).toHaveLength(3);
    for (const update of updates) expect(update.scheduledAt).toBe(satInWindow.toISOString());
  });

  test("pull forward before the window lands on today's window start", () => {
    const updates = planQueueReschedule(
      [{ id: "a", scheduled_at: mondaySlot, pull_forward: true }],
      kolkata,
      satBeforeWindow,
    );
    expect(updates[0]?.scheduledAt).toBe("2026-08-29T03:30:00.000Z");
  });

  test("follow-ups keep their configured wait and are not pulled forward", () => {
    const updates = planQueueReschedule(
      [{ id: "f", scheduled_at: mondaySlot, pull_forward: false }],
      kolkata,
      satInWindow,
    );
    // Monday 16:00 UTC = 21:30 IST is outside the window → next Tuesday start,
    // never earlier than the configured wait.
    expect(updates[0]?.scheduledAt).toBe("2026-09-01T03:30:00.000Z");
  });

  test("a day genuinely not selected is skipped", () => {
    const noSaturday = { ...kolkata, sendDays: [0, 1, 2, 3, 4, 5] };
    expect(isInSendWindow(satInWindow, noSaturday)).toBe(false);
    expect(earliestEligibleAt(satInWindow, noSaturday).toISOString()).toBe("2026-08-30T03:30:00.000Z");
  });
});
