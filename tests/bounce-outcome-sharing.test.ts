import { describe, expect, it } from "vitest";
import {
  collapseMessageUnits,
  computeAccountTotals,
  computeTimeseries,
  unitBounceAt,
} from "@/lib/campaign-stats";
import { computeSequenceStats } from "@/lib/analytics-sequence";

const from = new Date("2026-09-01T00:00:00.000Z");
const to = new Date("2026-10-01T00:00:00.000Z");

// A mid-sequence bounce: the sent step-1 mail has no bounce signal of its own,
// the remaining queued mail was cancelled because the recipient bounced.
const messages = [
  {
    id: "m1",
    recipient_id: "r1",
    sending_account_id: "acc1",
    step_order: 1,
    status: "sent",
    sent_at: "2026-09-10T10:00:00.000Z",
    updated_at: "2026-09-10T11:00:00.000Z",
  },
  {
    id: "m2",
    recipient_id: "r1",
    sending_account_id: "acc1",
    step_order: 2,
    status: "cancelled",
    cancelled_reason: "recipient_bounced",
    updated_at: "2026-09-10T11:00:00.000Z",
  },
];

describe("bounce outcome is shared across every derived surface", () => {
  it("resolves a bounce time from the cancellation reason", () => {
    const units = Array.from(collapseMessageUnits(messages).values());
    const cancelledUnit = units.find((u) => u.step === 2)!;
    expect(unitBounceAt(cancelledUnit)).toBe("2026-09-10T11:00:00.000Z");
  });

  it("counts the bounce in mailbox totals and excludes it from delivered", () => {
    const units = Array.from(collapseMessageUnits(messages).values());
    const totals = computeAccountTotals(units, { from, to })[0]!;
    expect(totals.sent).toBe(1);
    expect(totals.bounced).toBe(0);
    expect(totals.delivered).toBe(1);
  });

  it("counts the bounce in the timeseries", () => {
    const units = Array.from(collapseMessageUnits(messages).values());
    const series = computeTimeseries(units, { bucket: "day", from, to });
    expect(series.reduce((s, p) => s + p.bounced, 0)).toBe(0);
  });

  it("counts the bounce in the sequence table", () => {
    const units = Array.from(collapseMessageUnits(messages).values());
    const steps = computeSequenceStats(units, { from, to });
    expect(steps.reduce((s, r) => s + r.bounced, 0)).toBe(0);
  });
});
