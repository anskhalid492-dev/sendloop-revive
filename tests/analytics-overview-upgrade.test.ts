import { describe, it, expect } from "vitest";
import { collapseMessageUnits } from "@/lib/campaign-stats";
import { collapseAnalyticsUnits, engagementTrend, summarizeEngagement, uniqueReplyIntents } from "@/lib/analytics-overview";
import { deliveryPresentation, failedSendCount, openRate, replyRate } from "@/lib/analytics-model";

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
    expect(summary.delivered).toBe(2);
    expect(summary.deliveryComplete).toBe(false);
  });
  it("counts delivered as sent minus bounced", () => {
    const summary = summarizeEngagement(units(), from, to);
    expect(summary.delivered).toBe(2);
  });
  it("divides unique people by reachable people, never by emails sent", () => {
    // A 3-step sequence sends one person 3 emails: 30 sends, 10 contacted.
    expect(openRate({ sent: 30, contacted: 10, bounced: 2, delivered: 0, opens: 4 })).toBe(50);
    expect(replyRate({ sent: 30, contacted: 10, delivered: 0, replies: 2 })).toBe(20);
    // Rows without a contacted count (single step) fall back to sends.
    expect(openRate({ sent: 10, delivered: 1, opens: 4 })).toBe(40);
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
  it("keeps campaigns isolated while collapsing retries within each campaign", () => {
    const messages = [
      { id: "test-analytics-a", campaign_id: "throwaway-analytics-campaign-a", lead_id: "throwaway-analytics-contact", step_order: 1, sent_at: at },
      { id: "test-analytics-retry", campaign_id: "throwaway-analytics-campaign-a", lead_id: "throwaway-analytics-contact", step_order: 1, sent_at: at },
      { id: "test-analytics-b", campaign_id: "throwaway-analytics-campaign-b", lead_id: "throwaway-analytics-contact", step_order: 1, sent_at: at },
    ];
    const summary = summarizeEngagement(collapseAnalyticsUnits(messages), from, to);
    expect(summary.sent).toBe(3);
    expect(summary.contacted).toBe(1);
  });
  it("preserves a separate failed message alongside a later send as an additional failed send", () => {
    const collapsed = collapseAnalyticsUnits([
      { id: "test-failed-attempt", recipient_id: "throwaway-analytics-contact", status: "failed", failed_at: at, updated_at: at },
      { id: "test-recovered-attempt", recipient_id: "throwaway-analytics-contact", status: "sent", sent_at: at },
    ]);
    expect(summarizeEngagement(collapsed, from, to)).toMatchObject({ sent: 1, failed: 1 });
  });
  it("does not move historical failures into the reporting range using updated_at", () => {
    const collapsed = collapseAnalyticsUnits([
      { id: "test-old-failure", status: "failed", failed_at: "2026-09-01T00:00:00Z", updated_at: at },
      { id: "test-undated-failure", status: "failed", updated_at: at },
      { id: "test-dated-failure", status: "failed", failed_at: at },
    ]);
    expect(summarizeEngagement(collapsed, from, to)).toMatchObject({ failed: 1, failureHistoryIncomplete: true });
  });
  it("distinguishes absent receipts, failed reads, partial confirmation and empty data", () => {
    const summary = { sent: 1266, delivered: 0, opens: 170, clicks: 0, replies: 0, positiveReplies: 0, bounced: 0, unsubscribed: 0, complained: 0, failed: 0 };
    expect(deliveryPresentation(summary).value).toBe("0");
    expect(deliveryPresentation({ ...summary, delivered: 100 }).value).toBe("100");
    expect(deliveryPresentation({ ...summary, sent: 0 }).value).toBe("0");
  });
  it("includes undated failed sends from every campaign without inventing a failure date", () => {
    const summary = summarizeEngagement(collapseAnalyticsUnits([
      { id: "test-failure-a", campaign_id: "throwaway-campaign-a", lead_id: "throwaway-contact", status: "failed" },
      { id: "test-failure-a-duplicate", campaign_id: "throwaway-campaign-a", lead_id: "throwaway-contact", status: "failed" },
      { id: "test-failure-b", campaign_id: "throwaway-campaign-b", lead_id: "throwaway-contact", status: "failed" },
      { id: "test-dated-current", campaign_id: "throwaway-campaign-b", lead_id: "throwaway-other", status: "failed", failed_at: at },
      { id: "test-dated-old", campaign_id: "throwaway-campaign-b", status: "failed", failed_at: "2026-09-01T00:00:00Z", updated_at: at },
    ]), from, to);
    expect(summary).toMatchObject({ failed: 1, undatedFailed: 3, failureHistoryIncomplete: true });
    expect(failedSendCount({ failed: summary.failed ?? 0, undatedFailed: summary.undatedFailed })).toBe(4);
  });
  it("excludes recovered sends and bounces from undated failures", () => {
    const summary = summarizeEngagement(collapseAnalyticsUnits([
      { id: "test-recovery-failed", lead_id: "throwaway-recovered", status: "failed" },
      { id: "test-recovery-sent", lead_id: "throwaway-recovered", status: "sent", sent_at: at },
      { id: "test-bounced-failure", status: "failed", bounced_at: at },
      { id: "test-pending", status: "scheduled" },
      { id: "test-cancelled", status: "cancelled" },
    ]), from, to);
    expect(summary).toMatchObject({ failed: 0, undatedFailed: 1, failureHistoryIncomplete: true });
    expect(failedSendCount({ failed: 0 })).toBe(0);
  });
  it("preserves the existing open-rate denominator rather than using contacted or failures", () => {
    // Arithmetic illustration only, not a claim about the reported production bounce count.
    expect(openRate({ sent: 1266, bounced: 50, delivered: 0, opens: 170 })).toBe(14);
    expect(openRate({ sent: 1266, bounced: 0, delivered: 0, opens: 170 })).toBe(13.4);
  });
  it("uses exact inclusive-start/exclusive-end timestamps for every summary series", () => {
    const collapsed = collapseAnalyticsUnits([
      { id: "test-before", sent_at: "2026-09-30T23:59:59.999Z", opened_at: "2026-09-30T23:59:59.999Z" },
      { id: "test-start", sent_at: from.toISOString(), opened_at: from.toISOString() },
      { id: "test-end", sent_at: to.toISOString(), opened_at: to.toISOString() },
    ]);
    expect(summarizeEngagement(collapsed, from, to)).toMatchObject({ sent: 1, opens: 1 });
    const points = engagementTrend(collapsed, from, to, "day");
    expect(points.reduce((n, p) => n + p.sent, 0)).toBe(1);
    expect(points.reduce((n, p) => n + p.opens, 0)).toBe(1);
  });
});