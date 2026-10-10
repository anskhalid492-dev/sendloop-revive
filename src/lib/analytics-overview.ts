import { computeAccountTotals, type Unit } from "@/lib/campaign-stats";
import type { AnalyticsSummary, AnalyticsTimeseriesPoint } from "@/lib/analytics-model";

export const ENGAGEMENT_SERIES = [
  { key: "sent", label: "Emails sent", color: "var(--primary)", dot: "bg-primary" },
  { key: "opens", label: "Opens", color: "var(--chart-3)", dot: "bg-chart-3" },
  { key: "clicks", label: "Clicks", color: "var(--chart-4)", dot: "bg-chart-4" },
  { key: "replies", label: "Replies", color: "var(--chart-5)", dot: "bg-chart-5" },
] as const;

export function summarizeEngagement(units: Unit[], from: Date, to: Date): Partial<AnalyticsSummary> {
  const inRange = (iso: string | null) => Boolean(iso && Date.parse(iso) >= +from && Date.parse(iso) < +to);
  const people = (predicate: (u: Unit) => boolean) => new Set(units.filter(predicate).map(u => u.leadKey)).size;
  const accounts = computeAccountTotals(units, { from, to });
  const sent = units.filter(u => inRange(u.sentAt)).length;
  const confirmed = units.filter(u => inRange(u.signals.delivered_at) && !u.signals.bounced_at && !u.signals.failed_at).length;
  return {
    sent,
    contacted: people(u => inRange(u.sentAt)),
    delivered: confirmed,
    deliveryComplete: sent > 0 && units.filter(u => inRange(u.sentAt) && Boolean(u.signals.delivered_at || u.signals.bounced_at)).length === sent,
    opens: people(u => inRange(u.signals.opened_at)),
    clicks: people(u => inRange(u.signals.clicked_at)),
    replies: people(u => inRange(u.signals.replied_at)),
    bounced: accounts.reduce((n, a) => n + a.bounced, 0),
    unsubscribed: accounts.reduce((n, a) => n + a.unsubscribed, 0),
  };
}

/** Real observations, one person per series per bucket; gaps are zero, never synthetic curves. */
export function engagementTrend(units: Unit[], from: Date, to: Date, bucket: "hour" | "day"): AnalyticsTimeseriesPoint[] {
  const step = bucket === "hour" ? 3_600_000 : 86_400_000;
  const points = new Map<number, AnalyticsTimeseriesPoint>();
  const seen = new Set<string>();
  for (let at = Math.floor(+from / step) * step; at < +to; at += step) {
    points.set(at, { bucket: new Date(at).toISOString(), sent: 0, delivered: 0, opens: 0, clicks: 0, replies: 0, bounced: 0, unsubscribed: 0 });
  }
  for (const u of units) {
    for (const [field, iso] of Object.entries({ sent: u.sentAt, delivered: u.signals.delivered_at, opens: u.signals.opened_at, clicks: u.signals.clicked_at, replies: u.signals.replied_at, bounced: u.signals.bounced_at, unsubscribed: u.signals.unsubscribed_at })) {
      const at = iso ? Date.parse(iso) : NaN;
      if (at < +from || at >= +to || !Number.isFinite(at)) continue;
      const key = Math.floor(at / step) * step;
      const identity = `${key}:${field}:${u.leadKey}`;
      if (field !== "sent" && seen.has(identity)) continue;
      seen.add(identity);
      const p = points.get(key);
      if (p) p[field as Exclude<keyof AnalyticsTimeseriesPoint, "bucket">] += 1;
    }
  }
  return [...points.values()];
}

export function uniqueReplyIntents(rows: Array<Record<string, unknown>>) {
  const people = new Map<string, string>();
  // Reader orders newest first: the latest stored (possibly human corrected) intent wins.
  for (const r of rows) {
    const key = String(r["lead_id"] ?? r["from_email"] ?? "").trim().toLowerCase();
    if (key && !people.has(key)) people.set(key, String(r["sentiment"] ?? "unclassified"));
  }
  return {
    replies: people.size,
    positiveReplies: [...people.values()].filter(v => v === "positive").length,
    negativeReplies: [...people.values()].filter(v => v === "negative" || v === "unsubscribe").length,
  };
}