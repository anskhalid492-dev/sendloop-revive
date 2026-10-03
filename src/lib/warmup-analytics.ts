/**
 * Admin Warmup Analytics — pure aggregation over `warmup_daily_stats`.
 *
 * Source of truth: the warmup engine's own per-mailbox/per-UTC-day rollup.
 *   sent      → incremented only when the provider accepted a warmup send
 *   delivered → confirmed arrivals only (see warmup-delivery-tracking.sql)
 *   failed    → failed + bounced
 * Queued / scheduled / deferred / not-received rows are never counted.
 */

export type StatRow = {
  sending_account_id: string;
  workspace_id: string;
  day: string; // YYYY-MM-DD (UTC)
  sent: number;
  delivered: number;
  failed: number;
  bounced: number;
};

export type Totals = { sent: number; delivered: number; failed: number; deliveryRate: number | null };

export const RANGE_PRESETS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "this_month",
  "last_month",
  "custom",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

const DAY_MS = 86_400_000;

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS));
}

/** Monday of the UTC week containing `day`. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Inclusive UTC day range for a preset. */
export function presetRange(preset: Exclude<RangePreset, "custom">, today: string): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "this_month":
      return { from: monthStart(today), to: today };
    case "last_month": {
      const end = addDays(monthStart(today), -1);
      return { from: monthStart(end), to: end };
    }
  }
}

/** Delivered / Sent × 100, one decimal; null when nothing was sent. */
export function deliveryRate(delivered: number, sent: number): number | null {
  if (!sent || sent <= 0) return null;
  return Math.round((delivered / sent) * 1000) / 10;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate.toFixed(1)}%`;
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

export function totalsOf(rows: StatRow[]): Totals {
  let sent = 0;
  let delivered = 0;
  let failed = 0;
  for (const r of rows) {
    sent += n(r.sent);
    delivered += n(r.delivered);
    failed += n(r.failed) + n(r.bounced);
  }
  return { sent, delivered, failed, deliveryRate: deliveryRate(delivered, sent) };
}

/** Sum rows per key (workspace or mailbox). */
export function groupTotals(rows: StatRow[], key: (r: StatRow) => string): Map<string, Totals> {
  const groups = new Map<string, StatRow[]>();
  for (const r of rows) {
    const k = key(r);
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  const out = new Map<string, Totals>();
  for (const [k, list] of groups) out.set(k, totalsOf(list));
  return out;
}

export type SeriesPoint = { bucket: string; sent: number; delivered: number; failed: number };

/** Daily buckets up to 62 days, weekly (Monday) beyond. Every bucket in range is present. */
export function buildSeries(rows: StatRow[], from: string, to: string): { grouping: "day" | "week"; points: SeriesPoint[] } {
  const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  const grouping = span > 62 ? "week" : "day";
  const bucketOf = (day: string) => (grouping === "week" ? weekStart(day) : day);
  const map = new Map<string, SeriesPoint>();
  for (let d = bucketOf(from); d <= to; d = addDays(d, grouping === "week" ? 7 : 1)) {
    map.set(d, { bucket: d, sent: 0, delivered: 0, failed: 0 });
  }
  for (const r of rows) {
    if (r.day < from || r.day > to) continue;
    const p = map.get(bucketOf(r.day));
    if (!p) continue;
    p.sent += n(r.sent);
    p.delivered += n(r.delivered);
    p.failed += n(r.failed) + n(r.bounced);
  }
  return { grouping, points: [...map.values()] };
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return { rows: items.slice((current - 1) * pageSize, current * pageSize), total, page: current, pages, pageSize };
}

/** Same state rule the Mailboxes tab uses. */
export function warmupState(s: { enabled: boolean; paused_by_system?: boolean | null }, accountStatus?: string | null) {
  if (!s.enabled) return "stopped";
  if (s.paused_by_system) return "paused";
  return accountStatus ?? "warming";
}
