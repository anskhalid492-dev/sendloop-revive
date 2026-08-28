import { describe, expect, it } from "vitest";

import {
  isRequiredSystemEmail,
  providerDisplay,
  senderRejectionReason,
} from "@/lib/transactional/policy";

describe("transactional email policy", () => {
  it("protects required system emails from being disabled", () => {
    expect(isRequiredSystemEmail("user.password_reset_requested")).toBe(true);
    expect(isRequiredSystemEmail("billing.invoice_paid")).toBe(false);
  });

  it("rejects unknown sender identities", () => {
    expect(
      senderRejectionReason({
        fromEmail: "random@evil.com",
        sesEnabled: false,
        verifiedDomains: [],
        knownSenders: ["support@munchreach.com"],
      }),
    ).toContain("not a MunchReach system sender");
  });

  it("requires SES verification when SES is enabled", () => {
    expect(
      senderRejectionReason({
        fromEmail: "support@munchreach.com",
        sesEnabled: true,
        verifiedDomains: [],
        knownSenders: ["support@munchreach.com"],
      }),
    ).toContain("verified Amazon SES");

    expect(
      senderRejectionReason({
        fromEmail: "support@munchreach.com",
        sesEnabled: true,
        verifiedDomains: ["munchreach.com"],
        knownSenders: ["support@munchreach.com"],
      }),
    ).toBeNull();
  });

  it("shows the provider that will carry the next send", () => {
    expect(
      providerDisplay({ sesEnabled: true, sesConnected: true, managedAvailable: true }).provider,
    ).toBe("ses");
    expect(
      providerDisplay({ sesEnabled: true, sesConnected: false, managedAvailable: true }).provider,
    ).toBe("managed");
    expect(
      providerDisplay({ sesEnabled: false, sesConnected: false, managedAvailable: false })
        .available,
    ).toBe(false);
  });
});
