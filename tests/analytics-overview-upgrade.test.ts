import { describe, it, expect } from "vitest";
import { collapseMessageUnits } from "@/lib/campaign-stats";
import { engagementTrend, summarizeEngagement, uniqueReplyIntents } from "@/lib/analytics-overview";
import { openRate, replyRate } from "@/lib/analytics-model";

const from = new Date("2026-10-01T00:00:00Z");
const to = new Date("2026-10-04T00:00:00Z");
const at = "2026-10-02T10:00:00Z";
const units = () => [...collapseMessageUnits([
  { id: "11111111-1111-4111-8111-111111111111", recipient_id: "test-contact", step_order: 1, sent_at: at, opened_at: at, replied_at: at, sending_account_id: "test-mailbox" },
  { id: "22222222-2222-4222-8222-222222222222", recipient_id: "test-contact", step_order: 2, sent_at: at, opened_at: at, replied_at: at, sending_account_id: "test-mailbox" },
]).values()];

describe("analytics overview actual units", () => {
  it("separates emails from contacted people and unique opens", () => {
    const summary = summarizeEngagement(units(), from, to);
    expect(summary.sent).toBe(2);
    expect(summary.contacted).toBe(1);
    expect(summary.opens).toBe(1);
    expect(summary.delivered).toBe(0);
    expect(summary.deliveryComplete).toBe(false);
  });
  it("does not infer confirmed delivery from an SMTP acceptance", () => {
    const summary = summarizeEngagement(units(), from, to);
    expect(summary.delivered).toBe(0);
  });
  it("uses confirmed delivery for rates only with complete receipts", () => {
    expect(openRate({ sent: 10, delivered: 8, opens: 4, deliveryComplete: true })).toBe(50);
    expect(replyRate({ sent: 10, delivered: 8, replies: 2, deliveryComplete: true })).toBe(25);
    expect(openRate({ sent: 10, delivered: 1, opens: 4, deliveryComplete: false })).toBe(40);
  });
  it("shows real zero buckets and deduplicates same-day follow-up opens/replies", () => {
    const points = engagementTrend(units(), from, to, "day");
    expect(points).toHaveLength(3);
    expect(points[0]?.sent).toBe(0);
    expect(points[1]).toMatchObject({ sent: 2, opens: 1, replies: 1 });
    expect(points[2]?.opens).toBe(0);
  });
  it("excludes out-of-window and invalid timestamps", () => {
    expect(engagementTrend(units(), new Date("2026-10-03"), to, "day")[0]?.sent).toBe(0);
    const malformed = units().map(u => ({ ...u, sentAt: "invalid" }));
    expect(summarizeEngagement(malformed, from, to).sent).toBe(0);
  });
  it("keeps the latest manual intent and deduplicates normalized sender addresses", () => {
    expect(uniqueReplyIntents([{ from_email: "TEST@example.invalid", sentiment: "negative" }, { from_email: "test@example.invalid", sentiment: "positive" }])).toEqual({ replies: 1, positiveReplies: 0, negativeReplies: 1 });
  });
  it("returns actual zero counts in an empty workspace", () => {
    expect(summarizeEngagement([], from, to)).toMatchObject({ contacted: 0, delivered: 0, opens: 0, replies: 0 });
    expect(uniqueReplyIntents([])).toEqual({ replies: 0, positiveReplies: 0, negativeReplies: 0 });
  });
});