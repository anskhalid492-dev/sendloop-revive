import { describe, expect, it } from "vitest";
import { classifyEmailOutcome } from "@/lib/email-outcome";
import { parseDeliveryReport } from "@/lib/dsn-parse";
import { describeSendFailure } from "@/lib/delivery-lifecycle";

const outcome = (t: string) => classifyEmailOutcome(t).outcome;

describe("permanent recipient-side SMTP rejections are bounced", () => {
  it("550 5.4.1 (bare and Microsoft recipient-rejected wording) is bounced", () => {
    expect(outcome("550 5.4.1")).toBe("bounced");
    expect(outcome("550 5.4.1 Recipient address rejected: Access denied. For more information see https://aka.ms/EXOSmtpErrors")).toBe("bounced");
  });
  it("5.4.x routing failures are bounced", () => {
    expect(outcome("554 5.4.4 Unable to route: no MX for domain")).toBe("bounced");
    expect(outcome("550 5.4.6 Routing loop detected")).toBe("bounced");
  });
  it("any 5.1.x recipient address code is bounced", () => {
    expect(outcome("550 5.1.1 user unknown")).toBe("bounced");
    expect(outcome("550 5.1.4 ambiguous destination address")).toBe("bounced");
  });
  it("5.2.x mailbox status (incl. full mailbox) is bounced", () => {
    expect(outcome("552 5.2.2 Mailbox full")).toBe("bounced");
    expect(outcome("550 5.2.0 mailbox status failure")).toBe("bounced");
    expect(outcome("552 5.2.0 OI7Lxw2nUuET7 -")).toBe("bounced");
  });
  it("552 storage refusal is bounced, 552 size limit stays failed", () => {
    expect(outcome("552")).toBe("bounced");
    expect(outcome("552 Message size exceeds fixed maximum message size")).toBe("failed");
    expect(outcome("552 5.3.4 Message too big for system")).toBe("failed");
  });
  it("5.0.x is bounced only with recipient wording", () => {
    expect(outcome("550 5.0.0 Recipient not found")).toBe("bounced");
    expect(outcome("550 5.0.0")).toBe("failed");
  });
});

describe("sending-side and uncertain outcomes are not bounces", () => {
  it("bare 550 with no diagnostic stays failed (insufficient evidence)", () => {
    expect(classifyEmailOutcome("550").reason).toBe("ambiguous_permanent");
  });
  it("authentication failure stays failed", () => {
    expect(outcome("535 5.7.8 Authentication credentials invalid")).toBe("failed");
  });
  it("sender configuration / suspension / policy stays failed", () => {
    expect(outcome("554 5.7.1 Outbound sending is disabled for this account")).toBe("failed");
    expect(outcome("550 5.1.8 Sender domain does not exist")).toBe("failed");
    expect(outcome("550 5.7.0 bad DKIM signature data")).toBe("failed");
    expect(outcome("550 5.6.0")).toBe("failed");
  });
  it("temporary 4xx stays delayed", () => {
    expect(outcome("421 4.4.2 connection timed out, will retry")).toBe("delayed");
    expect(outcome("452 4.2.2 mailbox over quota")).toBe("delayed");
  });
  it("ambiguous interrupted delivery stays unknown", () => {
    expect(outcome("send_outcome_unknown_after_interrupt: held for review")).toBe("unknown");
  });
  it("queue label for a hard bounce says Bounced", () => {
    expect(describeSendFailure("550 5.4.1")?.category).toBe("bounced");
  });
});

describe("delivery reports keep the full folded diagnostic", () => {
  it("unfolds a wrapped Diagnostic-Code so the code and reason survive", () => {
    const report = parseDeliveryReport({
      text: "Final-Recipient: rfc822; a@example.com\r\nAction: failed\r\nDiagnostic-Code: smtp; 550\r\n    5.4.1 Recipient address rejected: Access denied\r\n",
    });
    expect(report.kind).toBe("bounced");
    expect(report.reason).toContain("5.4.1");
  });
  it("the same report parsed twice yields the same single verdict (dedupe-safe)", () => {
    const text = "Status: 5.1.1\r\nDiagnostic-Code: smtp; 550 5.1.1 user unknown";
    expect(parseDeliveryReport({ text })).toEqual(parseDeliveryReport({ text }));
  });
});
