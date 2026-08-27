import { describe, expect, it } from "vitest";

import {
  SYSTEM_EMAIL_DOMAIN,
  SYSTEM_EMAIL_PURPOSES,
  SYSTEM_SENDERS,
  systemEmailPurpose,
  systemFromHeader,
  systemSender,
  systemSenderFor,
} from "@/lib/system-email-senders";

const EXPECTED: Record<(typeof SYSTEM_EMAIL_PURPOSES)[number], string> = {
  accounts: "accounts@munchreach.com",
  billing: "billing@munchreach.com",
  support: "support@munchreach.com",
  notifications: "notifications@munchreach.com",
  security: "security@munchreach.com",
  onboarding: "onboarding@munchreach.com",
  system: "system@munchreach.com",
  marketing: "marketing@munchreach.com",
};

describe("system email sender mapping", () => {
  it("defines exactly the eight required purposes", () => {
    expect([...SYSTEM_EMAIL_PURPOSES].sort()).toEqual(
      [
        "accounts",
        "billing",
        "marketing",
        "notifications",
        "onboarding",
        "security",
        "support",
        "system",
      ].sort(),
    );
    expect(Object.keys(SYSTEM_SENDERS).sort()).toEqual([...SYSTEM_EMAIL_PURPOSES].sort());
  });

  it("maps every purpose to its exact address", () => {
    for (const [purpose, email] of Object.entries(EXPECTED)) {
      const sender = systemSender(purpose as keyof typeof EXPECTED);
      expect(sender.email).toBe(email);
      expect(sender.email.endsWith(`@${SYSTEM_EMAIL_DOMAIN}`)).toBe(true);
    }
  });

  it("resolves auth/account events to the accounts sender", () => {
    expect(systemSenderFor("user.password_reset_requested").email).toBe(EXPECTED.accounts);
    expect(systemSenderFor("user.magic_link_requested").email).toBe(EXPECTED.accounts);
    expect(systemEmailPurpose("user.password_changed")).toBe("accounts");
    expect(systemSenderFor("user.email_verification_requested", "Authentication").email).toBe(
      EXPECTED.accounts,
    );
  });

  it("resolves billing events to the billing sender", () => {
    expect(systemSenderFor(null, "Billing").email).toBe(EXPECTED.billing);
    expect(systemSenderFor("subscription.updated").purpose).toBe("billing");
    expect(systemSenderFor("payment.receipt").purpose).toBe("billing");
    expect(systemSenderFor("trial.ending").purpose).toBe("billing");
  });

  it("resolves support tickets to the support sender", () => {
    expect(systemSenderFor("support.ticket_created", "Support").email).toBe(EXPECTED.support);
    expect(systemSender("support").email).toBe(EXPECTED.support);
  });

  it("resolves welcome/onboarding events to the onboarding sender", () => {
    expect(systemSenderFor("user.created").email).toBe(EXPECTED.onboarding);
    expect(systemSenderFor("workspace.created").email).toBe(EXPECTED.onboarding);
  });

  it("resolves security events to the security sender", () => {
    expect(systemSenderFor("user.login_alert").email).toBe(EXPECTED.security);
    expect(systemSenderFor(null, "Security").email).toBe(EXPECTED.security);
  });

  it("resolves announcements to marketing and unknown events to notifications", () => {
    expect(systemSenderFor("system.announcement").email).toBe(EXPECTED.marketing);
    expect(systemSenderFor("totally.unknown.event").email).toBe(EXPECTED.notifications);
    expect(systemSenderFor(undefined, undefined).email).toBe(EXPECTED.notifications);
    expect(systemSenderFor("system.healthcheck").email).toBe(EXPECTED.system);
  });

  it("builds a valid From header", () => {
    expect(systemFromHeader("accounts")).toBe(
      "MunchReach Accounts <accounts@munchreach.com>",
    );
  });

  it("never uses a campaign/customer mailbox address", () => {
    for (const sender of Object.values(SYSTEM_SENDERS)) {
      expect(sender.email).toMatch(/@munchreach\.com$/);
    }
  });
});
