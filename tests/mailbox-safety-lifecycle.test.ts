import { describe, expect, test } from "vitest";
import {
  evaluateMailboxSafety,
  nextSafetyEvaluationAt,
  resumeDecision,
  SAFETY_WINDOW_DAYS,
} from "@/lib/mailbox-pause-state";

const base = {
  maxBounceRate: 5,
  minHealthScore: 0,
  healthScore: 90,
  accountStatus: "verified",
  authStatuses: ["pass", "pass", "pass"],
  customerEnabled: true,
};

describe("mailbox safety lifecycle", () => {
  test("active bounce violation blocks and is not resumable", () => {
    const snap = evaluateMailboxSafety({
      ...base,
      stats: [{ sent: 100, bounced: 10 }],
      pausedBySystem: true,
      pauseReason: "Bounce rate 10.0% exceeded the 5% limit.",
    });
    expect(snap.violation.active).toBe(true);
    expect(snap.stale).toBe(false);
    expect(snap.state.resumable).toBe(false);
    expect(resumeDecision(snap.state).allowed).toBe(false);
    expect(snap.metrics.bounceRate).toBe(10);
    expect(snap.metrics.windowDays).toBe(SAFETY_WINDOW_DAYS);
  });

  test("recovered numbers make the stored block stale and resumable", () => {
    const snap = evaluateMailboxSafety({
      ...base,
      stats: [{ sent: 200, bounced: 2 }],
      pausedBySystem: true,
      pauseReason: "Bounce rate 10.0% exceeded the 5% limit.",
    });
    expect(snap.violation.active).toBe(false);
    expect(snap.stale).toBe(true);
    expect(snap.state.resumable).toBe(true);
    expect(resumeDecision(snap.state).allowed).toBe(true);
    expect(snap.metrics.bounceRate).toBe(1);
  });

  test("small samples never raise a safety block", () => {
    const snap = evaluateMailboxSafety({
      ...base,
      stats: [{ sent: 5, bounced: 2 }],
      pausedBySystem: true,
    });
    expect(snap.metrics.sampleSufficient).toBe(false);
    expect(snap.violation.active).toBe(false);
    expect(snap.state.resumable).toBe(true);
  });

  test("capacity exhaustion is temporary, not a safety block", () => {
    const snap = evaluateMailboxSafety({
      ...base,
      stats: [{ sent: 100, bounced: 1 }],
      capacityExhausted: true,
    });
    expect(snap.state.kind).toBe("capacity");
    expect(snap.state.temporary).toBe(true);
    expect(resumeDecision(snap.state).allowed).toBe(true);
  });

  test("provider failure stays blocked and exposes a next check time", () => {
    const snap = evaluateMailboxSafety({
      ...base,
      authStatuses: ["pass", "fail", "pass"],
      stats: [{ sent: 100, bounced: 1 }],
      pausedBySystem: true,
      now: new Date("2026-08-28T12:34:00.000Z"),
    });
    expect(snap.state.kind).toBe("provider_failure");
    expect(snap.state.resumable).toBe(false);
    expect(snap.nextEvaluationAt).toBe("2026-08-28T13:00:00.000Z");
  });

  test("next evaluation rolls to the following hour", () => {
    expect(nextSafetyEvaluationAt(new Date("2026-08-28T23:10:00.000Z")).toISOString()).toBe(
      "2026-08-29T00:00:00.000Z",
    );
  });
});
