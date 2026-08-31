import { describe, expect, test } from "vitest";
import {
  GUARD_MAX_BOUNCE_RATE,
  GUARD_MIN_SAMPLE,
  computeRates,
  guardViolation,
} from "@/lib/deliverability-guard.server";

const rows = (sent: number, bounced: number, complained = 0) => [
  ...Array.from({ length: bounced }, () => ({ delivery_status: "bounced" })),
  ...Array.from({ length: complained }, () => ({ delivery_status: "complained" })),
  ...Array.from({ length: sent - bounced - complained }, () => ({ delivery_status: "delivered" })),
];

describe("deliverability guard", () => {
  test("small samples never pause anything", () => {
    const rates = computeRates(rows(GUARD_MIN_SAMPLE - 1, GUARD_MIN_SAMPLE - 1));
    expect(rates.sampleSufficient).toBe(false);
    expect(guardViolation(rates, "campaign")).toBeNull();
  });

  test("healthy sending is not paused", () => {
    const rates = computeRates(rows(100, 2));
    expect(rates.bounceRate).toBe(2);
    expect(guardViolation(rates, "campaign")).toBeNull();
  });

  test("high bounce rate pauses with a reason", () => {
    const rates = computeRates(rows(100, 20));
    expect(rates.bounceRate).toBeGreaterThan(GUARD_MAX_BOUNCE_RATE);
    expect(guardViolation(rates, "campaign")).toContain("bounce rate 20%");
  });

  test("a single complaint in a small-but-sufficient sample pauses the mailbox", () => {
    const rates = computeRates(rows(100, 0, 1));
    expect(guardViolation(rates, "mailbox")).toContain("spam complaint rate 1%");
  });
});
