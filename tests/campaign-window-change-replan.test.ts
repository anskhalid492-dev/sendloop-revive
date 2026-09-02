import { describe, expect, it } from "vitest";
import { planQueueReschedule } from "@/lib/campaign-reschedule";
import { formatInCampaignTimezone, queueCounters } from "@/lib/campaign-display";

const kolkata = (startHour: number, endHour: number) => ({
  timezone: "Asia/Kolkata",
  sendDays: [0, 1, 2, 3, 4, 5, 6],
  startHour,
  endHour,
});

// 2026-09-02 12:00 UTC = 17:30 IST (before both windows)
const now = new Date("2026-09-02T12:00:00Z");

describe("queue replanning when the sending window changes", () => {
  it("A. moves a 20:00 IST follow-up into the new 19:00 IST window", () => {
    const updates = planQueueReschedule(
      [{ id: "m1", scheduled_at: "2026-09-02T14:30:00Z", pull_forward: false }],
      kolkata(19, 23),
      now,
    );
    expect(updates).toEqual([{ id: "m1", scheduledAt: "2026-09-02T13:30:00.000Z" }]);
  });

  it("B. pushes a 19:00 IST row forward when the window becomes 20:00", () => {
    const updates = planQueueReschedule(
      [{ id: "m1", scheduled_at: "2026-09-02T13:30:00Z", pull_forward: false }],
      kolkata(20, 23),
      now,
    );
    expect(updates).toEqual([{ id: "m1", scheduledAt: "2026-09-02T14:30:00.000Z" }]);
  });

  it("C. a follow-up cannot stay outside the current window", () => {
    const updates = planQueueReschedule(
      [{ id: "m1", scheduled_at: "2026-09-03T05:00:00Z", pull_forward: false }], // 10:30 IST
      kolkata(19, 23),
      now,
    );
    expect(updates[0]?.scheduledAt).toBe("2026-09-03T13:30:00.000Z");
  });

  it("never moves a follow-up before now or before the window", () => {
    const late = new Date("2026-09-02T14:00:00Z"); // 19:30 IST, inside window
    const updates = planQueueReschedule(
      [{ id: "m1", scheduled_at: "2026-09-02T14:30:00Z", pull_forward: false }],
      kolkata(19, 23),
      late,
    );
    expect(new Date(updates[0]?.scheduledAt ?? 0).getTime()).toBeGreaterThanOrEqual(late.getTime());
  });

  it("keeps a follow-up already at the window start unchanged", () => {
    expect(
      planQueueReschedule(
        [{ id: "m1", scheduled_at: "2026-09-02T13:30:00Z", pull_forward: false }],
        kolkata(19, 23),
        now,
      ),
    ).toEqual([]);
  });

  it("I/J. still respects the daily limit when pulling rows back", () => {
    const rows = [1, 2, 3].map((i) => ({
      id: `m${i}`,
      scheduled_at: "2026-09-02T14:30:00Z",
      pull_forward: false,
    }));
    const updates = planQueueReschedule(rows, kolkata(19, 23), now, { dailyLimit: 2 });
    const days = updates.map((u) => u.scheduledAt.slice(0, 10));
    expect(days.filter((d) => d === "2026-09-02")).toHaveLength(2);
    expect(days.filter((d) => d === "2026-09-03")).toHaveLength(1);
  });
});

describe("campaign timezone display", () => {
  it("D. renders next send in the campaign timezone", () => {
    expect(formatInCampaignTimezone("2026-09-02T13:30:00Z", "Asia/Kolkata")).toContain("7:00 PM");
  });

  it("E. browser timezone cannot change the campaign meaning", () => {
    const a = formatInCampaignTimezone("2026-09-02T13:30:00Z", "Asia/Kolkata");
    process.env["TZ"] = "America/Los_Angeles";
    expect(formatInCampaignTimezone("2026-09-02T13:30:00Z", "Asia/Kolkata")).toBe(a);
  });
});

describe("queued counters", () => {
  it("F. uses authoritative message statistics", () => {
    const counters = queueCounters({
      scheduled: 395,
      processing: 2,
      sent: 1502,
      failed: 23,
      cancelled: 9,
    });
    expect(counters.scheduled).toBe(395);
    expect(counters.scheduled + counters.processing).not.toBe(1);
  });
});
