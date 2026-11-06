import { describe, expect, it } from "vitest";
import { computeUnitTotals, computeSequenceStats } from "@/lib/analytics-sequence";
import type { Unit } from "@/lib/campaign-stats";

const WINDOW = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z") };
const AT = "2026-09-10T10:00:00Z";

function unit(partial: Partial<Unit> & { leadKey: string; step: number }): Unit {
  return {
    status: "sent",
    accountId: null,
    variantId: null,
    campaignId: null,
    deliveryStatus: "sent",
    sentAt: AT,
    signals: {
      delivered_at: null,
      opened_at: null,
      clicked_at: null,
      replied_at: null,
      bounced_at: null,
      unsubscribed_at: null,
      failed_at: null,
    },
    cancelledReason: null,
    cancelled: false,
    pending: false,
    processing: false,
    updatedAt: AT,
    ...partial,
  } as Unit;
}

describe("analytics unit totals count people once", () => {
  it("counts one bounce for a recipient whose follow-ups were all stopped", () => {
    const units = [
      unit({ leadKey: "a", step: 1, signals: { ...unit({ leadKey: "a", step: 1 }).signals, bounced_at: AT } }),
      unit({ leadKey: "a", step: 2, sentAt: null, cancelled: true, cancelledReason: "recipient_bounced" }),
      unit({ leadKey: "a", step: 3, sentAt: null, cancelled: true, cancelledReason: "recipient_bounced" }),
    ];
    const totals = computeUnitTotals(units, WINDOW);
    expect(totals.bounced).toBe(1);
    expect(totals.sent).toBe(1);
    expect(totals.delivered).toBe(0);
  });

  it("counts one unsubscribe per person", () => {
    const units = [
      unit({ leadKey: "b", step: 1, cancelled: true, cancelledReason: "recipient_unsubscribed" }),
      unit({ leadKey: "b", step: 2, sentAt: null, cancelled: true, cancelledReason: "recipient_unsubscribed" }),
    ];
    expect(computeUnitTotals(units, WINDOW).unsubscribed).toBe(1);
  });

  it("keeps per-person de-duplication independent for each sequence step row", () => {
    const units = [
      unit({ leadKey: "c", step: 1, cancelledReason: "recipient_bounced" }),
      unit({ leadKey: "c", step: 1, cancelledReason: "recipient_bounced" }),
      unit({ leadKey: "c", step: 2, cancelledReason: "recipient_bounced" }),
    ];
    const rows = computeSequenceStats(units, WINDOW);
    expect(rows.map((r) => r.bounced)).toEqual([0, 0]);
  });
});
