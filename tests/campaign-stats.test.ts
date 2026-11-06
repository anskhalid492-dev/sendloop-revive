import { describe, expect, it } from "vitest";

import {
  computeAccountTotals,
  computeCampaignStats,
  computeTimeseries,
  collapseMessageUnits,
  EMPTY_CAMPAIGN_STATS,
  rate,
  toCampaignStats,
} from "../src/lib/campaign-stats";

describe("campaign stats source", () => {
  it("maps every metric from the shared database row", () => {
    const stats = toCampaignStats({
      campaign_id: "c1",
      campaign_name: "Packaging Companies",
      status: "active",
      leads: 1600,
      queued: 98,
      sending: 2,
      sent: 1502,
      delivered: 1400,
      opened: 500,
      clicked: 120,
      replied: 42,
      positive_replied: 11,
      bounced: 60,
      unsubscribed: 7,
      complained: 1,
      failed: 42,
      remaining: 98,
    });

    expect(stats.sent).toBe(1502);
    expect(stats.delivered).toBe(1400);
    expect(stats.bounced).toBe(60);
    expect(stats.failed).toBe(42);
    // Terminal outcomes are exclusive, so delivered + bounced + failed can
    // never exceed the number of sends.
    expect(stats.delivered + stats.bounced + stats.failed).toBeLessThanOrEqual(stats.sent);
  });

  it("treats missing rows as zero rather than guessing", () => {
    const stats = EMPTY_CAMPAIGN_STATS("c2");
    expect(stats.sent).toBe(0);
    expect(stats.remaining).toBe(0);
    expect(toCampaignStats({}).sent).toBe(0);
  });

  it("uses one shared rate helper so percentages match everywhere", () => {
    expect(rate(42, 1502)).toBe(2.8);
    expect(rate(1, 0)).toBeNull();
  });

  it("requires a delivery receipt instead of inferring SMTP delivery", () => {
    const messages = [
      {
        id: "m1",
        campaign_id: "c1",
        sending_account_id: "a1",
        recipient_id: "r1",
        step_order: 1,
        status: "sent",
        sent_at: "2026-09-17T10:00:00.000Z",
      },
      {
        id: "m2",
        campaign_id: "c1",
        sending_account_id: "a1",
        recipient_id: "r2",
        step_order: 1,
        status: "sent",
        sent_at: "2026-09-17T11:00:00.000Z",
        bounced_at: "2026-09-17T11:05:00.000Z",
      },
    ];
    const from = new Date("2026-09-17T00:00:00.000Z");
    const to = new Date("2026-09-18T00:00:00.000Z");
    const stats = computeCampaignStats({ campaignId: "c1", leads: 2, messages, from, to });
    const units = Array.from(collapseMessageUnits(messages).values());
    const series = computeTimeseries(units, { bucket: "day", from, to });
    const accounts = computeAccountTotals(units, { from, to });

    expect(stats).toMatchObject({ sent: 2, delivered: 0, bounced: 1 });
    expect(stats.byStep[0]).toMatchObject({ sent: 2, delivered: 0 });
    expect(series[0]).toMatchObject({ sent: 2, delivered: 0, bounced: 1 });
    expect(accounts[0]).toMatchObject({ sent: 2, delivered: 1, bounced: 1 });
  });
});
