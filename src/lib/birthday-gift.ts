/**
 * Pure helpers for the birthday gift automation.
 *
 * Kept free of database/provider code so the date rules (timezone handling,
 * leap-day fallback, gift window) can be unit tested directly.
 */

export type LocalDate = { year: number; month: number; day: number };

/** Today's calendar date in the given IANA timezone (falls back to UTC). */
export function localDate(now: Date, timeZone?: string | null): LocalDate {
  const zone = timeZone && timeZone.trim() ? timeZone.trim() : "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    return { year: get("year"), month: get("month"), day: get("day") };
  } catch {
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
  }
}

/** Parses a stored `YYYY-MM-DD` birthday. Returns null when unusable. */
export function parseBirthday(value: string | null | undefined): LocalDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * True when the birthday falls on the customer's local "today".
 * February 29 birthdays are celebrated on March 1 in non-leap years.
 */
export function isBirthdayToday(
  birthday: string | null | undefined,
  now: Date,
  timeZone?: string | null,
): boolean {
  const parsed = parseBirthday(birthday);
  if (!parsed) return false;
  const today = localDate(now, timeZone);
  if (parsed.month === today.month && parsed.day === today.day) return true;
  if (parsed.month === 2 && parsed.day === 29 && !isLeapYear(today.year)) {
    return today.month === 3 && today.day === 1;
  }
  return false;
}

/** The year the gift is booked against — the customer's local year. */
export function giftYear(now: Date, timeZone?: string | null): number {
  return localDate(now, timeZone).year;
}

/** Adds one calendar month, clamped to the end of the target month. */
export function addOneMonth(from: Date): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** ISO date string (`YYYY-MM-DD`) for a local date, or null when incomplete. */
export function toIsoDate(month: string, day: string, year: string): string | null {
  const m = Number(month);
  const d = Number(day);
  const y = Number(year);
  if (!m || !d || !y) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 1900 || y > new Date().getUTCFullYear()) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
