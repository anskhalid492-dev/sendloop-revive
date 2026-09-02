/**
 * Presentation helpers for campaign scheduling numbers.
 *
 * Campaign timestamps are ALWAYS shown in the campaign's own timezone: a
 * browser-local rendering turns 19:00 IST into "7:30 AM" for a US viewer and
 * makes the schedule look broken. And the queue counters come from the
 * authoritative message statistics (same source as Campaign Analytics), never
 * from `campaign_recipients.status`.
 */

export function formatInCampaignTimezone(
  value: string | Date | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const tz = timezone || "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  }
}

export type QueueCounters = {
  scheduled: number;
  processing: number;
  sent: number;
  failed: number;
  cancelled: number;
};

/** Authoritative queue counters from campaign message statistics. */
export function queueCounters(delivery: Partial<QueueCounters> | null | undefined): QueueCounters {
  const n = (value: unknown) => Math.max(0, Number(value ?? 0) || 0);
  return {
    scheduled: n(delivery?.scheduled),
    processing: n(delivery?.processing),
    sent: n(delivery?.sent),
    failed: n(delivery?.failed),
    cancelled: n(delivery?.cancelled),
  };
}
