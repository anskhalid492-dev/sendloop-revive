import { describe, expect, test } from "vitest";
import {
  alignToSendWindow,
  isInSendWindow,
  normalizeSendDays,
  windowStartAt,
} from "@/lib/campaign-schedule";
import { groupRescheduleUpdates, planQueueReschedule } from "@/lib/campaign-reschedule";

// Every day selected, 09:00–17:00 Asia/Dubai (UTC+4).
const allDays = {
  timezone: "Asia/Dubai",
  sendDays: [0, 1, 2, 3, 4, 5, 6],
  startHour: 9,
  endHour: 17,
};

// Saturday 2026-08-29, 13:00 Dubai = 09:00 UTC.
const saturdayMidWindow = new Date("2026-08-29T09:00:00Z");

describe("selected sending days are authoritative", () => {
  test("normalizes string / duplicate / out-of-range values", () => {
    expect(normalizeSendDays(["6", 6, 1, 9, -1, null])).toEqual([1, 6]);
  });

  test("no configured days means every day is eligible (never Mon–Fri)", () => {
    expect(normalizeSendDays([])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(isInSendWindow(saturdayMidWindow, { ...allDays, sendDays: [] })).toBe(true);
  });

  test("Saturday selected → Saturday is a sending day", () => {
    expect(isInSendWindow(saturdayMidWindow, allDays)).toBe(true);
    expect(windowStartAt(saturdayMidWindow, allDays).toISOString()).toBe("2026-08-29T05:00:00.000Z");
  });

  test("today selected and window open → queued message is due today", () => {
    const aligned = alignToSendWindow(new Date("2026-08-29T04:00:00Z"), allDays, saturdayMidWindow);
    expect(aligned.toISOString()).toBe(saturdayMidWindow.toISOString());
  });

  test("today not selected → moves to the next selected day", () => {
    const weekdays = { ...allDays, sendDays: [1, 2, 3, 4, 5] };
    // Saturday not selected → Monday 09:00 Dubai (05:00 UTC).
    expect(alignToSendWindow(null, weekdays, saturdayMidWindow).toISOString()).toBe(
      "2026-08-31T05:00:00.000Z",
    );
  });

  test("timezone is respected when picking the window start", () => {
    const ny = { ...allDays, timezone: "America/New_York" };
    // 2026-08-29 09:00 UTC is 05:00 New York → before the window.
    expect(isInSendWindow(saturdayMidWindow, ny)).toBe(false);
    expect(windowStartAt(saturdayMidWindow, ny).toISOString()).toBe("2026-08-29T13:00:00.000Z");
  });
});

describe("queue reschedule after a sending-day change", () => {
  test("re-plans messages parked on a day that is no longer/now selected", () => {
    const rows = [
      { id: "a", scheduled_at: "2026-08-29T22:00:00.000Z" }, // outside any window
      { id: "b", scheduled_at: null },
      { id: "c", scheduled_at: saturdayMidWindow.toISOString() }, // already valid
      { id: "d", scheduled_at: "2026-08-31T05:00:00.000Z" }, // valid future follow-up slot
    ];
    const updates = planQueueReschedule(rows, allDays, saturdayMidWindow);
    expect(updates.map((u) => u.id).sort()).toEqual(["a", "b"]);
    // "a" rolls to the next configured start (Sunday 09:00 Dubai), "b" is due now.
    expect(updates.find((u) => u.id === "a")?.scheduledAt).toBe("2026-08-30T05:00:00.000Z");
    expect(updates.find((u) => u.id === "b")?.scheduledAt).toBe(saturdayMidWindow.toISOString());
    expect(groupRescheduleUpdates(updates).length).toBe(2);
  });
});
