import { describe, expect, it } from "vitest";
import { evaluateWarmupRamp, type RampSettings, type RampStatRow } from "@/lib/warmup-ramp";

const settings: RampSettings = {
  start_volume: 4,
  max_volume: 40,
  daily_increase: 2,
  max_bounce_rate: 8,
  min_health_score: 50,
  hold_failure_rate: 10,
  recovery_bounce_rate: 5,
  recovery_days: 3,
};

function day(offset: number): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
}

/** A clean day of sending at the given volume. */
function clean(offset: number, volume: number): RampStatRow {
  return { day: day(offset), target: volume, sent: volume, delivered: volume, replied: 1 };
}

describe("warmup ramp state machine", () => {
  it("starts at the start volume on the first run", () => {
    const d = evaluateWarmupRamp({ settings, stats: [], healthScore: null });
    expect(d.stage).toBe("ramp_up");
    expect(d.action).toBe("start");
    expect(d.target).toBe(4);
  });

  it("increases only after clean delivery, by the configured step", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [clean(1, 8), clean(2, 6), clean(3, 4)],
      healthScore: 95,
      stage: "ramp_up",
      currentVolume: 8,
    });
    expect(d.action).toBe("increase");
    expect(d.target).toBe(10);
  });

  it("does not increase just because a day passed with nothing sent", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [{ day: day(1), target: 8, sent: 0 }, clean(2, 6)],
      healthScore: 95,
      stage: "ramp_up",
      currentVolume: 8,
    });
    expect(d.stage).toBe("hold");
    expect(d.target).toBe(8);
  });

  it("holds when the health score is not high enough", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [clean(1, 10)],
      healthScore: 64,
      stage: "ramp_up",
      currentVolume: 10,
    });
    expect(d.stage).toBe("hold");
    expect(d.target).toBe(10);
  });

  it("reduces volume and explains why when temporary failures rise", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [{ day: day(1), target: 20, sent: 20, delivered: 14, failed: 4, deferred: 2 }],
      healthScore: 88,
      stage: "ramp_up",
      currentVolume: 20,
    });
    expect(d.stage).toBe("recovery");
    expect(d.action).toBe("reduce");
    expect(d.target).toBe(10);
    expect(d.reason).toContain("temporary delivery failures increased");
  });

  it("reduces volume when the provider is throttling", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [clean(1, 20)],
      healthScore: 90,
      stage: "ramp_up",
      currentVolume: 20,
      throttled: true,
    });
    expect(d.stage).toBe("recovery");
    expect(d.reason).toContain("rate limiting");
  });

  it("leaves recovery for a hold after clean days, not straight back to increasing", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [clean(1, 10), clean(2, 10), clean(3, 10)],
      healthScore: 92,
      stage: "recovery",
      stageSince: day(4),
      currentVolume: 10,
    });
    expect(d.stage).toBe("hold");
    expect(d.target).toBe(10);
  });

  it("stays in recovery while there is not enough clean history", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [clean(1, 10)],
      healthScore: 92,
      stage: "recovery",
      stageSince: new Date().toISOString(),
      currentVolume: 10,
    });
    expect(d.stage).toBe("recovery");
    expect(d.action).toBe("recover");
  });

  it("pauses on complaints and on a bounce rate above the limit", () => {
    const complaint = evaluateWarmupRamp({
      settings,
      stats: [{ day: day(1), target: 20, sent: 20, complained: 2 }],
      healthScore: 80,
      currentVolume: 20,
    });
    expect(complaint.stage).toBe("paused");
    expect(complaint.target).toBe(0);

    const bounced = evaluateWarmupRamp({
      settings,
      stats: [{ day: day(1), target: 20, sent: 20, bounced: 3 }],
      healthScore: 80,
      currentVolume: 20,
    });
    expect(bounced.stage).toBe("paused");
    expect(bounced.target).toBe(0);
  });

  it("pauses when authentication is failing and never claims healthy", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [clean(1, 10)],
      healthScore: 99,
      authStatuses: ["pass", "fail", "pass"],
      currentVolume: 10,
    });
    expect(d.stage).toBe("paused");
    expect(d.reason).toContain("authentication");
  });

  it("is stable at the maximum and never exceeds it", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [clean(1, 40)],
      healthScore: 96,
      stage: "stable",
      currentVolume: 40,
    });
    expect(d.stage).toBe("stable");
    expect(d.target).toBe(40);
  });

  it("never exceeds the mailbox capacity left after replies and campaigns", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [clean(1, 20)],
      healthScore: 96,
      stage: "ramp_up",
      currentVolume: 20,
      capacityCeiling: 6,
    });
    expect(d.target).toBe(6);
    expect(d.reason).toContain("replies and campaigns come first");
  });

  it("queues nothing while paused", () => {
    const d = evaluateWarmupRamp({
      settings,
      stats: [clean(1, 10)],
      healthScore: 90,
      paused: true,
      pauseReason: "Paused by the customer.",
      currentVolume: 10,
    });
    expect(d.stage).toBe("paused");
    expect(d.target).toBe(0);
    expect(d.reason).toBe("Paused by the customer.");
  });
});
