import { describe, expect, it } from "vitest";
import { classifyEmailOutcome } from "../src/lib/email-outcome";
import { normalizeReportedDeliveryKind, parseDeliveryReport } from "../src/lib/dsn-parse";
import { isPermanentFailure, isRetryableFailure } from "../src/lib/campaign-run-state";
import { outcomeUnknownReason } from "../src/lib/campaign-send-phase";

const o = (t: string) => classifyEmailOutcome(t).outcome;

const BOUNCED = [
  "550 5.1.1 User unknown",
  "550 5.1.0 Invalid recipient",
  "550 5.1.3 Invalid address",
  "550 5.2.1 Mailbox disabled",
  "550 5.2.2 Mailbox full",
  "551 5.1.1 Recipient unavailable",
  "553 5.1.3 Invalid recipient",
  "554 5.1.1 Invalid recipient",
  "550 5.1.2 Bad destination system address",
  "550 5.1.6 Recipient has moved",
  "550 Mailbox not found",
  "550 No such user here",
  "550 Recipient does not exist",
  "550 Invalid destination mailbox",
  // Provider variants
  "550-5.1.1 The email account that you tried to reach does not exist. Please try double-checking",
  "550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup",
  "554 delivery error: dd This user doesn't have a yahoo.com account (x@yahoo.com) [0]",
  "550 5.1.1 User does not exist - <x@zoho.com>",
  "Mail relay returned 550: {\"message\":\"550 5.1.1 no such user: bad@example.com\"}",
  "  550   5.1.1   USER   UNKNOWN  ",
];

const FAILED = [
  "550 5.7.0 bad DKIM signature data",
  "550 5.7.193 UserSubmission rejected",
  "550 5.7.1 policy rejection",
  "550 5.7.23 SPF rejection",
  "550 5.7.26 This message does not pass authentication checks",
  "554 5.7.1 Message rejected due to spam content",
  "535 5.7.8 Username and Password not accepted",
  "530 Authentication required",
  "550 5.7.1 [CS] Message blocked",
  "SMTP credentials rejected",
  "TLS negotiation failed",

  "421 4.7.0 Try again later",
  "Delivery Status Notification (Failure)",
];

const DELAYED = [
  "451 4.4.7 Delivery temporarily deferred",
  "450 4.2.2 Mailbox full, try later",
  "452 4.3.1 Insufficient system storage",
];

describe("central engine: Bounced", () => {
  for (const t of BOUNCED) it(t, () => expect(o(t)).toBe("bounced"));
  it("recipient bounces are safe to suppress", () => {
    expect(classifyEmailOutcome("550 5.1.1 User unknown").recipientInvalid).toBe(true);
  });
});

describe("central engine: Failed (never Bounced)", () => {
  for (const t of FAILED) it(t, () => expect(o(t)).toBe("failed"));
  it("4.7.x is sender-side, not temporary bounce", () => expect(o("421 4.7.0 TLS required")).toBe("failed"));
});

describe("central engine: temporary", () => {
  for (const t of DELAYED) it(t, () => expect(o(t)).toBe("delayed"));
});

describe("central engine: Unknown", () => {
  it("interrupted send marker", () => {
    expect(o(`${outcomeUnknownReason(null)} 550 5.1.1 user unknown`)).toBe("unknown");
    expect(o("send_outcome_unknown_after_interrupt")).toBe("unknown");
  });
  it("timeout after submission / missing confirmation", () => {
    expect(o("SMTP timed out after DATA")).toBe("unknown");
    expect(o("Connection lost after submission")).toBe("unknown");
    expect(o("Missing provider confirmation")).toBe("unknown");
    expect(classifyEmailOutcome({ text: "550 5.1.1", interrupted: true }).outcome).toBe("unknown");
  });
  it("unknown is never normalized to bounced", () => {
    expect(normalizeReportedDeliveryKind("bounced", "send_outcome_unknown_after_interrupt")).toBe("failed");
  });
});

describe("conflicting evidence", () => {
  it("sender-side wording beats a recipient code", () => {
    expect(o("550 5.1.1 rejected: SPF check failed for sender")).toBe("failed");
    expect(o("550 5.1.0 sender address rejected: DMARC policy")).toBe("failed");
  });
  it("a bare 5xx is never bounced", () => {
    expect(o("554 Transaction failed")).toBe("failed");
  });
  it("forced patterns stay bounced unless sender evidence is present", () => {
    expect(o("550 5.7.1_ETR")).toBe("bounced");
    expect(o("This message could not be delivered. Please contact support.")).toBe("bounced");
    expect(o("550 5.7.1_ETR DKIM signature failed")).toBe("failed");
  });
});

describe("DSN parsing uses the same engine", () => {
  it("subject alone is never a bounce", () => {
    expect(parseDeliveryReport({ text: "", subject: "Delivery Status Notification (Failure)" }).kind).toBe("failed");
  });
  it("confirmed recipient DSN is a bounce", () => {
    expect(
      parseDeliveryReport({
        text: "Action: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist",
        subject: "Delivery Status Notification (Failure)",
      }).kind,
    ).toBe("bounced");
  });
  it("status line alone (no diagnostic) is evidence", () => {
    expect(parseDeliveryReport({ text: "Action: failed\nStatus: 5.1.1", subject: "x" }).kind).toBe("bounced");
  });
  it("quoted original headers cannot flip a recipient bounce", () => {
    const r = parseDeliveryReport({
      text: "Status: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 User unknown\n\nAuthentication-Results: spf=pass dkim=pass",
      subject: "Undelivered",
    });
    expect(r.kind).toBe("bounced");
  });
  it("DSN policy refusal is failed", () => {
    expect(parseDeliveryReport({ text: "Diagnostic-Code: smtp; 550 5.7.26 unauthenticated mail", subject: "x" }).kind).toBe("failed");
  });
});

describe("retry behaviour (both sending modes share runCampaign's rules)", () => {
  it("recipient bounces are never retried", () => {
    expect(isRetryableFailure("550 No such user here")).toBe(false);
    expect(isPermanentFailure("Recipient does not exist")).toBe(true);
  });
  it("5.7.x stays non-retried as before", () => {
    expect(isRetryableFailure("550 5.7.193 UserSubmission rejected")).toBe(false);
  });
  it("temporary failures stay retryable", () => {
    expect(isRetryableFailure("451 4.4.7 Delivery temporarily deferred")).toBe(true);
  });
});

describe("pre-publish review items", () => {
  it("554 READ is Bounced only with confirmed recipient rejection", () => {
    expect(o("554 READ: Recipient address rejected: User unknown")).toBe("bounced");
    expect(o("554 5.1.1 READ error: mailbox does not exist")).toBe("bounced");
    expect(o("554 READ")).toBe("bounced");
    expect(o("554 READ error: message rejected due to spam content")).toBe("failed");
  });

  it("DSN (Failure) is Bounced only when the diagnostic confirms it", () => {
    const subject = "Delivery Status Notification (Failure)";
    expect(parseDeliveryReport({ text: "Final-Recipient: rfc822; a@x.com\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 user unknown", subject }).kind).toBe("bounced");
    expect(parseDeliveryReport({ text: "Action: failed\nStatus: 5.0.0\nDiagnostic-Code: smtp; 550 Requested action not taken: mailbox unavailable", subject }).kind).toBe("bounced");
    expect(parseDeliveryReport({ text: "Action: failed\nStatus: 5.7.26\nDiagnostic-Code: smtp; 550 5.7.26 unauthenticated", subject }).kind).toBe("failed");
    expect(parseDeliveryReport({ text: "Action: failed", subject }).kind).toBe("failed");
    expect(parseDeliveryReport({ text: "", subject }).kind).toBe("failed");
  });

  it("550 permanent recipient rejections are Bounced; bare permanent stays Failed", () => {
    expect(o("550 Requested action not taken: mailbox unavailable")).toBe("bounced");
    expect(o("550 permanent failure for one or more recipients: user unknown")).toBe("bounced");
    expect(o("550 Permanent failure")).toBe("bounced");
    expect(o("550 5.7.1 Requested action not taken: mailbox unavailable, policy")).toBe("failed");
  });

  // Owner decision (Nov 2026): permanent 5.4.x recipient rejections are hard bounces.
  it("Microsoft 5.4.1 Recipient address rejected is Bounced; 4.4.1 is not", () => {
    expect(o("550 5.4.1 Recipient address rejected: Access denied. AS(201806281) [BN8NAM12FT055.eop-nam12.prod.protection.outlook.com]")).toBe("bounced");
    expect(o("550 5.4.1 Recipient address rejected: Access denied")).toBe("bounced");
    expect(o("550 5.4.1 Recipient address rejected: Access denied. AS(7299)")).toBe("bounced");
    expect(o("451 4.4.1 Recipient address rejected: Access denied. AS(201806281)")).not.toBe("bounced");
  });

  it("550 5.7.193 stays Failed", () => expect(o("550 5.7.193 UserSubmission rejected")).toBe("failed"));
});
