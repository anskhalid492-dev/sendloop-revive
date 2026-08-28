import { describe, expect, test } from "vitest";
import {
  activeSenderIdentity,
  applySenderIdentityEdit,
  providerOptionAvailable,
  resolveSenderIdentity,
  validateSenderIdentityEdit,
} from "@/lib/system-sender-identities";
import { managedProviderLabel, providerDisplay } from "@/lib/transactional/policy";

const resendOnly = { managedAvailable: true, sesEnabled: false, sesConnected: false };

describe("active provider display", () => {
  test("shows the real managed provider when SES is disabled", () => {
    const display = providerDisplay({
      sesEnabled: false,
      sesConnected: true,
      managedAvailable: true,
      managedProvider: "resend",
    });
    expect(display.provider).toBe("managed");
    expect(display.label).toBe("Resend");
  });

  test("shows Amazon SES only once SES is enabled and connected", () => {
    expect(
      providerDisplay({ sesEnabled: true, sesConnected: true, managedAvailable: true, managedProvider: "resend" })
        .label,
    ).toBe("Amazon SES");
    expect(
      providerDisplay({ sesEnabled: true, sesConnected: false, managedAvailable: true, managedProvider: "resend" })
        .label,
    ).toBe("Resend");
  });

  test("provider labels are derived, not hard-coded to one vendor", () => {
    expect(managedProviderLabel("postmark")).toBe("Postmark");
    expect(managedProviderLabel(null)).toBe("MunchReach managed sending");
  });
});

describe("editable sender identities", () => {
  test("overrides replace the shipped defaults", () => {
    const overrides = applySenderIdentityEdit(null, {
      purpose: "billing",
      email: "Invoices@munchreach.com",
      name: "MunchReach Invoices",
      replyTo: "billing@munchreach.com",
      provider: "managed",
      active: true,
    });
    const identity = resolveSenderIdentity("billing", overrides);
    expect(identity.email).toBe("invoices@munchreach.com");
    expect(identity.name).toBe("MunchReach Invoices");
    expect(identity.provider).toBe("managed");
    expect(identity.customized).toBe(true);
    expect(resolveSenderIdentity("support", overrides).email).toBe("support@munchreach.com");
  });

  test("a deactivated identity falls back to an active one", () => {
    const overrides = applySenderIdentityEdit(null, {
      purpose: "billing",
      email: "billing@munchreach.com",
      name: "MunchReach Billing",
      replyTo: "billing@munchreach.com",
      provider: "auto",
      active: false,
    });
    expect(resolveSenderIdentity("billing", overrides).active).toBe(false);
    expect(activeSenderIdentity("billing", overrides).active).toBe(true);
  });
});

describe("edit validation against real backend state", () => {
  const edit = {
    purpose: "billing" as const,
    email: "billing@munchreach.com",
    name: "MunchReach Billing",
    replyTo: "billing@munchreach.com",
    provider: "auto" as const,
    active: true,
  };

  test("accepts a valid identity on the managed provider", () => {
    expect(validateSenderIdentityEdit(edit, resendOnly)).toBeNull();
  });

  test("rejects SES when SES is not enabled or connected", () => {
    expect(validateSenderIdentityEdit({ ...edit, provider: "ses" }, resendOnly)).toMatch(/Amazon SES/);
    expect(providerOptionAvailable("ses", resendOnly)).toBe(false);
  });

  test("rejects an unverified domain when SES carries the mail", () => {
    const reason = validateSenderIdentityEdit(
      { ...edit, provider: "ses" },
      { managedAvailable: true, sesEnabled: true, sesConnected: true },
      { verifiedDomains: ["other.com"] },
    );
    expect(reason).toMatch(/not a verified/);
  });

  test("rejects malformed input", () => {
    expect(validateSenderIdentityEdit({ ...edit, email: "nope" }, resendOnly)).toMatch(/valid sender/);
    expect(validateSenderIdentityEdit({ ...edit, name: "  " }, resendOnly)).toMatch(/display name/);
    expect(
      validateSenderIdentityEdit({ ...edit, email: "billing@evil.com" }, resendOnly, {
        allowedDomains: ["munchreach.com"],
      }),
    ).toMatch(/not a MunchReach sending domain/);
  });
});
