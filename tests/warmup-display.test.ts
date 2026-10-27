import { describe, expect, it } from "vitest";
import { computeDeliverability } from "@/lib/warmup-deliverability";
import { showWarmupSafe, type WarmupDisplaySignals } from "@/lib/warmup-display";

const row: WarmupDisplaySignals = {
  health_score: 100, safety_active: false, paused_by_system: false, block_reason: null,
  failed_today: 0, spam_today: 0, bounced_today: 0, temp_failure_rate: null,
  safety_metrics: { bounced: 0, complained: 0, failed: 0 },
};
const metrics = computeDeliverability([]);

describe("warmup display status (isolated throwaway fixtures)", () => {
  it("permits clean 100 health without inventing placement", () => {
    expect(showWarmupSafe(row, metrics)).toBe(true);
    expect(metrics.inboxRate.value).toBeNull();
    expect(metrics.spamRate.value).toBeNull();
    expect(metrics.bounceRate.value).toBeNull();
  });
  it.each([null, 79, 80, 99])("requires exactly 100 health, not %s", (health_score) => {
    expect(showWarmupSafe({ ...row, health_score }, metrics)).toBe(false);
  });
  it("does not treat missing observations as checked warnings", () => {
    expect(showWarmupSafe(row, undefined)).toBe(false);
  });
  it.each(["spam", "bounced", "failed"] as const)("blocks Safe for measured %s even below sample minimum", (signal) => {
    expect(showWarmupSafe(row, { ...metrics, [signal]: 1 })).toBe(false);
  });
  it.each(["bounced", "complained", "failed"] as const)("blocks Safe for safety-window %s", (signal) => {
    expect(showWarmupSafe({ ...row, safety_metrics: { ...row.safety_metrics, [signal]: 1 } }, metrics)).toBe(false);
  });
  it.each([
    { safety_active: true }, { paused_by_system: true }, { block_reason: "Provider warning" },
    { failed_today: 1 }, { spam_today: 1 }, { bounced_today: 1 }, { temp_failure_rate: 1 },
  ])("blocks Safe for active mailbox warning %j", (warning) => {
    expect(showWarmupSafe({ ...row, ...warning }, metrics)).toBe(false);
  });
});