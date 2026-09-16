import { describe, expect, it } from "vitest";

import {
  deliveryGate,
  describeBody,
  nextDeliveryHealth,
  readDeliveryHealth,
} from "@/lib/integrations.server";

const now = Date.parse("2026-09-16T12:00:00.000Z");

describe("outbound delivery backoff", () => {
  it("escalates 1 minute, 5 minutes, 30 minutes, then needs attention", () => {
    let health = readDeliveryHealth(null);
    health = nextDeliveryHealth(health, false, now);
    expect(health).toEqual({ failures: 1, retryAfter: new Date(now + 60_000).toISOString(), needsAttention: false });
    health = nextDeliveryHealth(health, false, now);
    expect(health.retryAfter).toBe(new Date(now + 300_000).toISOString());
    health = nextDeliveryHealth(health, false, now);
    expect(health.retryAfter).toBe(new Date(now + 1_800_000).toISOString());
    health = nextDeliveryHealth(health, false, now);
    expect(health).toEqual({ failures: 4, retryAfter: null, needsAttention: true });
  });

  it("skips while cooling down and resumes once the cooldown lapses", () => {
    const health = nextDeliveryHealth(readDeliveryHealth(null), false, now);
    expect(deliveryGate(health, now + 30_000).send).toBe(false);
    expect(deliveryGate(health, now + 61_000).send).toBe(true);
  });

  it("stops permanently once a destination needs attention", () => {
    const gate = deliveryGate({ failures: 4, retryAfter: null, needsAttention: true }, now);
    expect(gate.send).toBe(false);
  });

  it("resets after a successful delivery", () => {
    expect(nextDeliveryHealth({ failures: 3, retryAfter: null, needsAttention: false }, true, now)).toEqual({
      failures: 0,
      retryAfter: null,
      needsAttention: false,
    });
  });

  it("reads stored health back", () => {
    expect(
      readDeliveryHealth({ delivery_health: { failures: 2, retry_after: "x", needs_attention: false } }),
    ).toEqual({ failures: 2, retryAfter: "x", needsAttention: false });
  });

  it("summarises an HTML login page instead of pasting markup", () => {
    const message = describeBody('<!DOCTYPE html><html><head><title>Sign in - Google Accounts</title></head></html>');
    expect(message).toContain("Sign in - Google Accounts");
    expect(message).not.toContain("<html");
  });

  it("keeps a plain API error message", () => {
    expect(describeBody("please unsubscribe me!")).toBe("please unsubscribe me!");
  });
});
