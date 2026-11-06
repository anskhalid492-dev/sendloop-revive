import { describe, expect, it } from "vitest";

import { normalizeReportedDeliveryKind, parseDeliveryReport } from "../src/lib/dsn-parse";

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

  it("keeps a policy/spam block as a failed send, not a recipient bounce", () => {
    const r = parseDeliveryReport({
      text: "host mx.example.com said: 550 5.7.1 Message rejected due to sender reputation",
      subject: "Mail delivery failed: returning message to sender",
    });
    expect(r.kind).toBe("failed");
    expect(r.status).toBe("5.7.1");
    expect(r.reason).toContain("sender reputation");
  });

  it("does not bounce or suppress a valid address for the exact CS policy block", () => {
    const r = parseDeliveryReport({
      text: "Diagnostic-Code: smtp; 550 5.7.1 [CS] Message blocked. If this is a false positive, please report",
      subject: "Undelivered Mail Returned to Sender",
    });
    expect(r.kind).toBe("failed");
    expect(r.status).toBe("5.7.1");
    expect(normalizeReportedDeliveryKind("bounced", r.reason)).toBe("failed");
  });

  it("normalizes a direct provider policy bounce to failed", () => {
    expect(normalizeReportedDeliveryKind("bounced", "550 5.7.1 [CS] Message blocked.")).toBe("failed");
    expect(normalizeReportedDeliveryKind("bounced", "550 5.1.1 No such user")).toBe("bounced");
  });

  // Owner rule (Nov 2026): a bare 550 counts as a bounce, without suppression.
  it("treats a bare 550 report as bounced", () => {
    const r = parseDeliveryReport({
      text: "Diagnostic-Code: smtp; 550",
      subject: "Undelivered Mail Returned to Sender",
    });
    expect(r.kind).toBe("bounced");
  });

  it("detects a delay report with no status code at all", () => {
    const r = parseDeliveryReport({
      text: "Your message has not yet been delivered. The mail system will retry for 2 more days.",
      subject: "Delivery Status Notification (Delay)",
    });
    expect(r.kind).toBe("delayed");
  });

  it("does not infer an invalid recipient from a generic failure subject", () => {
    const r = parseDeliveryReport({ text: "", subject: "Undelivered Mail Returned to Sender" });
    expect(r.kind).toBe("failed");
    expect(r.reason).toBe("Undelivered Mail Returned to Sender");
  });
});
