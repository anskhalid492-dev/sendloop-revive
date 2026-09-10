import { describe, expect, test } from "vitest";
import {
  MAX_MAILBOX_EMAILS_PER_HOUR,
  MAX_MAILBOX_HOURLY_MESSAGE,
  campaignHourlyLimit,
  clampMailboxHourlyLimit,
  effectiveMailboxHourlyLimit,
  exceedsMailboxHourlyCap,
} from "@/lib/mailbox-hourly-cap";
import { evaluateMailboxCapacity } from "@/lib/mailbox-capacity";

describe("70 emails per mailbox per hour ceiling", () => {
  test("copy and constant", () => {
    expect(MAX_MAILBOX_EMAILS_PER_HOUR).toBe(70);
    expect(MAX_MAILBOX_HOURLY_MESSAGE).toBe("Maximum 70 emails per mailbox per hour.");
  });

  test("values above 70 are capped, valid values kept", () => {
    expect(clampMailboxHourlyLimit(500)).toBe(70);
    expect(clampMailboxHourlyLimit("120")).toBe(70);
    expect(clampMailboxHourlyLimit(45)).toBe(45);
    expect(clampMailboxHourlyLimit(0)).toBe(1);
    expect(exceedsMailboxHourlyCap(71)).toBe(true);
    expect(exceedsMailboxHourlyCap(70)).toBe(false);
  });

  test("unset or oversized stored limits fall back to the ceiling", () => {
    expect(effectiveMailboxHourlyLimit(null)).toBe(70);
    expect(effectiveMailboxHourlyLimit(0)).toBe(70);
    expect(effectiveMailboxHourlyLimit(500)).toBe(70);
    expect(effectiveMailboxHourlyLimit(20)).toBe(20);
  });

  test("capacity blocks at 70 even when the mailbox stores a higher limit", () => {
    const base = {
      id: "a",
      from_name: "M",
      from_email: "m@x.com",
      paused: false,
      customer_enabled: true,
      status: "active",
      sent_today: 0,
      daily_limit: 500,
      hourly_limit: 500,
      last_sent_at: new Date().toISOString(),
    };
    // The 70/hour ceiling still applies: campaign sending stops at the
    // campaign lane limit (ceiling minus the reply reservation), while a human
    // reply is never blocked by MunchReach pacing.
    const campaignLimit = campaignHourlyLimit(500);
    expect(campaignLimit).toBeLessThan(70);
    expect(evaluateMailboxCapacity(base, campaignLimit - 1).available).toBe(true);
    const blocked = evaluateMailboxCapacity(base, campaignLimit);
    expect(blocked.available).toBe(false);
    expect(blocked.reason).toBe("hourly");
    expect(blocked.hourlyLimit).toBe(campaignLimit);
    expect(evaluateMailboxCapacity(base, 70, undefined, "reply").available).toBe(true);
  });
});
