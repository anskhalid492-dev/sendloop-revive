import { collapseMessageUnits, computeAccountTotals, type CampaignMessageRow, type MessageEventSignals, type Unit } from "@/lib/campaign-stats";
import type { AnalyticsSummary, AnalyticsTimeseriesPoint } from "@/lib/analytics-model";

export const ENGAGEMENT_SERIES = [
  { key: "sent", label: "Emails sent", color: "var(--primary)", dot: "bg-primary" },
  { key: "opens", label: "Opens", color: "var(--chart-3)", dot: "bg-chart-3" },
  { key: "positiveReplies", label: "Positive replies", color: "var(--chart-4)", dot: "bg-chart-4" },
  { key: "replies", label: "Replies", color: "var(--chart-5)", dot: "bg-chart-5" },
] as const;

/** Analytics can span campaigns: never collapse two campaigns' emails together. */
export function collapseAnalyticsUnits(messages: CampaignMessageRow[], events?: MessageEventSignals): Unit[] {
  const groups = new Map<string, CampaignMessageRow[]>();
  for (const message of messages) {
    const key = message.campaign_id ?? "";
    const rows = groups.get(key) ?? [];
    rows.push(message);
    groups.set(key, rows);
  }
  return [...groups.values()].flatMap(rows => [...collapseMessageUnits(rows, events).values()]);
}

export function summarizeEngagement(units: Unit[], from: Date, to: Date): Partial<AnalyticsSummary> {
  const inRange = (iso: string | null) => Boolean(iso && Date.parse(iso) >= +from && Date.parse(iso) < +to);
  const people = (predicate: (u: Unit) => boolean) => new Set(units.filter(predicate).map(u => u.leadKey)).size;
  const accounts = computeAccountTotals(units, { from, to });
  const sent = units.filter(u => inRange(u.sentAt)).length;
  const confirmed = units.filter(u => inRange(u.signals.delivered_at) && !u.signals.bounced_at ).length;
  // Legacy failures have a known outcome but no trustworthy occurrence date.
  // Keep them visible separately; never assign them to a period via updated_at.
  const undatedFailed = units.filter(u => !u.held && !u.sentAt && !u.signals.bounced_at && !u.signals.delivered_at && u.status === "failed" && !u.signals.failed_at).length;
  return {
    sent,
    contacted: people(u => inRange(u.sentAt)),
    delivered: confirmed,
    deliveryComplete: sent > 0 && units.filter(u => inRange(u.sentAt) && Boolean(u.signals.delivered_at || u.signals.bounced_at)).length === sent,
    // A mutable updated_at must not move an old failure into this window.
    // Includes sends the provider rejected after accepting them (dated by failed_at).
    held: units.filter(u => u.held && !u.signals.bounced_at && !u.signals.delivered_at).length,
    failed: units.filter(u => !u.held && !u.signals.delivered_at && !u.signals.bounced_at && inRange(u.signals.failed_at) && (!u.sentAt || u.rejectedAfterSend === true)).length,
    undatedFailed,
    failureHistoryIncomplete: undatedFailed > 0,
    opens: people(u => inRange(u.signals.opened_at)),
    clicks: people(u => inRange(u.signals.clicked_at)),
    replies: people(u => inRange(u.signals.replied_at)),
    bounced: units.filter(u => inRange(u.signals.bounced_at)).length,
    unsubscribed: accounts.reduce((n, a) => n + a.unsubscribed, 0),
  };
}

/** Real observations, one person per series per bucket; gaps are zero, never synthetic curves. */
export function engagementTrend(units: Unit[], from: Date, to: Date, bucket: "hour" | "day"): AnalyticsTimeseriesPoint[] {
  const step = bucket === "hour" ? 3_600_000 : 86_400_000;
  const points = new Map<number, AnalyticsTimeseriesPoint>();
  const seen = new Set<string>();
  for (let at = Math.floor(+from / step) * step; at < +to; at += step) {
    points.set(at, { bucket: new Date(at).toISOString(), sent: 0, delivered: 0, opens: 0, clicks: 0, replies: 0, positiveReplies: 0, bounced: 0, unsubscribed: 0 });
  }
  for (const u of units) {
    for (const [field, iso] of Object.entries({ sent: u.sentAt, delivered: u.signals.bounced_at ? null : u.signals.delivered_at, opens: u.signals.opened_at, clicks: u.signals.clicked_at, replies: u.signals.replied_at, bounced: u.signals.bounced_at, unsubscribed: u.signals.unsubscribed_at })) {
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

/**
 * Positive replies per bucket, keyed by the same bucket string engagementTrend uses.
 * Same positive rule as uniqueReplyIntents, so the chart matches the summary card.
 */
export function positiveReplyTrend(rows: Array<Record<string, unknown>>, from: Date, to: Date, bucket: "hour" | "day"): Map<string, number> {
  const step = bucket === "hour" ? 3_600_000 : 86_400_000;
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (String(r["sentiment"] ?? "").trim().toLowerCase() !== "positive") continue;
    const at = Date.parse(String(r["received_at"] ?? ""));
    if (!Number.isFinite(at) || at < +from || at >= +to) continue;
    const key = new Date(Math.floor(at / step) * step).toISOString();
    const person = String(r["lead_id"] ?? r["from_email"] ?? "").trim().toLowerCase();
    if (!person) continue;
    const identity = `${key}:${person}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
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