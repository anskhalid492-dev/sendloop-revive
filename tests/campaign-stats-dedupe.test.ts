import { describe, expect, it } from "vitest";
import { collapseMessageUnits, computeCampaignStats } from "@/lib/campaign-stats";
import { nextEligibleSendAt } from "@/lib/campaign-schedule";

const base = {
  campaign_id: "c1",
  recipient_id: "r1",
  lead_id: "l1",
  step_order: 1,
  delivery_status: null as string | null,
  updated_at: "2026-09-01T00:00:00Z",
};

describe("campaign stats de-duplication", () => {
  it("accounts for distinct retry records without hiding the earlier failure", () => {
    const stats = computeCampaignStats({
      campaignId: "c1",
      leads: 1,
      messages: [
        { ...base, id: "m1", status: "failed", sent_at: null },
        { ...base, id: "m2", status: "sent", sent_at: "2026-09-01T10:00:00Z" },
      ] as never,
    });
    expect(stats.sent).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.contacted).toBe(1);
  });

  it("never counts duplicate webhook rows twice", () => {
    const stats = computeCampaignStats({
      campaignId: "c1",
      leads: 1,
      messages: [
        { ...base, id: "m1", status: "sent", sent_at: "2026-09-01T10:00:00Z", opened_at: "2026-09-01T11:00:00Z" },
        { ...base, id: "m1", status: "sent", sent_at: "2026-09-01T10:00:00Z", opened_at: "2026-09-01T11:05:00Z" },
      ] as never,
    });
    expect(stats.sent).toBe(1);
    expect(stats.opened).toBe(1);
  });

  it("keeps follow-up steps separate", () => {
    const units = collapseMessageUnits([
      { ...base, id: "m1", status: "sent", sent_at: "2026-09-01T10:00:00Z" },
      { ...base, id: "m2", step_order: 2, status: "scheduled", sent_at: null },
    ] as never);
    expect(units.size).toBe(2);
  });
});

describe("nextEligibleSendAt", () => {
  const window = {
    timezone: "Asia/Dubai",
    startHour: 20,
    endHour: 22,
    sendDays: [0, 1, 2, 3, 4, 5, 6],
  } as never;

  it("returns null when nothing is pending", () => {
    expect(
      nextEligibleSendAt({
        now: new Date("2026-09-01T10:00:00Z"),
        window,
        status: "active",
        earliestPendingAt: null,
        pendingCount: 0,
      }),
    ).toBeNull();
  });

  it("never returns a stale historical time", () => {
    const now = new Date("2026-09-01T10:00:00Z");
    const next = nextEligibleSendAt({
      now,
      window,
      status: "active",
      earliestPendingAt: new Date("2026-08-26T10:30:00Z"),
      pendingCount: 12,
    });
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });
});
