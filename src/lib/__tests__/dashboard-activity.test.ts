import { describe, expect, it } from "vitest";

import { buildOutboundActivity } from "@/lib/dashboard-activity";
import { aggregateDeliveryStates, messageDeliveryState } from "@/lib/campaign-delivery-state";

const CAMPAIGNS = new Map([["c1", "Q3 Restaurants"]]);
const now = () => new Date().toISOString();
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

describe("outbound recent activity", () => {
  it("shows nothing when no message was ever accepted for sending", () => {
    const rows = buildOutboundActivity(
      [
        { id: "1", campaign_id: "c1", status: "scheduled", scheduled_at: now() },
        { id: "2", campaign_id: "c1", status: "processing", scheduled_at: now() },
        // Anomalous row: a delivery timestamp with no accepted send.
        { id: "3", campaign_id: "c1", status: "queued", delivered_at: now() },
        { id: "4", campaign_id: "c1", status: "cancelled", scheduled_at: now() },
      ],
      CAMPAIGNS,
    );
    expect(rows).toEqual([]);
  });

  it("shows delivered rows for real accepted campaign sends", () => {
    const rows = buildOutboundActivity(
      [{ id: "9", campaign_id: "c1", status: "sent", sent_at: now(), delivered_at: now() }],
      CAMPAIGNS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Email delivered");
    expect(rows[0]!.detail).toBe("Q3 Restaurants");
    expect(rows[0]!.kind).toBe("outbound");
  });

  it("labels bounced, failed and cancelled correctly instead of delivered", () => {
    const rows = buildOutboundActivity(
      [
        { id: "b", campaign_id: "c1", status: "sent", sent_at: now(), bounced_at: now() },
        { id: "f", campaign_id: "c1", status: "failed", failed_at: now() },
        { id: "x", campaign_id: "c1", status: "cancelled", scheduled_at: now() },
      ],
      CAMPAIGNS,
    );
    expect(rows.map((r) => r.title).sort()).toEqual(["Email bounced", "Send failed"]);
  });

  it("stamps rows with the real event time, so old events never read as 'just now'", () => {
    const rows = buildOutboundActivity(
      [
        {
          id: "old",
          campaign_id: "c1",
          status: "sent",
          scheduled_at: now(),
          sent_at: ago(9),
          delivered_at: ago(9),
        },
      ],
      CAMPAIGNS,
    );
    expect(Date.now() - new Date(rows[0]!.at).getTime()).toBeGreaterThan(8 * 86_400_000);
  });

  it("never sources warmup rows", () => {
    const rows = buildOutboundActivity(
      [{ id: "w", type: "delivered", occurred_at: now(), detail: "warmup email" }],
      CAMPAIGNS,
    );
    expect(rows).toEqual([]);
  });
});

describe("per-lead delivery state agrees with the sent KPI", () => {
  const messages = [
    { recipient_id: "r1", lead_id: "l1", status: "queued", delivered_at: now() },
    { recipient_id: "r2", lead_id: "l2", status: "sent", sent_at: now(), delivered_at: now() },
  ];

  it("does not mark unsent messages as delivered", () => {
    expect(messageDeliveryState(messages[0]!)).toBe("queued");
    expect(messageDeliveryState(messages[1]!)).toBe("delivered");
  });

  it("keeps the feed count equal to the KPI count of accepted sends", () => {
    const kpiSent = messages.filter((m) => m.sent_at).length;
    const live = aggregateDeliveryStates(messages);
    const contacted = [...live.values()].filter((v) =>
      ["sent", "delivered", "opened", "clicked", "replied"].includes(v.state),
    );
    // Both keys (recipient + lead) index the same message.
    expect(new Set(contacted.map((c) => c.state)).size).toBe(1);
    expect(kpiSent).toBe(1);
    expect(buildOutboundActivity(messages, CAMPAIGNS)).toHaveLength(kpiSent);
  });
});
