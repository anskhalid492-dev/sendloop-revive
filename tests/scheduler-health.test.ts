import { describe, expect, it } from "vitest";

import {
  SCHEDULER_STALE_AFTER_MS,
  evaluateSchedulerHealth,
} from "@/lib/scheduler-health";

const NOW = new Date("2026-08-29T14:00:00.000Z");

describe("scheduler health", () => {
  it("reports 'never' when no cron tick was ever recorded", () => {
    const health = evaluateSchedulerHealth(null, NOW);
    expect(health.state).toBe("never");
    expect(health.lastTickAt).toBeNull();
  });

  it("reports 'never' for an unparseable heartbeat", () => {
    expect(evaluateSchedulerHealth({ lastTickAt: "not-a-date" }, NOW).state).toBe("never");
  });

  it("reports healthy inside the expected cadence", () => {
    const health = evaluateSchedulerHealth(
      { lastTickAt: new Date(NOW.getTime() - 4 * 60_000).toISOString() },
      NOW,
    );
    expect(health.state).toBe("healthy");
    expect(health.minutesSinceTick).toBe(4);
  });

  it("flags a lost cron registration as stale", () => {
    const health = evaluateSchedulerHealth(
      { lastTickAt: new Date(NOW.getTime() - SCHEDULER_STALE_AFTER_MS - 60_000).toISOString() },
      NOW,
    );
    expect(health.state).toBe("stale");
    expect(health.message).toContain("not ticked");
  });
});
