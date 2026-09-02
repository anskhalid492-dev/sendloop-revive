import { describe, expect, it } from "vitest";
import { isEligibleMailbox, selectMailboxForMessage } from "@/lib/mailbox-assignment";

const resend = { id: "r1", provider: "resend", status: "verified", paused: false, customer_enabled: true, daily_limit: 30 };
const ses = { id: "s1", provider: "ses", status: "verified", paused: false, customer_enabled: true, daily_limit: 50 };
const allowed = new Set(["resend"]);

describe("provider-aware mailbox eligibility", () => {
  it("treats a mailbox on a disabled provider as ineligible", () => {
    expect(isEligibleMailbox(ses)).toBe(true);
    expect(isEligibleMailbox(ses, allowed)).toBe(false);
    expect(isEligibleMailbox(resend, allowed)).toBe(true);
  });

  it("rejects a disconnected mailbox", () => {
    expect(isEligibleMailbox({ ...resend, status: "disconnected" })).toBe(false);
  });

  it("never selects a mailbox whose provider is switched off", () => {
    const accountsById = new Map([
      [ses.id, ses],
      [resend.id, resend],
    ]);
    expect(
      selectMailboxForMessage({ poolIds: [ses.id, resend.id], accountsById, allowedProviders: allowed }),
    ).toBe("r1");
    expect(
      selectMailboxForMessage({ poolIds: [ses.id], accountsById, allowedProviders: allowed }),
    ).toBeNull();
  });
});
