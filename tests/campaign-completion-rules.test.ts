import { describe, expect, it } from "vitest";

import { campaignRunStatus } from "@/lib/campaign-run-state";

const window = {
  timezone: "UTC",
  sendDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
};

// Wednesday 12:00 UTC — inside the sending window.
const now = new Date("2026-01-07T12:00:00.000Z");

describe("campaign completion rules", () => {
  it("does not complete a campaign that hit its daily quota with leads remaining", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 700,
      sentToday: 700,
      remainingRecipients: 559,
      now,
      window,
    });
    expect(status.state).toBe("daily_quota_reached");
    expect(status.nextRunAt).toBeTruthy();
  });

  it("reports the lifetime allowance as its own state, never completed", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 700,
      sentToday: 396,
      remainingRecipients: 863,
      lifetimeLimit: 396,
      lifetimeSent: 396,
      now,
      window,
    });
    expect(status.state).toBe("lifetime_limit_reached");
  });

  it("keeps running while both quota and allowance have headroom", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 700,
      sentToday: 396,
      remainingRecipients: 863,
      lifetimeLimit: 5000,
      lifetimeSent: 396,
      now,
      window,
    });
    expect(status.state).toBe("running");
    expect(status.remainingDailyCapacity).toBe(304);
  });

  it("completes only when no recipients remain", () => {
    const status = campaignRunStatus({
      status: "active",
      dailyQuota: 700,
      sentToday: 120,
      remainingRecipients: 0,
      now,
      window,
    });
    expect(status.state).toBe("completed");
  });
});
