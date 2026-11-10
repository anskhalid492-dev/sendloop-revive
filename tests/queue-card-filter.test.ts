import { describe, expect, it } from "vitest";
import { countMessageOutcomes } from "@/lib/message-outcomes";
import { selectQueueCardIds, type QueueCardKey, type QueueInventoryRow } from "@/lib/queue-card-filter";

const sentAt = "2026-11-01T10:00:00Z";
const inventory: QueueInventoryRow[] = [
  { id: "a", status: "sent", sent_at: sentAt, scheduled_at: "2026-11-01T09:00:00Z", to_email: "a@x.com" },
  { id: "b", status: "sent", sent_at: sentAt, scheduled_at: "2026-11-01T08:00:00Z", to_email: "b@x.com" },
  { id: "c", status: "sent", sent_at: sentAt, bounced_at: sentAt, to_email: "c@x.com" },
  { id: "d", status: "failed", attempts: 999, last_error: "send_outcome_unknown_after_interrupt", to_email: "d@x.com" },
  { id: "e", status: "cancelled", to_email: "e@x.com", delivery_status: "bounced" },
  { id: "f", status: "pending", to_email: "f@x.com" },
  { id: "g", status: "scheduled", scheduled_at: "2026-11-02T00:00:00Z", to_email: "g@x.com" },
  { id: "h", status: "failed", failed_at: sentAt, to_email: "h@x.com" },
];

describe("queue outcome cards", () => {
  it("Delivered card lists every accepted, non-bounced email even without a receipt", () => {
    expect(selectQueueCardIds(inventory, "delivered", { limit: 200 })).toEqual(["b", "a"]);
  });

  it("Accepted card never lists emails counted as Delivered", () => {
    expect(selectQueueCardIds(inventory, "sent", { limit: 200 })).toEqual([]);
  });

  it("cancelled never-sent follow-ups are not in the Bounced list", () => {
    expect(selectQueueCardIds(inventory, "bounced", { limit: 200 })).toEqual(["c"]);
    expect(selectQueueCardIds(inventory, "cancelled", { limit: 200 })).toEqual(["e"]);
  });

  it("held emails are listed under Held, never Failed", () => {
    expect(selectQueueCardIds(inventory, "held", { limit: 200 })).toEqual(["d"]);
    expect(selectQueueCardIds(inventory, "failed", { limit: 200 })).toEqual(["h"]);
  });

  it("every card's list length equals its count", () => {
    const c = countMessageOutcomes(inventory);
    const expected: Record<QueueCardKey, number> = {
      pending: 1, scheduled: 1, processing: c.sending, sent: c.accepted, delivered: c.delivered,
      bounced: c.bounced, failed: c.failed, held: c.held, cancelled: c.cancelled,
    };
    for (const [card, count] of Object.entries(expected)) {
      expect(selectQueueCardIds(inventory, card as QueueCardKey, { limit: 200 })).toHaveLength(count);
    }
  });

  it("search narrows the card list by recipient email", () => {
    expect(selectQueueCardIds(inventory, "delivered", { search: "A@X", limit: 200 })).toEqual(["a"]);
  });
});
