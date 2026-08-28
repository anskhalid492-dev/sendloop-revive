import { describe, expect, it } from "vitest";

import {
  buildFunnel,
  delta,
  pct,
  rankCampaigns,
  type CampaignRow,
} from "@/lib/dashboard-command-model";

function campaign(partial: Partial<CampaignRow> & { id: string }): CampaignRow {
  return {
    name: partial.id,
    status: "active",
    runState: "running",
    runLabel: "Running",
    nextRunAt: null,
    leads: 0,
    sentLifetime: 0,
    sentToday: 0,
    delivered: 0,
    replies: 0,
    positive: 0,
    meetings: 0,
    bounced: 0,
    remainingDailyCapacity: null,
    dailyQuota: 0,
    ...partial,
  };
}

describe("dashboard command model", () => {
  it("returns null deltas without a baseline", () => {
    expect(delta(10, null)).toBeNull();
    expect(delta(10, 0)).toBeNull();
    expect(delta(0, 0)).toBe(0);
    expect(delta(15, 10)).toBe(50);
  });

  it("never divides by zero", () => {
    expect(pct(5, 0)).toBe(0);
    expect(pct(1, 4)).toBe(25);
  });

  it("keeps funnel steps ordered from leads to meetings", () => {
    const steps = buildFunnel({
      leads: 100,
      sent: 80,
      delivered: 75,
      replies: 10,
      positive: 4,
      meetings: 2,
    });
    expect(steps.map((s) => s.key)).toEqual([
      "leads",
      "sent",
      "delivered",
      "replies",
      "positive",
      "meetings",
    ]);
    expect(steps[0]?.value).toBe(100);
  });

  it("ranks campaigns by reply performance", () => {
    const ranked = rankCampaigns([
      campaign({ id: "low", sentLifetime: 1000, replies: 10 }),
      campaign({ id: "high", sentLifetime: 500, replies: 40 }),
      campaign({ id: "empty" }),
    ]);
    expect(ranked[0]?.id).toBe("high");
    expect(ranked.some((r) => r.id === "empty")).toBe(false);
  });
});
