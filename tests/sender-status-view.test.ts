import { describe, expect, it } from "vitest";

import {
  mailboxActivityLabel,
  mailboxReadinessBadges,
  mailboxWarmupLabel,
} from "@/lib/sender-status-view";

describe("mailboxReadinessBadges", () => {
  it("shows the two ready states when DNS and sending are verified", () => {
    expect(mailboxReadinessBadges({ dnsStatus: "verified", providerStatus: "verified" })).toEqual([
      { label: "DNS Verified", tone: "success" },
      { label: "Sending Ready", tone: "success" },
    ]);
  });

  it("turns a missing sending setup into one mailbox-level action", () => {
    expect(mailboxReadinessBadges({ dnsStatus: "missing", providerStatus: "not_verified" })).toEqual([
      { label: "Setup Required", tone: "warning" },
    ]);
  });

  it("keeps verified DNS visible when sending is not ready", () => {
    expect(mailboxReadinessBadges({ dnsStatus: "verified", providerStatus: "not_verified" })).toEqual([
      { label: "DNS Verified", tone: "success" },
      { label: "Sending Not Ready", tone: "danger" },
    ]);
  });

  it("uses a simple error state when an existing check fails", () => {
    expect(mailboxReadinessBadges({ dnsStatus: "failed", providerStatus: "verified" })).toEqual([
      { label: "Error", tone: "danger" },
    ]);
  });
});

describe("mailbox list labels", () => {
  it("prefers paused over active and preserves inactive", () => {
    expect(mailboxActivityLabel({ active: true, paused: true })).toBe("Paused");
    expect(mailboxActivityLabel({ active: false, paused: false })).toBe("Inactive");
  });

  it("normalizes existing warmup states", () => {
    expect(mailboxWarmupLabel("warming")).toBe("Active");
    expect(mailboxWarmupLabel("completed")).toBe("Complete");
    expect(mailboxWarmupLabel("hold")).toBe("Paused");
    expect(mailboxWarmupLabel("off")).toBe("Off");
  });
});