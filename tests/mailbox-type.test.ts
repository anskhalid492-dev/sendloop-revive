import { describe, expect, it } from "vitest";

import { mailboxTypeOf } from "@/lib/mailbox-type";

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
    expect(mailboxTypeOf({ provider: "smtp", connection_method: "smtp" })).toBe("other");
    expect(mailboxTypeOf({ provider: "resend", connection_method: "managed" })).toBe("other");
    expect(mailboxTypeOf({})).toBe("other");
  });
});
