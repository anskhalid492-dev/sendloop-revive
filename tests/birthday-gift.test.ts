import { describe, expect, it } from "vitest";

import { addOneMonth, giftYear, isBirthdayToday, localDate, parseBirthday, toIsoDate } from "@/lib/birthday-gift";

describe("birthday gift date rules", () => {
  it("parses stored birthdays", () => {
    expect(parseBirthday("1990-08-27")).toEqual({ year: 1990, month: 8, day: 27 });
    expect(parseBirthday("nope")).toBeNull();
    expect(parseBirthday(null)).toBeNull();
  });

  it("matches the birthday in the customer's own timezone", () => {
    // 27 Aug 21:00 UTC is already 28 Aug in Asia/Dubai (+4).
    const now = new Date("2026-08-27T21:00:00Z");
    expect(isBirthdayToday("1990-08-27", now, "UTC")).toBe(true);
    expect(isBirthdayToday("1990-08-28", now, "Asia/Dubai")).toBe(true);
    expect(isBirthdayToday("1990-08-27", now, "Asia/Dubai")).toBe(false);
  });

  it("falls back to UTC when no timezone is stored", () => {
    const now = new Date("2026-03-05T10:00:00Z");
    expect(isBirthdayToday("1988-03-05", now, null)).toBe(true);
    expect(localDate(now, "not-a-zone")).toEqual({ year: 2026, month: 3, day: 5 });
  });

  it("ignores missing birthdays", () => {
    expect(isBirthdayToday(null, new Date(), "UTC")).toBe(false);
    expect(isBirthdayToday("", new Date(), "UTC")).toBe(false);
  });

  it("celebrates Feb 29 on Mar 1 in non-leap years", () => {
    expect(isBirthdayToday("2000-02-29", new Date("2026-03-01T09:00:00Z"), "UTC")).toBe(true);
    expect(isBirthdayToday("2000-02-29", new Date("2028-02-29T09:00:00Z"), "UTC")).toBe(true);
    expect(isBirthdayToday("2000-02-29", new Date("2028-03-01T09:00:00Z"), "UTC")).toBe(false);
  });

  it("books the gift against the local year", () => {
    expect(giftYear(new Date("2026-12-31T23:00:00Z"), "Asia/Dubai")).toBe(2027);
  });

  it("adds one calendar month, clamped to month end", () => {
    expect(addOneMonth(new Date("2026-08-27T00:00:00Z")).toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(addOneMonth(new Date("2026-01-31T00:00:00Z")).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("validates the MM/DD/YYYY onboarding input", () => {
    expect(toIsoDate("8", "27", "1990")).toBe("1990-08-27");
    expect(toIsoDate("02", "30", "1990")).toBeNull();
    expect(toIsoDate("13", "01", "1990")).toBeNull();
    expect(toIsoDate("", "", "")).toBeNull();
    expect(toIsoDate("08", "27", "2999")).toBeNull();
  });
});
