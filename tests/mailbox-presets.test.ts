import { describe, expect, it } from "vitest";

import { domainOfEmail, suggestMailboxSettings, usesImplicitTls } from "@/lib/mailbox-presets";

describe("domainOfEmail", () => {
  it("reads the domain after the last @, lowercased", () => {
    expect(domainOfEmail("  Jane@Example.COM ")).toBe("example.com");
    expect(domainOfEmail("nope")).toBeNull();
    expect(domainOfEmail(null)).toBeNull();
  });
});

describe("suggestMailboxSettings", () => {
  it("suggests Gmail hosts", () => {
    const preset = suggestMailboxSettings("jane@gmail.com")!;
    expect(preset.smtpHost).toBe("smtp.gmail.com");
    expect(preset.imapHost).toBe("imap.gmail.com");
    expect(preset.smtpPort).toBe(465);
    expect(preset.imapPort).toBe(993);
  });

  it("suggests Microsoft 365 hosts with STARTTLS on 587", () => {
    const preset = suggestMailboxSettings("jane@outlook.com")!;
    expect(preset.smtpHost).toBe("smtp.office365.com");
    expect(preset.smtpPort).toBe(587);
    expect(preset.smtpSecurity).toBe("tls");
    expect(preset.imapHost).toBe("outlook.office365.com");
  });

  it("suggests Zoho, Hostinger and Titan hosts", () => {
    expect(suggestMailboxSettings("a@zoho.com")!.smtpHost).toBe("smtp.zoho.com");
    expect(suggestMailboxSettings("a@hostinger.com")!.imapHost).toBe("imap.hostinger.com");
    expect(suggestMailboxSettings("a@privateemail.com")!.smtpHost).toBe("smtp.privateemail.com");
    expect(suggestMailboxSettings("a@titan.email")!.imapHost).toBe("imap.privateemail.com");
  });

  it("falls back to a mail.<domain> guess for unknown domains", () => {
    const preset = suggestMailboxSettings("jane@acme-foods.co")!;
    expect(preset.smtpHost).toBe("mail.acme-foods.co");
    expect(preset.imapHost).toBe("mail.acme-foods.co");
    expect(preset.note).toMatch(/guessed/i);
  });

  it("returns nothing without a usable address", () => {
    expect(suggestMailboxSettings("not-an-email")).toBeNull();
  });
});

describe("usesImplicitTls", () => {
  it("is only true for SSL", () => {
    expect(usesImplicitTls("ssl")).toBe(true);
    expect(usesImplicitTls("tls")).toBe(false);
    expect(usesImplicitTls("none")).toBe(false);
  });
});
