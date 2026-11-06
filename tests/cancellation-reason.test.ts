import { describe, expect, it } from "vitest";

import { countOutcomeRecipients } from "../src/lib/cancellation-reason";
import { computeCampaignStats } from "../src/lib/campaign-stats";
import { reachable } from "../src/lib/engagement-rates";

const sentAt = "2026-09-17T10:00:00.000Z";
const stoppedAt = "2026-09-17T10:05:00.000Z";

/** One recipient: step 1 sent, steps 2-3 cancelled for the given reason. */
function recipient(id: string, reason: string | null) {
  return [
    {
      id: `${id}-s1`,
      campaign_id: "c1",
      recipient_id: id,
      lead_id: id,
      step_order: 1,
      status: "sent",
      sent_at: sentAt,
      ...(reason === "recipient_bounced" ? { bounced_at: stoppedAt } : {}),
      updated_at: sentAt,
    },
    {
      id: `${id}-s2`,
      campaign_id: "c1",
      recipient_id: id,
      lead_id: id,
      step_order: 2,
      status: "cancelled",
      cancelled_reason: reason,
      updated_at: stoppedAt,
    },
    {
      id: `${id}-s3`,
      campaign_id: "c1",
      recipient_id: id,
      lead_id: id,
      step_order: 3,
      status: "cancelled",
      cancelled_reason: reason,
      updated_at: stoppedAt,
    },
  ];
}

describe("cancelled recipients are still counted as bounced / unsubscribed", () => {
  const messages = [
    ...recipient("b1", "recipient_bounced"),
    ...recipient("b2", "recipient_bounced"),
    ...recipient("b3", "recipient_bounced"),
    ...recipient("u1", "recipient_unsubscribed"),
    ...recipient("u2", "recipient_unsubscribed"),
    ...recipient("u3", "recipient_unsubscribed"),
  ];
  const stats = computeCampaignStats({ campaignId: "c1", leads: 6, messages });

  it("counts each bounced and unsubscribed person exactly once", () => {
    expect(stats.sent).toBe(6);
    expect(stats.bounced).toBe(3);
    expect(stats.unsubscribed).toBe(3);
  });

  it("keeps the cancelled total intact", () => {
    // Two cancelled steps for each of the six recipients.
    expect(stats.cancelled).toBe(12);
  });

  it("excludes bounced people from the engagement-rate base", () => {
    expect(reachable({ sent: stats.sent, bounced: stats.bounced })).toBe(3);
  });

  it("does not count a plain sequence stop or manual cancel", () => {
    const plain = computeCampaignStats({
      campaignId: "c1",
      leads: 2,
      messages: [...recipient("p1", "sequence_stopped"), ...recipient("p2", "manual")],
    });
    expect(plain.bounced).toBe(0);
    expect(plain.unsubscribed).toBe(0);
    expect(plain.cancelled).toBe(4);
  });

  it("uses the same rule in the shared row-level helper", () => {
    expect(
      countOutcomeRecipients([
        { recipient_id: "b1", cancelled_reason: "recipient_bounced" },
        { recipient_id: "b1", bounced_at: sentAt },
        { recipient_id: "u1", cancelled_reason: "recipient_unsubscribed" },
        { recipient_id: "s1", cancelled_reason: "sequence_stopped" },
      ]),
    ).toEqual({ bounced: 1, unsubscribed: 1, complained: 0 });
  });
});
