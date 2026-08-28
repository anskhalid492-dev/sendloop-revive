import { describe, expect, test } from "vitest";
import { campaignRunStatus, isRetryableFailure, nextRunAt } from "@/lib/campaign-run-state";
import { selectRetryableMessages } from "@/lib/dispatch.server";

const window = { timezone: "UTC", sendDays: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 };

describe("campaign run state", () => {
  test("next run comes from the schedule, not the last send", () => {
    // Wednesday 15:00 UTC -> Thursday 09:00 UTC
    const next = nextRunAt(new Date("2026-08-26T15:00:00Z"), window);
    expect(next.toISOString()).toBe("2026-08-27T09:00:00.000Z");
  });

  test("friday evening rolls to monday on a weekday campaign", () => {
    const next = nextRunAt(new Date("2026-08-28T20:00:00Z"), window);
    expect(next.toISOString()).toBe("2026-08-31T09:00:00.000Z");
  });

  test("daily quota reached is not paused and schedules the next run", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 100,
      sentToday: 100,
      remainingRecipients: 500,
      now: new Date("2026-08-26T12:00:00Z"),
      window,
    });
    expect(status.state).toBe("daily_quota_reached");
    expect(status.remainingDailyCapacity).toBe(0);
    expect(status.nextRunAt).toBe("2026-08-27T09:00:00.000Z");
  });

  test("running inside the window with quota left", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 100,
      sentToday: 40,
      remainingRecipients: 500,
      now: new Date("2026-08-26T12:00:00Z"),
      window,
    });
    expect(status.state).toBe("running");
    expect(status.remainingDailyCapacity).toBe(60);
  });

  test("outside the window waits for the next run", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 100,
      sentToday: 10,
      remainingRecipients: 500,
      now: new Date("2026-08-26T20:00:00Z"),
      window,
    });
    expect(status.state).toBe("waiting_for_next_run");
  });

  test("lifetime totals never force a stop; exhausted audience completes", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 100,
      sentToday: 0,
      remainingRecipients: 0,
      now: new Date("2026-08-26T12:00:00Z"),
      window,
    });
    expect(status.state).toBe("completed");
  });

  test("unlimited quota reports null remaining capacity", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 0,
      sentToday: 9999,
      remainingRecipients: 5,
      now: new Date("2026-08-26T12:00:00Z"),
      window,
    });
    expect(status.state).toBe("running");
    expect(status.remainingDailyCapacity).toBeNull();
  });
});

describe("retry policy", () => {
  test("transient provider errors are retryable", () => {
    expect(isRetryableFailure("Rate limit exceeded")).toBe(true);
    expect(isRetryableFailure("503 Service Unavailable")).toBe(true);
    expect(isRetryableFailure("mailbox capacity exhausted")).toBe(true);
    expect(isRetryableFailure(null)).toBe(true);
  });

  test("permanent failures are never retried", () => {
    expect(isRetryableFailure("Hard bounce: invalid recipient")).toBe(false);
    expect(isRetryableFailure("550 5.1.1 No such user here")).toBe(false);
    expect(isRetryableFailure("Recipient suppressed")).toBe(false);
    expect(isRetryableFailure("Complaint received")).toBe(false);
  });

  test("selection skips accepted, bounced and permanent failures", () => {
    const dayStart = new Date("2026-08-27T00:00:00Z");
    const base = { attempts: 1, updated_at: "2026-08-26T10:00:00Z", created_at: "2026-08-26T09:00:00Z" };
    const rows = [
      { id: "retry", status: "failed", sent_at: null, last_error: "temporary failure", ...base },
      { id: "accepted", status: "failed", sent_at: "2026-08-26T10:00:00Z", last_error: "x", ...base },
      { id: "provider-id", status: "failed", sent_at: null, provider_message_id: "abc", last_error: "x", ...base },
      { id: "bounced", status: "failed", sent_at: null, bounced_at: "2026-08-26T11:00:00Z", last_error: "x", ...base },
      { id: "hard", status: "failed", sent_at: null, last_error: "Hard bounce", ...base },
      { id: "today", status: "failed", sent_at: null, last_error: "temp", attempts: 1, updated_at: "2026-08-27T10:00:00Z" },
      { id: "spent", status: "failed", sent_at: null, last_error: "temp", attempts: 3, updated_at: "2026-08-26T10:00:00Z" },
    ];
    expect(selectRetryableMessages(rows, dayStart).map((r) => r.id)).toEqual(["retry"]);
  });
});
