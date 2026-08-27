import { describe, expect, test } from "vitest";
import {
  clampToDailyLimit,
  mailboxDailyRemaining,
  mailboxSentToday,
  nextStoredSentToday,
  storedSentToday,
  utcStartOfDay,
} from "@/lib/mailbox-daily-usage";
import { evaluateMailboxCapacity } from "@/lib/mailbox-capacity";
import { zonedStartOfDay } from "@/lib/campaign-schedule";

const today = new Date("2026-08-27T09:00:00.000Z");
const dayStart = utcStartOfDay(today);

describe("mailbox daily usage", () => {
  test("mailbox at 30/30 today is blocked", () => {
    const row = { sent_today: 30, daily_limit: 30, last_sent_at: "2026-08-27T08:00:00.000Z" };
    expect(mailboxSentToday(row, dayStart)).toBe(30);
    expect(mailboxDailyRemaining(row, dayStart)).toBe(0);
  });

  test("next day the same mailbox regains full capacity", () => {
    const row = { sent_today: 30, daily_limit: 30, last_sent_at: "2026-08-26T08:00:00.000Z" };
    expect(storedSentToday(row, dayStart)).toBe(0);
    expect(mailboxDailyRemaining(row, dayStart)).toBe(30);
  });

  test("stored counter above the daily limit is clamped", () => {
    const row = { sent_today: 999, daily_limit: 30, last_sent_at: "2026-08-27T08:00:00.000Z" };
    expect(mailboxSentToday(row, dayStart)).toBe(30);
    expect(clampToDailyLimit(999, 30)).toBe(30);
    expect(nextStoredSentToday(row, dayStart, 5)).toBe(30);
  });

  test("counter without a send timestamp never blocks", () => {
    expect(storedSentToday({ sent_today: 30, daily_limit: 30, last_sent_at: null }, dayStart)).toBe(0);
  });

  test("dynamic count and stored counter are not summed", () => {
    const row = { sent_today: 10, daily_limit: 30, last_sent_at: "2026-08-27T08:00:00.000Z" };
    expect(mailboxSentToday(row, dayStart, 12)).toBe(12);
    expect(mailboxSentToday(row, dayStart, 4)).toBe(10);
  });

  test("day boundary follows the supplied timezone", () => {
    const now = new Date("2026-08-27T21:30:00.000Z"); // 01:30 next day in Dubai
    const dubaiStart = zonedStartOfDay(now, "Asia/Dubai");
    const row = { sent_today: 30, daily_limit: 30, last_sent_at: "2026-08-27T15:00:00.000Z" };
    // Dubai has already rolled over: capacity is back.
    expect(mailboxDailyRemaining(row, dubaiStart)).toBe(30);
    // UTC has not: still blocked.
    expect(mailboxDailyRemaining(row, utcStartOfDay(now))).toBe(0);
  });

  test("negative timezone boundary keeps yesterday's usage", () => {
    const now = new Date("2026-08-27T04:00:00.000Z"); // 21:00 previous day in LA
    const laStart = zonedStartOfDay(now, "America/Los_Angeles");
    const row = { sent_today: 12, daily_limit: 30, last_sent_at: "2026-08-27T02:00:00.000Z" };
    expect(mailboxSentToday(row, laStart)).toBe(12);
  });

  test("next stored value accumulates within the day", () => {
    const row = { sent_today: 5, daily_limit: 30, last_sent_at: "2026-08-27T08:00:00.000Z" };
    expect(nextStoredSentToday(row, dayStart, 3)).toBe(8);
    const stale = { sent_today: 5, daily_limit: 30, last_sent_at: "2026-08-25T08:00:00.000Z" };
    expect(nextStoredSentToday(stale, dayStart, 3)).toBe(3);
  });

  test("capacity evaluation is date-aware", () => {
    const base = {
      id: "a",
      from_name: "M",
      from_email: "m@x.com",
      paused: false,
      customer_enabled: true,
      status: "active",
      daily_limit: 30,
      hourly_limit: 10,
    };
    const stale = evaluateMailboxCapacity(
      { ...base, sent_today: 30, last_sent_at: "2026-08-26T08:00:00.000Z" },
      0,
      dayStart,
    );
    expect(stale.available).toBe(true);
    expect(stale.dailyRemaining).toBe(30);

    const todayFull = evaluateMailboxCapacity(
      { ...base, sent_today: 30, last_sent_at: "2026-08-27T08:00:00.000Z" },
      0,
      dayStart,
    );
    expect(todayFull.available).toBe(false);
    expect(todayFull.reason).toBe("daily");
  });
});
