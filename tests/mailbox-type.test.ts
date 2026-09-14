import { describe, expect, it } from "vitest";

import { emailProviderOf, mailboxTypeOf } from "@/lib/mailbox-type";

describe("emailProviderOf", () => {
  it("detects Google addresses", () => {
    expect(emailProviderOf("test@gmail.com")).toBe("google");
    expect(emailProviderOf("test@googlemail.com")).toBe("google");
  });
  it("detects Outlook addresses", () => {
    expect(emailProviderOf("test@outlook.com")).toBe("outlook");
    expect(emailProviderOf("test@hotmail.com")).toBe("outlook");
    expect(emailProviderOf("test@live.com")).toBe("outlook");
    expect(emailProviderOf("test@msn.com")).toBe("outlook");
  });
  it("treats everything else as Other", () => {
    expect(emailProviderOf("test@company.com")).toBe("other");
    expect(emailProviderOf("not-an-email")).toBe("other");
    expect(emailProviderOf(null)).toBe("other");
    expect(emailProviderOf("")).toBe("other");
  });
  it("is case-insensitive and trims whitespace", () => {
    expect(emailProviderOf("  Test@GMAIL.com  ")).toBe("google");
    expect(emailProviderOf(" TEST@Hotmail.COM ")).toBe("outlook");
  });
  it("uses the domain after the last @", () => {
    expect(emailProviderOf('"weird@name"@gmail.com')).toBe("google");
  });
});

describe("mailboxTypeOf", () => {
  it("classifies Google Workspace mailboxes", () => {
    expect(mailboxTypeOf({ provider: "gmail", connection_method: "oauth" })).toBe("google");
    expect(mailboxTypeOf({ provider: "smtp", connection_method: "google_oauth" })).toBe("google");
  });
  it("classifies Outlook / Microsoft 365 mailboxes", () => {
    expect(mailboxTypeOf({ provider: "outlook", connection_method: "oauth" })).toBe("outlook");
    expect(mailboxTypeOf({ provider: "smtp", connection_method: "microsoft_oauth" })).toBe("outlook");
    expect(mailboxTypeOf({ provider: null, connection_method: "office365" })).toBe("outlook");
  });
  it("treats IMAP, SMTP and everything else as Other", () => {
    expect(mailboxTypeOf({ provider: "smtp", connection_method: "imap" })).toBe("other");
    expect(mailboxTypeOf({})).toBe("other");
  });
});
