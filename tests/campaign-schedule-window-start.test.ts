import { describe, expect, test } from "vitest";
import { windowStartAt } from "@/lib/campaign-schedule";
import { campaignRunStatus, nextRunAt } from "@/lib/campaign-run-state";

// 6:00 PM – 11:00 PM Asia/Dubai (UTC+4, no DST) => 14:00–19:00 UTC, every day.
const dubai = {
  timezone: "Asia/Dubai",
  sendDays: [0, 1, 2, 3, 4, 5, 6],
  startHour: 18,
  endHour: 23,
};

describe("configured window start (no drift)", () => {
  test("mid-window now returns the configured 6 PM start, not 6:14 PM", () => {
    const now = new Date("2026-08-26T14:14:00Z"); // 18:14 Dubai
    expect(windowStartAt(now, dubai).toISOString()).toBe("2026-08-26T14:00:00.000Z");
  });

  test("next run after a mid-window moment is tomorrow at exactly 6 PM", () => {
    const now = new Date("2026-08-26T14:14:00Z");
    expect(nextRunAt(now, dubai).toISOString()).toBe("2026-08-27T14:00:00.000Z");
  });

  test("consecutive daily runs all land on exactly 18:00 Dubai", () => {
    let cursor = new Date("2026-08-26T14:37:00Z"); // drifting run moment
    const runs: string[] = [];
    for (let day = 0; day < 5; day += 1) {
      const next = nextRunAt(cursor, dubai);
      runs.push(next.toISOString());
      // Simulate the run starting late / finishing at an arbitrary time.
      cursor = new Date(next.getTime() + 41 * 60_000);
    }
    expect(runs).toEqual([
      "2026-08-27T14:00:00.000Z",
      "2026-08-28T14:00:00.000Z",
      "2026-08-29T14:00:00.000Z",
      "2026-08-30T14:00:00.000Z",
      "2026-08-31T14:00:00.000Z",
    ]);
  });

  test("before the window opens, the next run is today at 6 PM", () => {
    const now = new Date("2026-08-26T09:00:00Z"); // 13:00 Dubai
    expect(nextRunAt(now, dubai).toISOString()).toBe("2026-08-26T14:00:00.000Z");
  });

  test("daily quota reached waits for the next day's window start", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 100,
      sentToday: 100,
      remainingRecipients: 900,
      now: new Date("2026-08-26T14:23:00Z"),
      window: dubai,
    });
    expect(status.state).toBe("daily_quota_reached");
    expect(status.nextRunAt).toBe("2026-08-27T14:00:00.000Z");
  });

  test("running state reports the current run's configured start time", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 100,
      sentToday: 10,
      remainingRecipients: 900,
      now: new Date("2026-08-26T14:23:00Z"),
      window: dubai,
    });
    expect(status.state).toBe("running");
    expect(status.nextRunAt).toBe("2026-08-26T14:00:00.000Z");
  });

  test("skipped send days roll forward to the next configured day's start", () => {
    const weekdays = { ...dubai, sendDays: [1, 2, 3, 4, 5] };
    // Friday 18:30 Dubai -> Monday 18:00 Dubai
    expect(nextRunAt(new Date("2026-08-28T14:30:00Z"), weekdays).toISOString()).toBe(
      "2026-08-31T14:00:00.000Z",
    );
  });
});
