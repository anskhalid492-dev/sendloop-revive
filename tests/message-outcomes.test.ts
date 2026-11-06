import { describe, expect, it } from "vitest";
import { countMessageOutcomes, messageOutcome } from "@/lib/message-outcomes";
import { collapseMessageUnits, computeCampaignStats, computeAccountTotals, computeTimeseries } from "@/lib/campaign-stats";
import { summarizeEngagement } from "@/lib/analytics-overview";
import { computeUnitTotals } from "@/lib/analytics-sequence";

const at = "2026-11-06T10:00:00Z";
const from = new Date("2026-11-06T00:00:00Z");
const to = new Date("2026-11-07T00:00:00Z");
const held = { status: "failed", attempts: 999, last_error: "send_outcome_unknown_after_interrupt", updated_at: at };
const rows = [
  ...Array.from({ length: 694 }, (_, i) => ({ id: `throwaway-reconcile-delivered-${i}`, recipient_id: `r-${i}`, sending_account_id: "throwaway-account", status: "sent", sent_at: at, delivered_at: at })),
  ...Array.from({ length: 11 }, (_, i) => ({ id: `throwaway-reconcile-bounced-${i}`, recipient_id: `b-${i}`, sending_account_id: "throwaway-account", status: "failed", sent_at: at, bounced_at: at, delivered_at: at, failed_at: at })),
  ...Array.from({ length: 116 }, (_, i) => ({ id: `throwaway-reconcile-held-${i}`, recipient_id: `h-${i}`, sending_account_id: "throwaway-account", ...held })),
];

describe("distinct campaign outcome reconciliation", () => {
  it("694 delivered plus 11 bounced are 705 accepted messages, separate from 116 held", () => {
    const result = countMessageOutcomes(rows);
    expect(result).toMatchObject({ total: 821, attempted: 821, providerAccepted: 705, delivered: 694, bounced: 11, failed: 0, held: 116 });
    expect(result.queued + result.sending + result.accepted + result.delivered + result.bounced + result.failed + result.held + result.cancelled).toBe(821);
  });
  it("repeated rows never inflate status counts", () => {
    expect(countMessageOutcomes([...rows, ...rows])).toEqual(countMessageOutcomes(rows));
  });
  it("held never becomes failed, even with a legacy failed timestamp", () => {
    expect(messageOutcome({ id: "throwaway-held", ...held, failed_at: at })).toBe("held");
  });
  it("latest status and immutable evidence agree across repeated snapshots", () => {
    const snapshots = [{ id: "throwaway-snapshot", status: "sent", sent_at: at, delivered_at: at, updated_at: "2026-11-06T10:00:00Z" }, { id: "throwaway-snapshot", status: "failed", ...held, updated_at: "2026-11-06T11:00:00Z" }];
    expect(countMessageOutcomes(snapshots)).toMatchObject({ total: 1, delivered: 1, failed: 0, held: 0, providerAccepted: 1 });
    expect(computeCampaignStats({ campaignId: "throwaway", leads: 1, messages: snapshots, from, to })).toMatchObject({ sent: 1, delivered: 1, held: 0 });
  });
  it("accepted and not bounced counts as delivered", () => {
    expect(messageOutcome({ id: "throwaway-sent", status: "sent", sent_at: at })).toBe("delivered");
  });
  it("a confirmed bounce overrides stale delivered and held markers", () => {
    expect(messageOutcome({ id: "throwaway-bounce", ...held, bounced_at: at, delivered_at: at })).toBe("bounced");
  });
  it("all reporting helpers agree on observed delivery and exclude held failures", () => {
    const stats = computeCampaignStats({ campaignId: "throwaway-campaign", leads: 821, messages: rows, from, to });
    const units = [...collapseMessageUnits(rows).values()];
    const overview = summarizeEngagement(units, from, to);
    const sequence = computeUnitTotals(units, { from, to });
    const account = computeAccountTotals(units, { from, to })[0];
    const trend = computeTimeseries(units, { from, to, bucket: "day" })[0];
    for (const result of [stats, overview, sequence, account, trend]) expect(result).toMatchObject({ sent: 705, delivered: 694, bounced: 11 });
    for (const result of [stats, overview, sequence, account]) expect(result).toMatchObject({ failed: 0, held: 116 });
  });
  it("retains definitive failure alongside separate accepted and queued messages", () => {
    expect(countMessageOutcomes([{ id: "throwaway-failed", status: "failed", failed_at: at }, { id: "throwaway-pending", status: "scheduled" }, { id: "throwaway-processing", status: "processing" }, { id: "throwaway-cancelled", status: "cancelled" }])).toMatchObject({ failed: 1, queued: 1, sending: 1, cancelled: 1, attempted: 2 });
  });
});