import { describe, expect, it } from "vitest";

import { campaignRunStatus } from "@/lib/campaign-run-state";
import type { ScheduleWindow } from "@/lib/campaign-schedule";
import { selectSystemEmailProvider } from "@/lib/system-email-provider";

/** Mon–Fri, 09:00–17:00 UTC. */
const window: ScheduleWindow = {
  timezone: "UTC",
  sendDays: [1, 2, 3, 4, 5],
  startMinutes: 9 * 60,
  endMinutes: 17 * 60,
};

const base = {
  status: "active",
  dailyQuota: 100,
  sentToday: 0,
  remainingRecipients: 500,
  window,
};

// Wed 2025-01-08 (inside window) / late evening (outside window).
const inWindow = new Date("2025-01-08T10:00:00Z");
const outsideWindow = new Date("2025-01-08T20:00:00Z");

describe("dashboard campaign status column", () => {
  it("shows Running inside the sending window with quota left", () => {
    const s = campaignRunStatus({ ...base, now: inWindow });
    expect(s.state).toBe("running");
    expect(s.label).toBe("Running");
  });

  it("shows Send limit reached when the daily quota is exhausted", () => {
    const s = campaignRunStatus({ ...base, sentToday: 100, now: inWindow });
    expect(s.state).toBe("daily_quota_reached");
    expect(s.label).toBe("Send limit reached");
    expect(s.remainingDailyCapacity).toBe(0);
    expect(s.nextRunAt).not.toBeNull();
  });

  it("shows Total send limit reached when the lifetime allowance is used up", () => {
    const s = campaignRunStatus({
      ...base,
      lifetimeLimit: 400,
      lifetimeSent: 400,
      now: inWindow,
    });
    expect(s.label).toBe("Total send limit reached");
  });

  it("shows Waiting for next window outside the sending window", () => {
    const s = campaignRunStatus({ ...base, now: outsideWindow });
    expect(s.state).toBe("waiting_for_next_run");
    expect(s.label).toBe("Waiting for next window");
  });

  it("shows Paused for a paused campaign", () => {
    const s = campaignRunStatus({ ...base, status: "paused", now: inWindow });
    expect(s.label).toBe("Paused");
  });

  it("shows Completed only when no recipients remain", () => {
    expect(campaignRunStatus({ ...base, remainingRecipients: 0, now: inWindow }).label).toBe(
      "Completed",
    );
    // In-flight work must not read as completed.
    expect(campaignRunStatus({ ...base, remainingRecipients: 1, now: inWindow }).label).toBe(
      "Running",
    );
  });

  it("shows Needs attention when a safety condition blocks sending", () => {
    expect(campaignRunStatus({ ...base, blocked: true, now: inWindow }).label).toBe(
      "Needs attention",
    );
  });
});

describe("system email provider selection", () => {
  it("keeps the existing provider until SES is explicitly enabled", () => {
    const c = selectSystemEmailProvider({
      sesEnabled: false,
      sesCredentialsAvailable: true,
      managedAvailable: true,
    });
    expect(c.provider).toBe("managed");
  });

  it("uses SES when enabled and connected, with managed fallback", () => {
    const c = selectSystemEmailProvider({
      sesEnabled: true,
      sesCredentialsAvailable: true,
      managedAvailable: true,
    });
    expect(c.provider).toBe("ses");
    expect(c.fallback).toBe("managed");
  });

  it("falls back to the existing provider when SES is enabled but not connected", () => {
    const c = selectSystemEmailProvider({
      sesEnabled: true,
      sesCredentialsAvailable: false,
      managedAvailable: true,
    });
    expect(c.provider).toBe("managed");
  });

  it("does not use SES when the SES account has sending disabled", () => {
    const c = selectSystemEmailProvider({
      sesEnabled: true,
      sesCredentialsAvailable: true,
      sesSendingEnabled: false,
      managedAvailable: true,
    });
    expect(c.provider).toBe("managed");
  });
});
