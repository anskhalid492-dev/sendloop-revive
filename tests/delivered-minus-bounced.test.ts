import { describe, expect, it } from "vitest";
import {
  collapseMessageUnits,
  computeAccountTotals,
  computeCampaignStats,
  computeTimeseries,
} from "@/lib/campaign-stats";
import { computeUnitTotals } from "@/lib/analytics-sequence";
import { deliveredCount } from "@/lib/engagement-rates";

const from = new Date("2026-09-18T00:00:00.000Z");
const to = new Date("2026-09-19T00:00:00.000Z");

/**
 * Three people were sent to today, one of them bounced. The bounce only exists
 * on a cancelled follow-up that has no `sent_at`, which used to leave
 * "3 sent / 3 delivered / 1 bounced" on the dashboard and analytics.
 */
const messages = [
  ...[1, 2, 3].map((i) => ({
    id: `m${i}`,
    recipient_id: `r${i}`,
    sending_account_id: "acc1",
    step_order: 1,
    status: "sent",
    sent_at: "2026-09-18T10:00:00.000Z",
    updated_at: "2026-09-18T10:00:00.000Z",
  })),
  {
    id: "m3b",
    recipient_id: "r3",
    sending_account_id: "acc1",
    step_order: 2,
    status: "cancelled",
    cancelled_reason: "recipient_bounced",
    updated_at: "2026-09-18T12:00:00.000Z",
  },
];

describe("delivered never exceeds accepted sends minus bounced people", () => {
  const units = Array.from(collapseMessageUnits(messages).values());

  it("campaign totals", () => {
    const stats = computeCampaignStats({ messages, leads: 3, from, to });
    expect(stats.sent).toBe(3);
    expect(stats.bounced).toBe(0);
    expect(stats.delivered).toBe(0);
  });

  it("per-mailbox totals", () => {
    const [row] = computeAccountTotals(units, { from, to });
    expect(row!.sent).toBe(3);
    expect(row!.bounced).toBe(0);
    expect(row!.delivered).toBe(3);
  });

  it("timeseries buckets", () => {
    const point = computeTimeseries(units, { bucket: "day", from, to })[0]!;
    expect(point.sent).toBe(3);
    expect(point.bounced).toBe(0);
    expect(point.delivered).toBe(0);
  });

  it("analytics unit totals", () => {
    const totals = computeUnitTotals(units, { from, to });
    expect(totals.delivered).toBe(0);
  });

  it("shared helper ignores an inflated provider confirmation", () => {
    expect(deliveredCount({ sent: 378, bounced: 3, confirmedDelivered: 378 })).toBe(375);
  });
});
