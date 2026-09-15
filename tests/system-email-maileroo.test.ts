import { describe, expect, it } from "vitest";

import { selectSystemEmailProvider } from "@/lib/system-email-provider";
import {
  providerOptionAvailable,
  validateSenderIdentityEdit,
} from "@/lib/system-sender-identities";
import { providerDisplay } from "@/lib/transactional/policy";

const base = {
  sesEnabled: false,
  sesCredentialsAvailable: false,
  managedAvailable: true,
};

describe("system email active provider selection", () => {
  it("routes everything through Maileroo when it is pinned and available", () => {
    const choice = selectSystemEmailProvider({
      ...base,
      activeProvider: "maileroo",
      mailerooAvailable: true,
    });
    expect(choice.provider).toBe("maileroo");
  });

  it("falls back to the managed provider when Maileroo is pinned but unavailable", () => {
    const choice = selectSystemEmailProvider({
      ...base,
      activeProvider: "maileroo",
      mailerooAvailable: false,
    });
    expect(choice.provider).toBe("managed");
    expect(choice.reason).toMatch(/maileroo/i);
  });

  it("never uses Maileroo when SES is pinned, and never SES when Resend is pinned", () => {
    expect(
      selectSystemEmailProvider({
        sesEnabled: true,
        sesCredentialsAvailable: true,
        managedAvailable: true,
        activeProvider: "ses",
        mailerooAvailable: true,
      }).provider,
    ).toBe("ses");

    expect(
      selectSystemEmailProvider({
        sesEnabled: true,
        sesCredentialsAvailable: true,
        managedAvailable: true,
        activeProvider: "resend",
        mailerooAvailable: true,
      }).provider,
    ).toBe("managed");
  });

  it("switches back cleanly in both directions", () => {
    const input = {
      sesEnabled: true,
      sesCredentialsAvailable: true,
      managedAvailable: true,
      mailerooAvailable: true,
    };
    expect(selectSystemEmailProvider({ ...input, activeProvider: "maileroo" }).provider).toBe(
      "maileroo",
    );
    expect(selectSystemEmailProvider({ ...input, activeProvider: "ses" }).provider).toBe("ses");
    expect(selectSystemEmailProvider({ ...input, activeProvider: "resend" }).provider).toBe(
      "managed",
    );
  });

  it("reports Maileroo as the active provider in admin", () => {
    const display = providerDisplay({
      sesEnabled: false,
      sesConnected: false,
      managedAvailable: true,
      managedProvider: "resend",
      activeProvider: "maileroo",
      mailerooAvailable: true,
    });
    expect(display.provider).toBe("maileroo");
    expect(display.label).toBe("Maileroo");
    expect(display.available).toBe(true);
  });
});

describe("sender identities under Maileroo", () => {
  const availability = {
    managedAvailable: true,
    sesEnabled: false,
    sesConnected: false,
    mailerooAvailable: true,
  };

  it("offers Maileroo only when it is configured", () => {
    expect(providerOptionAvailable("maileroo", availability)).toBe(true);
    expect(providerOptionAvailable("maileroo", { ...availability, mailerooAvailable: false })).toBe(
      false,
    );
  });

  it("accepts every munchreach.com identity on a Maileroo-verified domain", () => {
    for (const email of [
      "accounts@munchreach.com",
      "billing@munchreach.com",
      "support@munchreach.com",
      "notifications@munchreach.com",
      "security@munchreach.com",
      "onboarding@munchreach.com",
      "system@munchreach.com",
      "marketing@munchreach.com",
    ]) {
      const reason = validateSenderIdentityEdit(
        {
          purpose: "billing",
          email,
          name: "MunchReach",
          replyTo: "support@munchreach.com",
          provider: "maileroo",
          active: true,
        } as never,
        availability,
        {
          allowedDomains: ["munchreach.com"],
          activeProvider: "maileroo",
          mailerooVerifiedDomains: ["munchreach.com"],
        },
      );
      expect(reason).toBeNull();
    }
  });

  it("keeps a distinct reply-to address on a Maileroo identity", () => {
    const reason = validateSenderIdentityEdit(
      {
        purpose: "billing",
        email: "billing@munchreach.com",
        name: "MunchReach Billing",
        replyTo: "support@munchreach.com",
        provider: "maileroo",
        active: true,
      } as never,
      availability,
      {
        allowedDomains: ["munchreach.com"],
        activeProvider: "maileroo",
        mailerooVerifiedDomains: ["munchreach.com"],
      },
    );
    expect(reason).toBeNull();
  });

  it("does not demand SES verification while Maileroo is the active provider", () => {
    const reason = validateSenderIdentityEdit(
      {
        purpose: "support",
        email: "support@munchreach.com",
        name: "MunchReach Support",
        replyTo: "support@munchreach.com",
        provider: "auto",
        active: true,
      } as never,
      { managedAvailable: true, sesEnabled: true, sesConnected: true, mailerooAvailable: true },
      {
        allowedDomains: ["munchreach.com"],
        activeProvider: "maileroo",
        verifiedDomains: ["other.com"],
        mailerooVerifiedDomains: ["munchreach.com"],
      },
    );
    expect(reason).toBeNull();
  });

  it("rejects an unverified domain on Maileroo", () => {
    const reason = validateSenderIdentityEdit(
      {
        purpose: "support",
        email: "support@munchreach.com",
        name: "MunchReach Support",
        replyTo: "support@munchreach.com",
        provider: "maileroo",
        active: true,
      } as never,
      availability,
      {
        allowedDomains: ["munchreach.com"],
        activeProvider: "maileroo",
        mailerooVerifiedDomains: ["elsewhere.com"],
      },
    );
    expect(reason).toMatch(/not a verified sending domain/i);
  });
});

describe("provider availability after switching Resend off", () => {
  test("automatic selection uses Maileroo when it is the only enabled provider", () => {
    const choice = selectSystemEmailProvider({
      sesEnabled: false,
      sesCredentialsAvailable: false,
      managedAvailable: false,
      mailerooAvailable: true,
      activeProvider: "auto",
    });
    expect(choice.provider).toBe("maileroo");
  });

  test("the unavailable label reports the real reason", () => {
    const display = providerDisplay({
      sesEnabled: false,
      sesConnected: false,
      managedAvailable: false,
      managedProvider: null,
      activeProvider: "auto",
      mailerooAvailable: false,
      unavailableReason: "No provider is enabled for system email.",
    });
    expect(display.available).toBe(false);
    expect(display.label).toContain("No provider is enabled for system email.");
    expect(display.detail).toContain("No provider is enabled");
  });
});
