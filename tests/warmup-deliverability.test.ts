import { describe, expect, it } from "vitest";
import { computeDeliverability, formatRateValue, groupDeliverability, periodStart, type DeliverabilityJob } from "@/lib/warmup-deliverability";

const job = (id: string, o: Partial<DeliverabilityJob> = {}): DeliverabilityJob => ({
  id, sending_account_id: "a", role: "initial", status: "sent", delivery_state: "sent", placement: null, processed_at: "2026-10-27T01:00:00Z", ...o,
});
const many = (n: number, prefix: string, o: Partial<DeliverabilityJob>) => Array.from({ length: n }, (_, i) => job(`${prefix}${i}`, o));

describe("warmup deliverability", () => {
  it("missing data never shows 100%", () => {
    const m = computeDeliverability([]);
    expect(m.inboxRate.value).toBeNull();
    expect(formatRateValue(m.inboxRate)).toBe("Not enough data");
    expect(formatRateValue(m.bounceRate)).toBe("Not enough data");
  });

  it("SMTP-accepted or arrived-unknown sends are Unverified, not inbox", () => {
    const m = computeDeliverability([...many(15, "s", {}), ...many(5, "r", { placement: "received_unknown", delivery_state: "delivered" })]);
    expect(m.sent).toBe(20);
    expect(m.inbox).toBe(0);
    expect(m.measured).toBe(0);
    expect(m.unverified).toBe(20);
    expect(m.inboxRate.value).toBeNull();
  });

  it("inbox and spam rates use measured emails only", () => {
    const m = computeDeliverability([...many(18, "i", { placement: "inbox" }), ...many(2, "p", { placement: "spam" }), ...many(30, "u", {})]);
    expect(m.inboxRate).toEqual({ value: 90, numerator: 18, denominator: 20 });
    expect(m.spamRate.value).toBe(10);
  });

  it("duplicate job rows are counted once", () => {
    const rows = many(10, "i", { placement: "inbox" });
    const m = computeDeliverability([...rows, ...rows]);
    expect(m.sent).toBe(10);
    expect(m.inbox).toBe(10);
  });

  it("confirmed bounces count over all attempted sends", () => {
    const m = computeDeliverability([...many(3, "b", { delivery_state: "bounced" }), job("nd", { placement: "not_delivered" }), ...many(16, "s", {})]);
    expect(m.bounced).toBe(4);
    expect(m.bounceRate).toEqual({ value: 20, numerator: 4, denominator: 20 });
  });

  it("reply rate uses delivered warmup emails and sent peer replies", () => {
    const originals = many(10, "o", { placement: "inbox", delivery_state: "delivered" });
    const replies = [job("r1", { role: "reply", sending_account_id: "peer", idempotency_key: "reply:o0" }), job("r2", { role: "reply", sending_account_id: "peer", status: "queued", delivery_state: "queued", idempotency_key: "reply:o1" })];
    const m = groupDeliverability([...originals, ...replies]).get("a")!;
    expect(m.replyRate).toEqual({ value: 10, numerator: 1, denominator: 10 });
    expect(m.sent).toBe(10);
  });

  it("queued jobs are not counted as sent", () => {
    expect(computeDeliverability([job("q", { status: "queued", delivery_state: "queued" })]).sent).toBe(0);
  });

  it("windows start at UTC midnight", () => {
    const now = new Date("2026-10-27T09:20:00Z");
    expect(periodStart("today", now)).toBe("2026-10-27T00:00:00.000Z");
    expect(periodStart("last7", now)).toBe("2026-10-21T00:00:00.000Z");
    expect(periodStart("all", now)).toBeNull();
  });
});
