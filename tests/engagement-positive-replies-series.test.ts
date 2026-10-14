import { describe, it, expect } from "vitest";
import { ENGAGEMENT_SERIES, engagementTrend, positiveReplyTrend } from "@/lib/analytics-overview";
import type { AnalyticsTimeseriesPoint } from "@/lib/analytics-model";

const from = new Date("2026-10-01T00:00:00.000Z");
const to = new Date("2026-10-04T00:00:00.000Z");

const row = (received_at: string, sentiment: string, extra: Record<string, unknown> = {}) => ({
  received_at,
  sentiment,
  lead_id: "throwaway-chart-contact",
  ...extra,
});

describe("engagement overview positive-replies series", () => {
  it("replaces clicks with positive replies in the chart series", () => {
    const keys = ENGAGEMENT_SERIES.map(s => s.key);
    expect(keys).toContain("positiveReplies");
    expect(keys).not.toContain("clicks");
    expect(ENGAGEMENT_SERIES.find(s => s.key === "positiveReplies")?.label).toBe("Positive replies");
  });

  it("counts positive replies per person per bucket and matches trend bucket keys", () => {
    const rows = [
      row("2026-10-01T10:00:00.000Z", "positive"),
      // Second positive reply from the same person the same day counts once.
      row("2026-10-01T18:00:00.000Z", "positive"),
      row("2026-10-02T09:00:00.000Z", "negative"),
      row("2026-10-02T09:30:00.000Z", "neutral"),
      row("2026-10-03T09:00:00.000Z", "POSITIVE", { lead_id: "throwaway-chart-contact-2" }),
    ];
    const counts = positiveReplyTrend(rows, from, to, "day");
    const points = engagementTrend([], from, to, "day");
    for (const p of points as AnalyticsTimeseriesPoint[]) p.positiveReplies = counts.get(p.bucket) ?? 0;
    expect(points.map(p => p.positiveReplies)).toEqual([1, 0, 1]);
  });

  it("excludes rows outside the selected range and rows without a person", () => {
    const rows = [
      row("2026-09-30T23:00:00.000Z", "positive"),
      row("2026-10-02T09:00:00.000Z", "positive", { lead_id: "", from_email: "" }),
      row("2026-10-02T09:00:00.000Z", "positive"),
    ];
    const counts = positiveReplyTrend(rows, from, to, "day");
    expect(counts.size).toBe(1);
    expect([...counts.values()]).toEqual([1]);
  });

  it("keeps real zero buckets in an empty range", () => {
    expect(positiveReplyTrend([], from, to, "day").size).toBe(0);
    expect(engagementTrend([], from, to, "day").every(p => p.positiveReplies === 0)).toBe(true);
  });
});
