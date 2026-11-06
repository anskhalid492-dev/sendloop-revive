import { describe, expect, it } from "vitest";
import {
  countMessageOutcomes,
  isRetryableMessage,
  leadOutcomeByKey,
  messageOutcome,
} from "@/lib/message-outcomes";
import { deliveredCount } from "@/lib/engagement-rates";

const HELD_ERROR = "send_outcome_unknown_after_interrupt";

describe("exclusive message outcomes", () => {
  it("1,000 accepted with 10 bounces shows 990 delivered", () => {
    expect(messageOutcome({ id: "a", status: "sent", sent_at: "2026-11-01T00:00:00Z" })).toBe("delivered");
    expect(
      messageOutcome({ id: "b", status: "sent", sent_at: "2026-11-01T00:00:00Z", delivered_at: "2026-11-01T00:01:00Z" }),
    ).toBe("delivered");
    expect(deliveredCount({ sent: 1000, bounced: 10, confirmedDelivered: 0 })).toBe(990);
    expect(deliveredCount({ sent: 705, bounced: 10 })).toBe(695);
  });

  it("keeps held-for-review messages out of Failed and never retries them", () => {
    const held = { id: "h", status: "failed", attempts: 999, last_error: HELD_ERROR };
    expect(messageOutcome(held)).toBe("held");
    expect(isRetryableMessage(held)).toBe(false);
    const counts = countMessageOutcomes([held]);
    expect(counts.held).toBe(1);
    expect(counts.failed).toBe(0);
    expect(counts.retryable).toBe(0);
  });

  it("never counts a cancelled, never-sent follow-up as a bounce", () => {
    const cancelled = { id: "c", status: "cancelled", cancelled_reason: "recipient_bounced", delivery_status: "bounced" };
    expect(messageOutcome(cancelled)).toBe("cancelled");
    expect(countMessageOutcomes([cancelled]).bounced).toBe(0);
  });

  it("puts each distinct message ID in exactly one outcome", () => {
    const rows = [
      { id: "1", status: "sent", sent_at: "2026-11-01T00:00:00Z", updated_at: "1" },
      { id: "1", status: "sent", sent_at: "2026-11-01T00:00:00Z", bounced_at: "2026-11-01T01:00:00Z", updated_at: "2" },
      { id: "2", status: "failed", attempts: 999, last_error: HELD_ERROR },
      { id: "3", status: "cancelled" },
      { id: "4", status: "scheduled" },
      { id: "5", status: "sent", sent_at: "2026-11-01T00:00:00Z" },
    ];
    const c = countMessageOutcomes(rows);
    expect(c.total).toBe(5);
    expect(c.queued + c.sending + c.accepted + c.delivered + c.bounced + c.failed + c.held + c.cancelled).toBe(5);
    expect(c).toMatchObject({ bounced: 1, held: 1, cancelled: 1, queued: 1, accepted: 0, delivered: 1, failed: 0 });
    expect(c.providerAccepted).toBe(2);
  });

  it("reconciles the audited Agencies - Free Trials shape without inventing numbers", () => {
    const rows = [
      ...Array.from({ length: 664 }, (_, i) => ({ id: `q${i}`, status: "scheduled" })),
      ...Array.from({ length: 695 }, (_, i) => ({ id: `a${i}`, status: "sent", sent_at: "2026-11-05T00:00:00Z" })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, status: "sent", sent_at: "2026-11-05T00:00:00Z", bounced_at: "2026-11-05T01:00:00Z" })),
      ...Array.from({ length: 116 }, (_, i) => ({ id: `h${i}`, status: "failed", attempts: 999, last_error: HELD_ERROR })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, status: "cancelled" })),
    ];
    const c = countMessageOutcomes(rows);
    expect(c).toMatchObject({ total: 1488, queued: 664, accepted: 0, bounced: 10, held: 116, cancelled: 3, failed: 0, delivered: 695 });
    expect(c.providerAccepted).toBe(705);
    expect(c.retryable).toBe(0);
  });

  it("gives each lead one outcome, preferring the most decisive message", () => {
    const map = leadOutcomeByKey([
      { id: "m1", recipient_id: "r1", status: "sent", sent_at: "x", bounced_at: "y" },
      { id: "m2", recipient_id: "r1", status: "cancelled", cancelled_reason: "recipient_bounced" },
      { id: "m3", recipient_id: "r2", status: "sent", sent_at: "x" },
    ]);
    expect(map.get("r1")).toBe("bounced");
    expect(map.get("r2")).toBe("delivered");
  });
});
