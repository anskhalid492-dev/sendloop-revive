import { describe, expect, it } from "vitest";
import { normalizeReportedDeliveryKind, parseDeliveryReport, isSenderPolicyFailure } from "../src/lib/dsn-parse";

const bouncedCases = [
  "550 5.7.1_ETR",
  "This message could not be delivered. Please contact support.",
];

describe("errors that must always be bounced", () => {
  for (const c of bouncedCases) {
    it(`provider event "${c}" is bounced, not failed`, () => {
      expect(normalizeReportedDeliveryKind("failed", c)).toBe("bounced");
      expect(normalizeReportedDeliveryKind("bounced", c)).toBe("bounced");
      expect(isSenderPolicyFailure(c)).toBe(false);
    });
    it(`delivery report "${c}" is bounced`, () => {
      expect(parseDeliveryReport({ text: `Diagnostic-Code: smtp; ${c}`, subject: "Mail failure" }).kind).toBe("bounced");
    });
  }

  it("handles case, spacing and extra server text", () => {
    expect(normalizeReportedDeliveryKind("failed", "host said:  550   5.7.1_etr  rejected by gateway")).toBe("bounced");
    expect(normalizeReportedDeliveryKind("failed", "THIS MESSAGE COULD NOT BE DELIVERED.   please contact SUPPORT now")).toBe("bounced");
  });

  it("a generic DSN subject alone is never a bounce", () => {
    expect(normalizeReportedDeliveryKind("failed", "Delivery Status Notification (Failure)")).toBe("failed");
    expect(normalizeReportedDeliveryKind("delayed", "Delivery Status Notification (Failure)")).toBe("delayed");
    expect(parseDeliveryReport({ text: "", subject: "delivery status notification  ( failure )" }).kind).toBe("failed");
  });

  it("a DSN with clear recipient/mailbox failure evidence is a bounce", () => {
    expect(
      parseDeliveryReport({
        text: "Diagnostic-Code: smtp; 550 5.1.1 User unknown",
        subject: "Delivery Status Notification (Failure)",
      }).kind,
    ).toBe("bounced");
  });

  it("DKIM signature failures are sender-side failures, never bounces", () => {
    const dkim = "550 5.7.0 bad DKIM signature data (in reply to end of DATA command)";
    expect(normalizeReportedDeliveryKind("failed", dkim)).toBe("failed");
    expect(normalizeReportedDeliveryKind("bounced", dkim)).toBe("failed");
    expect(isSenderPolicyFailure(dkim)).toBe(true);
    expect(parseDeliveryReport({ text: `Diagnostic-Code: smtp; ${dkim}`, subject: "Mail failure" }).kind).toBe("failed");
  });

  it("does not turn other failures into bounces", () => {
    expect(normalizeReportedDeliveryKind("failed", "550 5.7.1 [CS] Message blocked.")).toBe("failed");
    expect(normalizeReportedDeliveryKind("failed", "Connection timed out")).toBe("failed");
    expect(normalizeReportedDeliveryKind("bounced", "550 5.7.1 Message rejected due to sender reputation")).toBe("failed");
    expect(parseDeliveryReport({ text: "", subject: "Undelivered Mail Returned to Sender" }).kind).toBe("failed");
  });
});
