import { describe, expect, it } from "vitest";
import { resolveWarmupStartAt } from "@/lib/warmup-start";

// Isolated fixtures only — no customer accounts, no network.
const NOW = new Date("2026-10-18T12:00:00Z");

describe("resolveWarmupStartAt", () => {
  it("keeps an existing start date untouched", () => {
    expect(resolveWarmupStartAt("2026-09-01T00:00:00Z", null, NOW)).toBe("2026-09-01T00:00:00Z");
  });

  it("infers the start from the first day with successful sends", () => {
    expect(resolveWarmupStartAt(null, "2026-10-01", NOW)).toBe("2026-10-01T00:00:00Z");
  });

  it("starts a never-started mailbox fresh at Day 1 instead of staying null", () => {
    expect(resolveWarmupStartAt(null, null, NOW)).toBe(NOW.toISOString());
  });

  it("never returns null, so automatic progression cannot pin a mailbox at Day 1 forever", () => {
    for (const [started, day] of [
      [null, null],
      [undefined, undefined],
      [null, "2026-10-01"],
      ["2026-09-01T00:00:00Z", null],
    ] as const) {
      expect(resolveWarmupStartAt(started, day, NOW)).toBeTruthy();
    }
  });
});
