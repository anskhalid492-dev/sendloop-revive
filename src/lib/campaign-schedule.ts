export type ScheduleWindow = {
  timezone: string;
  sendDays: number[]; // 0=Sun .. 6=Sat
  startHour: number;
  endHour: number;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
};

function validTimezone(timezone: string | null | undefined) {
  const candidate = timezone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

export function zonedParts(date: Date, timezone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: validTimezone(timezone),
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const weekdayLabel = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? "1970"),
    month: Number(parts.find((p) => p.type === "month")?.value ?? "1"),
    day: Number(parts.find((p) => p.type === "day")?.value ?? "1"),
    weekday: map[weekdayLabel] ?? 1,
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? "0"),
    second: Number(parts.find((p) => p.type === "second")?.value ?? "0"),
  };
}

function clampWindow(window: ScheduleWindow) {
  const start = Math.min(Math.max(window.startHour, 0), 23);
  const end = Math.min(Math.max(window.endHour, start + 1), 24);
  return {
    timezone: validTimezone(window.timezone),
    days: window.sendDays.length ? window.sendDays : [1, 2, 3, 4, 5],
    start,
    end,
  };
}

function offsetMs(date: Date, timezone: string) {
  const p = zonedParts(date, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function addLocalDays(year: number, month: number, day: number, amount: number) {
  const d = new Date(Date.UTC(year, month - 1, day + amount, 12, 0, 0));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function zonedDateTimeToUtc(
  value: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timezone: string,
): Date {
  const tz = validTimezone(timezone);
  const localUtc = Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour ?? 0,
    value.minute ?? 0,
    value.second ?? 0,
  );
  let result = new Date(localUtc - offsetMs(new Date(localUtc), tz));
  // One more pass handles daylight-saving boundary offsets.
  result = new Date(localUtc - offsetMs(result, tz));
  return result;
}

export function zonedStartOfDay(date: Date, timezone: string): Date {
  const p = zonedParts(date, timezone);
  return zonedDateTimeToUtc({ year: p.year, month: p.month, day: p.day }, timezone);
}

export function isInSendWindow(date: Date, window: ScheduleWindow): boolean {
  const { timezone, days, start, end } = clampWindow(window);
  const parts = zonedParts(date, timezone);
  return days.includes(parts.weekday) && parts.hour >= start && parts.hour < end;
}

/**
 * Returns the first moment at or after `from` that falls inside the campaign's
 * sending window, using the campaign timezone rather than browser/server local time.
/**
 * The START of a configured sending window — never a mid-window "now".
 *
 * `includeCurrentDay` (default true) returns today's window start when `from`
 * already sits inside today's window; otherwise the first window start strictly
 * after `from`. This is what a recurring campaign's next run is derived from:
 * send days + start hour + timezone only.
 */
export function windowStartAt(
  from: Date,
  window: ScheduleWindow,
  options: { includeCurrentDay?: boolean } = {},
): Date {
  const includeCurrentDay = options.includeCurrentDay !== false;
  const { timezone, days, start, end } = clampWindow(window);
  const base = zonedParts(from, timezone);

  for (let offset = 0; offset <= 14; offset += 1) {
    const localDay = addLocalDays(base.year, base.month, base.day, offset);
    const windowStart = zonedDateTimeToUtc({ ...localDay, hour: start }, timezone);
    const weekday = zonedParts(windowStart, timezone).weekday;
    if (!days.includes(weekday)) continue;
    if (windowStart.getTime() > from.getTime()) return windowStart;
    if (includeCurrentDay && offset === 0) {
      const endDay = end === 24 ? addLocalDays(localDay.year, localDay.month, localDay.day, 1) : localDay;
      const windowEnd = zonedDateTimeToUtc({ ...endDay, hour: end === 24 ? 0 : end }, timezone);
      if (from.getTime() < windowEnd.getTime()) return windowStart;
    }
  }
  return from;
}

export function nextSendSlot(from: Date, window: ScheduleWindow): Date {

  const { timezone, days, start, end } = clampWindow(window);
  const roundedFrom = new Date(Math.ceil(from.getTime() / 60_000) * 60_000);
  const base = zonedParts(roundedFrom, timezone);

  for (let offset = 0; offset <= 14; offset += 1) {
    const localDay = addLocalDays(base.year, base.month, base.day, offset);
    const windowStart = zonedDateTimeToUtc({ ...localDay, hour: start }, timezone);
    const endDay = end === 24 ? addLocalDays(localDay.year, localDay.month, localDay.day, 1) : localDay;
    const windowEnd = zonedDateTimeToUtc({ ...endDay, hour: end === 24 ? 0 : end }, timezone);
    const weekday = zonedParts(windowStart, timezone).weekday;
    if (!days.includes(weekday)) continue;

    if (roundedFrom.getTime() < windowEnd.getTime()) {
      return roundedFrom.getTime() > windowStart.getTime() ? roundedFrom : windowStart;
    }
  }
  return from;
}

export function zonedDateTimeLocalValue(value: string | null, timezone: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const p = zonedParts(date, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function parseZonedDateTimeLocal(value: string, timezone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  if (!year || !month || !day || !hour || !minute) return null;
  return zonedDateTimeToUtc(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
    },
    timezone,
  );
}

export function formatZonedDateTime(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: validTimezone(timezone),
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(value);
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

export function renderTemplate(text: string, lead: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const value = lead[key];
    if (value === null || value === undefined || value === "") return "";
    return String(value);
  });
}
