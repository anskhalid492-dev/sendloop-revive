import { describe, expect, it } from "vitest";

import {
  MAILBOX_PROVIDERS,
  getMailboxProvider,
  parseMailboxProviderId,
} from "@/lib/mailbox-providers";
import { friendlyMailboxError, mailboxSuccessMessage } from "@/lib/mailbox-connect-errors";

describe("mailbox provider registry", () => {
  it("offers exactly the seven supported providers, in order", () => {
    expect(MAILBOX_PROVIDERS.map((p) => p.id)).toEqual([
      "zoho",
      "hostinger",
      "porkbun",
      "godaddy",
      "namecheap",
      "yahoo",
      "custom",
    ]);
  });

  it("documents the official server settings for each hosted provider", () => {
    const byId = Object.fromEntries(MAILBOX_PROVIDERS.map((p) => [p.id, p]));
    expect(byId["zoho"]).toMatchObject({
      imapHost: "imap.zoho.com",
      imapPort: 993,
      smtpHost: "smtp.zoho.com",
      smtpPort: 465,
      smtpSecurity: "ssl",
    });
    expect(byId["hostinger"]).toMatchObject({
      imapHost: "imap.hostinger.com",
      smtpHost: "smtp.hostinger.com",
      smtpPort: 465,
    });
    expect(byId["porkbun"]).toMatchObject({
      imapHost: "imap.porkbun.com",
      smtpHost: "smtp.porkbun.com",
      smtpPort: 587,
      smtpSecurity: "tls",
    });
    expect(byId["godaddy"]).toMatchObject({
      imapHost: "imap.secureserver.net",
      smtpHost: "smtpout.secureserver.net",
      smtpPort: 465,
    });
    expect(byId["namecheap"]).toMatchObject({
      imapHost: "mail.privateemail.com",
      smtpHost: "mail.privateemail.com",
      smtpPort: 465,
    });
    expect(byId["yahoo"]).toMatchObject({
      imapHost: "imap.mail.yahoo.com",
      smtpHost: "smtp.mail.yahoo.com",
      supportsAppPassword: true,
    });
  });

  it("leaves Custom Domain blank so the customer supplies the real host", () => {
    const custom = getMailboxProvider("custom");
    expect(custom.manual).toBe(true);
    expect(custom.imapHost).toBe("");
    expect(custom.smtpHost).toBe("");
  });

  it("falls back to Custom Domain for anything unrecognised", () => {
    expect(parseMailboxProviderId("nope")).toBeNull();
    expect(getMailboxProvider("nope" as never).id).toBe("custom");
  });
});

describe("customer-facing connection messages", () => {
  it("never leaks raw server text", () => {
    const raw = 'SMTP login failed: 535 5.7.8 Error: authentication failed at /app/relay.ts:88';
    const message = friendlyMailboxError("smtp", raw);
    expect(message).not.toContain("5.7.8");
    expect(message).not.toContain("relay.ts");
    expect(message.length).toBeGreaterThan(20);
  });

  it("points app-password providers at an app password", () => {
    const message = friendlyMailboxError("imap", "IMAP login failed: a1 NO invalid credentials", {
      appPasswordProvider: "Yahoo",
    });
    expect(message.toLowerCase()).toContain("app password");
    expect(message).toContain("Yahoo");
  });

  it("describes success without overclaiming what was checked", () => {
    expect(mailboxSuccessMessage("imap")).toContain("IMAP connection successful");
    expect(mailboxSuccessMessage("smtp")).toContain("SMTP connection successful");
    expect(mailboxSuccessMessage("smtp")).not.toMatch(/sent|delivered/i);
  });
});
