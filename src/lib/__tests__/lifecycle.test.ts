import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIFECYCLE_CONFIG,
  normalizeLifecycleConfig,
} from "@/lib/lifecycle/config";
import {
  LIFECYCLE_EVENT_KEYS,
  formatEmailDate,
  isOpenState,
  nextActionAt,
  nextStep,
  stepDueAt,
  terminationDate,
  trackSteps,
} from "@/lib/lifecycle/model";

const cfg = DEFAULT_LIFECYCLE_CONFIG;

describe("lifecycle config", () => {
  it("uses defaults for an empty blob and stays disabled by default", () => {
    const c = normalizeLifecycleConfig({});
    expect(c.enabled).toBe(false);
    expect(c.free_trial.email_1_day).toBe(3);
    expect(c.free_trial.email_2_day).toBe(10);
    expect(c.inactive.inactive_days).toBe(30);
  });

  it("clamps out-of-range values", () => {
    const c = normalizeLifecycleConfig({ batch_limit: 99999, free_trial: { discount_1_percent: 500 } });
    expect(c.batch_limit).toBe(500);
    expect(c.free_trial.discount_1_percent).toBe(90);
  });

  it("keeps step offsets strictly increasing", () => {
    const c = normalizeLifecycleConfig({
      free_trial: { email_1_day: 10, email_2_day: 4 },
      inactive: { email_1_day: 9, email_2_day: 2, email_3_day: 2, final_warning_day: 1, termination_day: 1 },
    });
    expect(c.free_trial.email_2_day).toBeGreaterThan(c.free_trial.email_1_day);
    const i = c.inactive;
    expect(i.email_2_day).toBeGreaterThan(i.email_1_day);
    expect(i.email_3_day).toBeGreaterThan(i.email_2_day);
    expect(i.final_warning_day).toBeGreaterThan(i.email_3_day);
    expect(i.termination_day).toBeGreaterThan(i.final_warning_day);
  });
});

describe("lifecycle steps", () => {
  it("free track is exactly the 5% then 10% offer", () => {
    const steps = trackSteps("free_trial", cfg);
    expect(steps.map((s) => s.eventKey)).toEqual([
      LIFECYCLE_EVENT_KEYS.freeOffer5,
      LIFECYCLE_EVENT_KEYS.freeOffer10,
    ]);
    expect(steps[0]?.discountPercent).toBe(5);
    expect(steps[1]?.discountPercent).toBe(10);
  });

  it("inactive track is four emails plus termination", () => {
    const steps = trackSteps("inactive", cfg);
    expect(steps.map((s) => s.stepKey)).toEqual([
      "email_1",
      "email_2",
      "email_3",
      "final_warning",
      "termination",
    ]);
    expect(steps[4]?.kind).toBe("termination");
  });

  it("drops termination when auto-close is off", () => {
    const off = normalizeLifecycleConfig({ inactive: { terminate: false } });
    expect(trackSteps("inactive", off).some((s) => s.kind === "termination")).toBe(false);
  });

  it("walks the sequence one step at a time", () => {
    expect(nextStep("inactive", "eligible", cfg)?.stepKey).toBe("email_1");
    expect(nextStep("inactive", "email_1_sent", cfg)?.stepKey).toBe("email_2");
    expect(nextStep("inactive", "email_3_sent", cfg)?.stepKey).toBe("final_warning");
    expect(nextStep("inactive", "final_warning_sent", cfg)?.stepKey).toBe("termination");
    expect(nextStep("inactive", "terminated", cfg)).toBeNull();
    expect(nextStep("free_trial", "email_2_sent", cfg)).toBeNull();
  });

  it("treats closed states as closed", () => {
    expect(isOpenState("eligible")).toBe(true);
    expect(isOpenState("final_warning_sent")).toBe(true);
    expect(isOpenState("terminated")).toBe(false);
    expect(isOpenState("cancelled")).toBe(false);
    expect(isOpenState("reactivated")).toBe(false);
  });
});

describe("lifecycle scheduling", () => {
  const baseline = "2026-01-01T00:00:00.000Z";

  it("computes UTC due dates from the baseline", () => {
    expect(stepDueAt(baseline, 3).toISOString()).toBe("2026-01-04T00:00:00.000Z");
    expect(nextActionAt("free_trial", "eligible", baseline, cfg)).toBe("2026-01-04T00:00:00.000Z");
    expect(nextActionAt("free_trial", "email_1_sent", baseline, cfg)).toBe("2026-01-11T00:00:00.000Z");
    expect(nextActionAt("free_trial", "email_2_sent", baseline, cfg)).toBeNull();
  });

  it("dates render identically regardless of server timezone", () => {
    expect(formatEmailDate("2026-01-04T23:30:00.000Z")).toBe("January 4, 2026");
    expect(terminationDate(baseline, cfg).toISOString()).toBe("2026-01-25T00:00:00.000Z");
  });
});
