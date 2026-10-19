import { describe, it, expect } from "vitest";
import { collapseAnalyticsUnits, summarizeEngagement } from "@/lib/analytics-overview";

const from = new Date("2026-10-19T00:00:00Z");
const to = new Date("2026-10-20T00:00:00Z");
const base = { campaign_id: "throwaway-campaign", step_order: 1, bounced_at: null, delivered_at: null };

describe("sent then rejected by provider", () => {
  it("counts a send rejected after acceptance as failed in its window", () => {
    const units = collapseAnalyticsUnits([
      { ...base, id: "t1", recipient_id: "throwaway-r1", lead_id: "throwaway-l1", status: "failed", sent_at: "2026-10-19T11:40:00Z", failed_at: "2026-10-19T11:41:00Z", last_error: "554 5.7.1" },
      { ...base, id: "t2", recipient_id: "throwaway-r2", lead_id: "throwaway-l2", status: "sent", sent_at: "2026-10-19T11:40:00Z" },
    ] as never);
    expect(summarizeEngagement(units, from, to)).toMatchObject({ sent: 2, failed: 1 });
  });
  it("does not count undated legacy failures in the window total", () => {
    const units = collapseAnalyticsUnits([
      { ...base, id: "t3", recipient_id: "throwaway-r3", lead_id: "throwaway-l3", status: "failed", sent_at: null, failed_at: null },
    ] as never);
    expect(summarizeEngagement(units, from, to)).toMatchObject({ failed: 0, undatedFailed: 1 });
  });
});
