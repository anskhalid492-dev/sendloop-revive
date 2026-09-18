import { describe, expect, it } from "vitest";

import { parseDeliveryReport } from "../src/lib/dsn-parse";

describe("delivery reports", () => {
  it("reads a permanent failure and keeps the server's own words", () => {
    const r = parseDeliveryReport({
      text: [
        "Final-Recipient: rfc822; info@sprelly.com",
        "Action: failed",
        "Status: 5.1.1",
        "Diagnostic-Code: smtp; 550 5.1.1 <info@sprelly.com>: Recipient address rejected: User unknown",
      ].join("\n"),
      subject: "Undelivered Mail Returned to Sender",
    });
    expect(r.kind).toBe("bounced");
    expect(r.status).toBe("5.1.1");
    expect(r.reason).toContain("User unknown");
  });

  it("treats a temporary deferral as a delay, not a bounce", () => {
    const r = parseDeliveryReport({
      text: [
        "This is the mail system at host mail.example.com.",
        "####  THIS IS A WARNING ONLY.  YOU DO NOT NEED TO RESEND YOUR MESSAGE.  ####",
        "Status: 4.4.7",
        "Diagnostic-Code: smtp; 451 4.4.7 Delivery temporarily deferred, will retry",
      ].join("\n"),
      subject: "Undelivered Mail Returned to Sender",
    });
    expect(r.kind).toBe("delayed");
    expect(r.status).toBe("4.4.7");
  });

  it("recognises a policy/spam block as a permanent failure with its reason", () => {
    const r = parseDeliveryReport({
      text: "host mx.example.com said: 550 5.7.1 Message rejected due to sender reputation",
      subject: "Mail delivery failed: returning message to sender",
    });
    expect(r.kind).toBe("bounced");
    expect(r.status).toBe("5.7.1");
    expect(r.reason).toContain("sender reputation");
  });

  it("detects a delay report with no status code at all", () => {
    const r = parseDeliveryReport({
      text: "Your message has not yet been delivered. The mail system will retry for 2 more days.",
      subject: "Delivery Status Notification (Delay)",
    });
    expect(r.kind).toBe("delayed");
  });

  it("falls back to the subject when the report carries no detail", () => {
    const r = parseDeliveryReport({ text: "", subject: "Undelivered Mail Returned to Sender" });
    expect(r.kind).toBe("bounced");
    expect(r.reason).toBe("Undelivered Mail Returned to Sender");
  });
});
