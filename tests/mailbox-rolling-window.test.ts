import { describe, expect, test } from "vitest";
import {
  MAILBOX_WINDOW_HOURS,
  mailboxDailyRemaining,
  mailboxSentToday,
  mailboxWindowStart,
} from "@/lib/mailbox-daily-usage";
import { evaluateMailboxCapacity } from "@/lib/mailbox-capacity";
import { selectRetryableMessages } from "@/lib/dispatch.server";

const now = new Date("2026-08-28T10:00:00.000Z");

describe("mailbox 12-hour rolling window", () => {
  test("window is 12 hours, not a calendar day", () => {
    expect(MAILBOX_WINDOW_HOURS).toBe(12);
    expect(mailboxWindowStart(now).toISOString()).toBe("2026-08-27T22:00:00.000Z");
  });

  test("mailbox at its limit inside the window is blocked", () => {
    const row = { sent_today: 100, daily_limit: 100, last_sent_at: "2026-08-28T02:00:00.000Z" };
    expect(mailboxSentToday(row, mailboxWindowStart(now))).toBe(100);
    expect(mailboxDailyRemaining(row, mailboxWindowStart(now))).toBe(0);
  });

  test("capacity returns 12 hours later without waiting for midnight", () => {
    const sentAt = "2026-08-28T10:00:00.000Z";
    const row = { sent_today: 100, daily_limit: 100, last_sent_at: sentAt };
    const elevenHours = new Date("2026-08-28T21:00:00.000Z");
    const twelveHours = new Date("2026-08-28T22:00:01.000Z");
    expect(mailboxDailyRemaining(row, mailboxWindowStart(elevenHours))).toBe(0);
    expect(mailboxDailyRemaining(row, mailboxWindowStart(twelveHours))).toBe(100);
  });

  test("capacity evaluation defaults to the rolling window", () => {
    const base = {
      id: "a",
      from_name: "M",
      from_email: "m@x.com",
      paused: false,
      customer_enabled: true,
      status: "active",
      daily_limit: 100,
      hourly_limit: 0,
    };
    const stale = evaluateMailboxCapacity({
      ...base,
      sent_today: 100,
      last_sent_at: new Date(Date.now() - 13 * 3_600_000).toISOString(),
    });
    expect(stale.available).toBe(true);
    const fresh = evaluateMailboxCapacity({
      ...base,
      sent_today: 100,
      last_sent_at: new Date(Date.now() - 1 * 3_600_000).toISOString(),
    });
    expect(fresh.available).toBe(false);
    expect(fresh.reason).toBe("daily");
  });

  test("accepted sends are not double-counted with the stored counter", () => {
    const row = { sent_today: 40, daily_limit: 100, last_sent_at: "2026-08-28T02:00:00.000Z" };
    expect(mailboxSentToday(row, mailboxWindowStart(now), 40)).toBe(40);
  });
});

describe("failed/rejected sends never consume capacity or get resent", () => {
  const dayStart = new Date("2026-08-28T00:00:00.000Z");

  test("only previous-day failed attempts are re-queued", () => {
    const rows = [
      { id: "fail-old", status: "failed", attempts: 1, sent_at: null, updated_at: "2026-08-27T09:00:00.000Z" },
      { id: "fail-today", status: "failed", attempts: 1, sent_at: null, updated_at: "2026-08-28T09:00:00.000Z" },
      { id: "accepted", status: "sent", attempts: 1, sent_at: "2026-08-27T09:00:00.000Z", updated_at: "2026-08-27T09:00:00.000Z" },
      { id: "bounced", status: "failed", attempts: 1, sent_at: null, bounced_at: "2026-08-27T09:10:00.000Z", updated_at: "2026-08-27T09:10:00.000Z" },
      { id: "cancelled", status: "cancelled", attempts: 0, sent_at: null, updated_at: "2026-08-27T09:00:00.000Z" },
      { id: "exhausted", status: "failed", attempts: 3, sent_at: null, updated_at: "2026-08-27T09:00:00.000Z" },
      { id: "scheduled", status: "scheduled", attempts: 0, sent_at: null, updated_at: "2026-08-27T09:00:00.000Z" },
    ];
    expect(selectRetryableMessages(rows, dayStart).map((r) => r.id)).toEqual(["fail-old"]);
  });

  test("an accepted message is never selected for a resend", () => {
    const rows = [
      { id: "a", status: "failed", attempts: 1, sent_at: "2026-08-27T09:00:00.000Z", updated_at: "2026-08-27T09:00:00.000Z" },
    ];
    expect(selectRetryableMessages(rows, dayStart)).toHaveLength(0);
  });
});
