export type ScheduleWindow = {
  timezone: string;
  sendDays: number[]; // 0=Sun .. 6=Sat
  startHour: number;
  endHour: number;
};

function zonedParts(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekdayLabel = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: map[weekdayLabel] ?? 1, hour };
}

/**
 * Returns the first moment at or after `from` that falls inside the campaign's
 * sending window, stepping forward in whole hours (max 14 days of search).
 */
export function nextSendSlot(from: Date, window: ScheduleWindow): Date {
  const timezone = window.timezone || "UTC";
  const days = window.sendDays.length ? window.sendDays : [1, 2, 3, 4, 5];
  const start = Math.min(Math.max(window.startHour, 0), 23);
  const end = Math.min(Math.max(window.endHour, start + 1), 24);

  const cursor = new Date(Math.ceil(from.getTime() / 3_600_000) * 3_600_000);
  for (let i = 0; i < 24 * 14; i += 1) {
    let parts: { weekday: number; hour: number };
    try {
      parts = zonedParts(cursor, timezone);
    } catch {
      parts = zonedParts(cursor, "UTC");
    }
    if (days.includes(parts.weekday) && parts.hour >= start && parts.hour < end) return cursor;
    cursor.setTime(cursor.getTime() + 3_600_000);
  }
  return from;
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
