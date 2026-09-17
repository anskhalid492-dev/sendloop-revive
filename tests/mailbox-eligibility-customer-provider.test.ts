import { describe, expect, it } from "vitest";
import { isEligibleMailbox, selectMailboxForMessage } from "@/lib/mailbox-assignment";

const allowed = new Set(["resend"]);

describe("customer-connected mailbox eligibility", () => {
  it("keeps an SMTP mailbox eligible even when it is absent from the shared provider table", () => {
    expect(
      isEligibleMailbox({ id: "a", provider: "smtp", status: "verified", daily_limit: 50 }, allowed),
    ).toBe(true);
  });

  it("still rejects a disabled shared provider", () => {
    expect(
      isEligibleMailbox({ id: "b", provider: "ses", status: "verified", daily_limit: 50 }, allowed),
    ).toBe(false);
  });

  it("assigns a campaign message to the SMTP mailbox when shared ones are full", () => {
    const accountsById = new Map([
      ["r", { id: "r", provider: "resend", status: "verified", daily_limit: 50 }],
      ["s", { id: "s", provider: "smtp", status: "verified", daily_limit: 50 }],
    ]);
    const picked = selectMailboxForMessage({
      poolIds: ["r", "s"],
      accountsById,
      usageById: new Map([["r", 50]]),
      allowedProviders: allowed,
    });
    expect(picked).toBe("s");
  });
});
