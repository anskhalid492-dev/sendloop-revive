import { describe, expect, it } from "vitest";

import {
  mailboxActivityLabel,
  mailboxReadinessBadges,
  mailboxWarmupLabel,
  selfConnectedReadiness,
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
describe("customer-connected mailbox readiness", () => {
  const passing = {
    status: "connected",
    is_active: true,
    auth_status: "pass",
    auth_reason: "SPF, DKIM and DMARC are all published correctly for this domain.",
    auth_checked_at: "2026-09-19T17:12:30.317Z",
  };

  it("reports a verified, active mailbox as verified and ready", () => {
    const r = selfConnectedReadiness(passing, "verified");
    expect(r.dnsStatus).toBe("verified");
    expect(r.providerStatus).toBe("verified");
    expect(r.dnsVerifiedAt).toBe("2026-09-19T17:12:30.317Z");
    expect(mailboxReadinessBadges(r)).toEqual([
      { label: "DNS Verified", tone: "success" },
      { label: "Sending Ready", tone: "success" },
    ]);
  });

  it("never shows Setup Required for a connected mailbox whose records are unchecked", () => {
    const r = selfConnectedReadiness(
      { status: "connected", is_active: true, auth_status: null, auth_reason: null, auth_checked_at: null },
      "verified",
    );
    expect(r.dnsStatus).toBe("unchecked");
    expect(r.providerStatus).toBe("verified");
    expect(mailboxReadinessBadges(r)).toEqual([
      { label: "Sending Ready", tone: "success" },
      { label: "DNS Not Checked", tone: "warning" },
    ]);
  });

  it("treats a DMARC-only warning as verified", () => {
    expect(selfConnectedReadiness({ ...passing, auth_status: "warn" }, "verified").dnsStatus).toBe(
      "verified",
    );
  });

  it("surfaces a failed authentication check as an error", () => {
    const r = selfConnectedReadiness({ ...passing, auth_status: "fail" }, "verified");
    expect(r.dnsStatus).toBe("failed");
    expect(mailboxReadinessBadges(r)).toEqual([{ label: "Error", tone: "danger" }]);
  });

  it("asks for setup only when the mailbox itself is not connected", () => {
    const r = selfConnectedReadiness(
      { status: "pending", is_active: false, auth_status: null, auth_reason: null, auth_checked_at: null },
      "pending",
    );
    expect(r.providerStatus).toBe("not_verified");
    expect(mailboxReadinessBadges(r)).toEqual([{ label: "Setup Required", tone: "warning" }]);
  });

  it("falls back to the sending account status when no mailbox record exists", () => {
    expect(selfConnectedReadiness(null, "verified").providerStatus).toBe("verified");
    expect(selfConnectedReadiness(null, "failed").providerStatus).toBe("not_verified");
  });
});
