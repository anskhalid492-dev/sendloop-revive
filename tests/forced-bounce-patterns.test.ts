import { describe, expect, it } from "vitest";
import { normalizeReportedDeliveryKind, parseDeliveryReport, isSenderPolicyFailure } from "../src/lib/dsn-parse";

const cases = [
  "Delivery Status Notification (Failure)",
  "550 5.7.1_ETR",
  "This message could not be delivered. Please contact support.",
  "550 5.7.0 bad DKIM signature data (in reply to end of DATA command)",
];

describe("errors that must always be bounced", () => {
  for (const c of cases) {
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
    expect(parseDeliveryReport({ text: "", subject: "delivery status notification  ( failure )" }).kind).toBe("bounced");
  });

  it("does not turn other failures into bounces", () => {
    expect(normalizeReportedDeliveryKind("failed", "550 5.7.1 [CS] Message blocked.")).toBe("failed");
    expect(normalizeReportedDeliveryKind("failed", "Connection timed out")).toBe("failed");
    expect(normalizeReportedDeliveryKind("bounced", "550 5.7.1 Message rejected due to sender reputation")).toBe("failed");
    expect(parseDeliveryReport({ text: "", subject: "Undelivered Mail Returned to Sender" }).kind).toBe("failed");
    expect(normalizeReportedDeliveryKind("delayed", "Delivery Status Notification (Failure)")).toBe("delayed");
  });
});
