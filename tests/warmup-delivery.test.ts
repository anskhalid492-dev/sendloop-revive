import { describe, expect, it } from "vitest";

import {
  advancesWarmupDelivery,
  isWarmupArrivalProof,
  normalizeWarmupDeliveryState,
  warmupDeliveryCounts,
  warmupDeliveryLabel,
} from "@/lib/warmup-delivery";

describe("warmup delivery state normalization", () => {
  it("never treats a provider acceptance as an arrival", () => {
    expect(normalizeWarmupDeliveryState("accepted")).toBe("sent");
    expect(normalizeWarmupDeliveryState("sent")).toBe("sent");
    expect(isWarmupArrivalProof("accepted")).toBe(false);
    expect(isWarmupArrivalProof("sent")).toBe(false);
  });

  it("normalizes provider-specific event names from any provider", () => {
    // Resend / Postmark / SendGrid / SES / Mailgun wording all collapse to the
    // same internal state.
    for (const kind of ["email.delivered", "Delivery", "delivered", "inbox_placement"]) {
      expect(normalizeWarmupDeliveryState(kind)).toBe("delivered");
    }
    for (const kind of ["email.bounced", "Bounce", "hard_bounce"]) {
      expect(normalizeWarmupDeliveryState(kind)).toBe("bounced");
    }
    expect(normalizeWarmupDeliveryState("dropped")).toBe(null);
    expect(normalizeWarmupDeliveryState("open")).toBe(null);
  });

  it("counts a reply as proof of arrival", () => {
    expect(isWarmupArrivalProof("replied")).toBe(true);
  });

  it("only moves the state forward", () => {
    expect(advancesWarmupDelivery("sent", "delivered")).toBe(true);
    expect(advancesWarmupDelivery("delivered", "sent")).toBe(false);
    expect(advancesWarmupDelivery("delivered", "bounced")).toBe(true);
    expect(advancesWarmupDelivery("bounced", "delivered")).toBe(false);
  });
});

describe("warmup delivered counts", () => {
  it("reports 1 delivered for 1 send with a confirmed arrival", () => {
    const counts = warmupDeliveryCounts({ sent: 1, delivered: 1 });
    expect(counts.delivered).toBe(1);
    expect(counts.unconfirmed).toBe(0);
    expect(counts.rate).toBe(100);
  });

  it("reports 4 delivered for 4 sends with 4 confirmed arrivals", () => {
    expect(warmupDeliveryCounts({ sent: 4, delivered: 4 }).delivered).toBe(4);
  });

  it("reports 3 delivered for 4 sends with 3 confirmed arrivals", () => {
    const counts = warmupDeliveryCounts({ sent: 4, delivered: 3 });
    expect(counts.delivered).toBe(3);
    expect(counts.unconfirmed).toBe(1);
    expect(warmupDeliveryLabel(counts)).toBe("3 delivered · 1 unconfirmed");
  });

  it("never invents delivery for accepted-but-unobserved sends", () => {
    const counts = warmupDeliveryCounts({ sent: 4, delivered: 0 });
    expect(counts.delivered).toBe(0);
    expect(counts.unconfirmed).toBe(4);
    expect(warmupDeliveryLabel(counts)).toBe("4 unconfirmed");
  });

  it("excludes bounced and failed sends from delivered", () => {
    const counts = warmupDeliveryCounts({ sent: 4, delivered: 2, bounced: 1, failed: 1 });
    expect(counts.delivered).toBe(2);
    expect(counts.negative).toBe(2);
    expect(counts.unconfirmed).toBe(0);
  });

  it("never reports more delivered than sent even if a counter drifts", () => {
    expect(warmupDeliveryCounts({ sent: 4, delivered: 9 }).delivered).toBe(4);
  });

  it("has no rate before the first send", () => {
    const counts = warmupDeliveryCounts({ sent: 0, delivered: 0 });
    expect(counts.rate).toBe(null);
    expect(warmupDeliveryLabel(counts)).toBe("no sends yet");
  });
});
