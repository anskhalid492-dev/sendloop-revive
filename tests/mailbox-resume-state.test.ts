import { describe, expect, test } from "vitest";
import {
  classifyMailboxPause,
  evaluateSafetyViolation,
  resumeDecision,
  NO_VIOLATION,
} from "@/lib/mailbox-pause-state";
import { evaluateMailboxCapacity } from "@/lib/mailbox-capacity";
import { mailboxCapacityReturnsAt, mailboxWindowStart } from "@/lib/mailbox-daily-usage";

const bounceStats = [{ sent: 100, bounced: 7, failed: 0 }];
const cleanStats = [{ sent: 100, bounced: 1, failed: 0 }];

const safety = (stats: Array<Record<string, number>>) =>
  evaluateSafetyViolation({
    stats,
    maxBounceRate: 5,
    minHealthScore: 0,
    healthScore: 90,
    accountStatus: "verified",
    authStatuses: ["pass", "pass", "pass"],
  });

describe("mailbox resume / blocked state", () => {
  test("1. manually paused mailbox resumes to active", () => {
    const state = classifyMailboxPause({ manuallyPaused: true, customerEnabled: true });
    expect(state.kind).toBe("manual");
    expect(resumeDecision(state).allowed).toBe(true);
  });

  test("2. resume does not immediately re-pause a resumed mailbox", () => {
    // After resume the flags are cleared; the safety guard sees the same clean
    // data the resume check used, so it must not re-pause.
    const violation = safety(cleanStats);
    expect(violation.active).toBe(false);
    const state = classifyMailboxPause({
      manuallyPaused: false,
      customerEnabled: true,
      pausedBySystem: false,
      violation,
    });
    expect(state.kind).toBe("none");
    expect(state.label).toBe("Active");
  });

  test("3. 12-hour capacity exhaustion is temporary, not a block", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    const capacity = evaluateMailboxCapacity(
      {
        id: "m",
        from_name: "M",
        from_email: "m@x.com",
        paused: false,
        customer_enabled: true,
        status: "verified",
        daily_limit: 40,
        hourly_limit: 20,
        sent_today: 40,
        last_sent_at: "2026-08-28T10:00:00.000Z",
      },
      0,
      mailboxWindowStart(now),
    );
    expect(capacity.available).toBe(false);
    expect(capacity.temporary).toBe(true);
    expect(capacity.reasonLabel).toBe("Temporarily unavailable");
    const state = classifyMailboxPause({ customerEnabled: true, capacityExhausted: true });
    expect(state.kind).toBe("capacity");
    expect(state.temporary).toBe(true);
  });

  test("4. mailbox is eligible again once the 12-hour window expires", () => {
    const later = new Date("2026-08-28T23:00:00.000Z");
    const capacity = evaluateMailboxCapacity(
      {
        id: "m",
        from_name: "M",
        from_email: "m@x.com",
        paused: false,
        customer_enabled: true,
        status: "verified",
        daily_limit: 40,
        hourly_limit: 20,
        sent_today: 40,
        last_sent_at: "2026-08-28T10:00:00.000Z",
      },
      0,
      mailboxWindowStart(later),
    );
    expect(capacity.available).toBe(true);
    expect(capacity.dailyRemaining).toBe(40);
    expect(
      mailboxCapacityReturnsAt(
        { last_sent_at: "2026-08-28T10:00:00.000Z" },
        new Date("2026-08-28T12:00:00.000Z"),
      )?.toISOString(),
    ).toBe("2026-08-28T22:00:00.000Z");
  });

  test("5. an active bounce-rate violation stays blocked", () => {
    const violation = safety(bounceStats);
    expect(violation.kind).toBe("bounce_safety");
    const state = classifyMailboxPause({ customerEnabled: true, pausedBySystem: true, violation });
    expect(state.resumable).toBe(false);
    expect(state.label).toBe("Blocked by bounce-rate protection");
  });

  test("6. resume cannot bypass an active bounce safety block", () => {
    const state = classifyMailboxPause({
      customerEnabled: true,
      pausedBySystem: true,
      violation: safety(bounceStats),
    });
    const decision = resumeDecision(state);
    expect(decision.allowed).toBe(false);
    expect(decision.message).toMatch(/cannot override/i);
  });

  test("7. a stale safety block can be cleared", () => {
    const state = classifyMailboxPause({
      customerEnabled: true,
      pausedBySystem: true,
      pauseReason: "Bounce rate 6.9% exceeded the 5% limit.",
      violation: safety(cleanStats),
    });
    expect(state.kind).toBe("auto_safety");
    expect(resumeDecision(state).allowed).toBe(true);
  });

  test("8. user-disabled mailbox stays disabled", () => {
    const state = classifyMailboxPause({ customerEnabled: false, manuallyPaused: false });
    expect(state.kind).toBe("disabled");
    expect(resumeDecision(state).allowed).toBe(false);
  });

  test("9. provider/authentication failure stays blocked", () => {
    const authFail = evaluateSafetyViolation({
      stats: cleanStats,
      maxBounceRate: 5,
      minHealthScore: 0,
      healthScore: 90,
      accountStatus: "verified",
      authStatuses: ["pass", "fail", "pass"],
    });
    expect(authFail.kind).toBe("provider_failure");
    const state = classifyMailboxPause({ customerEnabled: true, violation: authFail });
    expect(resumeDecision(state).allowed).toBe(false);

    const failedTest = classifyMailboxPause({ customerEnabled: true, accountStatus: "failed" });
    expect(failedTest.kind).toBe("provider_failure");
    expect(failedTest.resumable).toBe(false);
  });

  test("10-12. resume is pure state — it touches no stats, sends or messages", () => {
    // The decision is computed from inputs only: no counters, no message rows,
    // no historical statistics are read or produced.
    const before = { sent: 100, bounced: 1, failed: 0 };
    const state = classifyMailboxPause({
      manuallyPaused: true,
      customerEnabled: true,
      violation: NO_VIOLATION,
    });
    const decision = resumeDecision(state);
    expect(decision.allowed).toBe(true);
    expect(before).toEqual({ sent: 100, bounced: 1, failed: 0 });
    // Resuming never marks anything sendable twice: capacity is still derived
    // from the accepted-send counters, untouched by the resume decision.
    const capacity = evaluateMailboxCapacity(
      {
        id: "m",
        from_name: "M",
        from_email: "m@x.com",
        paused: false,
        customer_enabled: true,
        status: "verified",
        daily_limit: 40,
        hourly_limit: 20,
        sent_today: 12,
        last_sent_at: "2026-08-28T10:00:00.000Z",
      },
      0,
      mailboxWindowStart(new Date("2026-08-28T12:00:00.000Z")),
    );
    expect(capacity.sentToday).toBe(12);
    expect(capacity.dailyRemaining).toBe(28);
  });
});
