import { describe, expect, it } from "vitest";
import {
  enhancedStatusCodes,
  isPermanentRejectionBounce,
  isSenderPolicyFailure,
  normalizeReportedDeliveryKind,
  parseDeliveryReport,
} from "../src/lib/dsn-parse";
import { messageDeliveryState } from "../src/lib/campaign-delivery-state";
import { computeCampaignStats } from "../src/lib/campaign-stats";
import { isRetryableFailure } from "../src/lib/campaign-run-state";
import { outcomeUnknownReason } from "../src/lib/campaign-send-phase";

const r5193 = 'Mail relay returned 550: {"message":"550 5.7.193 UserSubmission rejected"}';

describe("550 5.7.193 is bounced by its SMTP code", () => {
  it("reads the enhanced code, not wording", () => {
    expect(enhancedStatusCodes(r5193)).toContain("5.7.193");
    expect(isPermanentRejectionBounce(r5193)).toBe(true);
    expect(isPermanentRejectionBounce("550 5.7.193")).toBe(true);
    expect(isSenderPolicyFailure(r5193)).toBe(false);
    expect(normalizeReportedDeliveryKind("failed", r5193)).toBe("bounced");
    expect(parseDeliveryReport({ text: "Diagnostic-Code: smtp; 550 5.7.193 rejected", subject: "x" }).kind).toBe("bounced");
  });

  it("550 5.7.1 stays a failed sender/policy refusal", () => {
    expect(isPermanentRejectionBounce("550 5.7.1 Message blocked")).toBe(false);
    expect(isPermanentRejectionBounce("550 5.7.1934 x")).toBe(false);
    expect(normalizeReportedDeliveryKind("bounced", "550 5.7.1 Message blocked")).toBe("failed");
  });

  it("550 5.1.1 stays an invalid-recipient bounce", () => {
    expect(normalizeReportedDeliveryKind("bounced", "550 5.1.1 User unknown")).toBe("bounced");
    expect(isPermanentRejectionBounce("550 5.1.1 User unknown")).toBe(false);
  });

  it("temporary 4xx replies stay temporary", () => {
    expect(isPermanentRejectionBounce("451 4.7.193 try again later")).toBe(false);
    expect(isPermanentRejectionBounce("451 5.7.193 try later")).toBe(false);
    expect(parseDeliveryReport({ text: "Diagnostic-Code: smtp; 451 4.4.7 deferred, will retry", subject: "x" }).kind).toBe("delayed");
  });

  it("an interrupted send with unknown outcome is never bounced", () => {
    const held = `${outcomeUnknownReason(null)} 550 5.7.193`;
    expect(isPermanentRejectionBounce(held)).toBe(false);
    expect(normalizeReportedDeliveryKind("failed", held)).toBe("failed");
  });

  it("retry behaviour is unchanged (already permanent, never retried)", () => {
    expect(isRetryableFailure(r5193)).toBe(false);
  });

  it("a send-time 5.7.193 row is counted as Bounced, not Failed", () => {
    const row = {
      id: "m1", campaign_id: "c1", recipient_id: "r1", step_order: 1, status: "failed",
      delivery_status: "bounced", bounced_at: "2026-10-14T10:00:00.000Z", updated_at: "2026-10-14T10:00:00.000Z",
    };
    expect(messageDeliveryState(row as never)).toBe("bounced");
    const stats = computeCampaignStats({
      campaignId: "c1", leads: 1, messages: [row],
      from: new Date("2026-10-14T00:00:00Z"), to: new Date("2026-10-15T00:00:00Z"),
    });
    expect(stats.bounced).toBe(1);
    expect(stats.failed).toBe(0);
  });
});
