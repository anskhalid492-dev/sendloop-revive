import { describe, expect, test } from "vitest";
import { isInSendWindow, nextSendSlot, windowStartAt } from "@/lib/campaign-schedule";
import { campaignRunStatus, nextRunAt } from "@/lib/campaign-run-state";

// 7:00 PM – 11:00 PM Asia/Dubai (UTC+4, no DST) => 15:00–19:00 UTC, every day.
const dubai = {
  timezone: "Asia/Dubai",
  sendDays: [0, 1, 2, 3, 4, 5, 6],
  startHour: 19,
  endHour: 23,
};

describe("configured window start (no drift)", () => {
  test.each([
    ["19:00", "2026-08-26T15:00:00Z"],
    ["19:04", "2026-08-26T15:04:00Z"],
    ["20:30", "2026-08-26T16:30:00Z"],
    ["22:59", "2026-08-26T18:59:00Z"],
  ])("%s Dubai is active and retains the configured 19:00 start", (_label, iso) => {
    const now = new Date(iso);
    expect(isInSendWindow(now, dubai)).toBe(true);
    expect(windowStartAt(now, dubai).toISOString()).toBe("2026-08-26T15:00:00.000Z");
    expect(nextSendSlot(now, dubai).toISOString()).toBe("2026-08-26T15:00:00.000Z");
  });

  test("18:59 Dubai waits for today's configured 19:00 start", () => {
    const now = new Date("2026-08-26T14:59:00Z");
    expect(isInSendWindow(now, dubai)).toBe(false);
    expect(windowStartAt(now, dubai).toISOString()).toBe("2026-08-26T15:00:00.000Z");
  });

  test("23:00 Dubai is closed and waits for tomorrow at 19:00", () => {
    const now = new Date("2026-08-26T19:00:00Z");
    expect(isInSendWindow(now, dubai)).toBe(false);
    expect(windowStartAt(now, dubai).toISOString()).toBe("2026-08-27T15:00:00.000Z");
  });

  test("next run after a mid-window moment is tomorrow at exactly 6 PM", () => {
    const now = new Date("2026-08-26T15:04:00Z");
    expect(nextRunAt(now, dubai).toISOString()).toBe("2026-08-27T15:00:00.000Z");
  });

  test("consecutive daily runs all land on exactly 18:00 Dubai", () => {
    let cursor = new Date("2026-08-26T15:37:00Z"); // drifting run moment
    const runs: string[] = [];
    for (let day = 0; day < 5; day += 1) {
      const next = nextRunAt(cursor, dubai);
      runs.push(next.toISOString());
      // Simulate the run starting late / finishing at an arbitrary time.
      cursor = new Date(next.getTime() + 41 * 60_000);
    }
    expect(runs).toEqual([
      "2026-08-27T15:00:00.000Z",
      "2026-08-28T15:00:00.000Z",
      "2026-08-29T15:00:00.000Z",
      "2026-08-30T15:00:00.000Z",
      "2026-08-31T15:00:00.000Z",
    ]);
  });

  test("before the window opens, the next run is today at 7 PM", () => {
    const now = new Date("2026-08-26T09:00:00Z"); // 13:00 Dubai
    expect(nextRunAt(now, dubai).toISOString()).toBe("2026-08-26T15:00:00.000Z");
  });

  test("daily quota reached waits for the next day's window start", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 100,
      sentToday: 100,
      remainingRecipients: 900,
      now: new Date("2026-08-26T15:04:00Z"),
      window: dubai,
    });
    expect(status.state).toBe("daily_quota_reached");
    expect(status.nextRunAt).toBe("2026-08-27T15:00:00.000Z");
  });

  test("running state reports the current run's configured start time", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 100,
      sentToday: 10,
      remainingRecipients: 900,
      now: new Date("2026-08-26T15:04:00Z"),
      window: dubai,
    });
    expect(status.state).toBe("running");
    expect(status.nextRunAt).toBe("2026-08-26T15:00:00.000Z");
    expect(status.nextRunAt).toBe(nextSendSlot(new Date("2026-08-26T15:04:00Z"), dubai).toISOString());
  });

  test("skipped send days roll forward to the next configured day's start", () => {
    const weekdays = { ...dubai, sendDays: [1, 2, 3, 4, 5] };
    // Friday 19:30 Dubai -> Monday 19:00 Dubai
    expect(nextRunAt(new Date("2026-08-28T15:30:00Z"), weekdays).toISOString()).toBe(
      "2026-08-31T15:00:00.000Z",
    );
  });
});
