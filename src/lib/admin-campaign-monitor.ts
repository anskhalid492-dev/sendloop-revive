/**
 * Admin → Campaigns monitoring model (pure, client-safe, no IO).
 *
 * One place decides how a campaign message is classified so the KPI cards,
 * the table and the detail drawer can never disagree:
 *
 *   Unknown   – held with `send_outcome_unknown_after_interrupt`; never
 *               counted as sent, failed or bounced.
 *   Bounced   – `bounced_at` set, or a bounce engagement event for the message.
 *   Sent      – accepted by the mailbox/provider (`status = 'sent'`).
 *   Failed    – `status = 'failed'` that is neither bounced nor unknown.
 *   Delivered – estimate: sent minus bounces of those sent emails (the shared
 *               `deliveredCount` rule). No SMTP provider confirms delivery.
 *
 * Rates use the shared helpers in `engagement-rates.ts`.
 */
import {
  bounceRatePercent,
  clickRatePercent,
  deliveredCount,
  openRatePercent,
  ratePercent,
  replyRatePercent,
} from "@/lib/engagement-rates";

export type MessageFacts = {
  id?: string;
  status: string | null;
  sent_at?: string | null;
  bounced_at?: string | null;
  delivered_at?: string | null;
};

export type MessageClass = "sent" | "sent_bounced" | "bounced_rejected" | "failed" | "unknown" | "other";

export function classifyMessage(
  m: MessageFacts,
  opts: { unknown?: boolean; bounceEvent?: boolean } = {},
): MessageClass {
  const bounced = Boolean(m.bounced_at) || Boolean(opts.bounceEvent);
  if (bounced) return (m.sent_at || m.status === "sent") ? "sent_bounced" : "bounced_rejected";
  if (m.delivered_at) return "sent";
  if (opts.unknown) return "unknown";
  if (m.sent_at && m.status !== "failed") return "sent";
  if (m.status === "sent") return "sent";
  if (bounced) return "bounced_rejected";
  if (m.status === "failed") return "failed";
  return "other";
}

export type SendTotals = {
  sent: number;
  /** Bounces among accepted sends plus SMTP-time bounce rejections. */
  bounced: number;
  /** Bounces of emails that were accepted (status sent). */
  bouncedAfterSend: number;
  failed: number;
  unknown: number;
};

export function emptyTotals(): SendTotals {
  return { sent: 0, bounced: 0, bouncedAfterSend: 0, failed: 0, unknown: 0 };
}

export function addClass(t: SendTotals, c: MessageClass): void {
  if (c === "sent") t.sent += 1;
  else if (c === "sent_bounced") {
    t.sent += 1;
    t.bounced += 1;
    t.bouncedAfterSend += 1;
  } else if (c === "bounced_rejected") t.bounced += 1;
  else if (c === "failed") t.failed += 1;
  else if (c === "unknown") t.unknown += 1;
}

export type CampaignMetrics = SendTotals & {
  leads: number;
  /** Unique people emailed; defaults to sent when unknown (single-step). */
  contacted?: number;
  opens: number;
  clicks: number;
  replies: number;
  positiveReplies: number;
  unsubscribes: number;
};

export type DerivedRates = {
  delivered: number;
  deliveryRate: number | null;
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  bounceRate: number | null;
};

/** Rates are null (shown as "—") when nothing was sent — never 0% invented. */
export function deriveRates(m: CampaignMetrics): DerivedRates {
  const base = { sent: m.sent, bounced: m.bouncedAfterSend };
  // People-based base for engagement rates: unique people emailed minus
  // bounces, so multi-step sequences never dilute the rate.
  const people = { contacted: m.contacted ?? m.sent, bounced: m.bouncedAfterSend };
  const delivered = deliveredCount(base);
  const attempted = m.sent + (m.bounced - m.bouncedAfterSend);
  if (m.sent <= 0) {
    return {
      delivered,
      deliveryRate: null,
      openRate: null,
      clickRate: null,
      replyRate: null,
      bounceRate: attempted > 0 ? bounceRatePercent(m.bounced, attempted) : null,
    };
  }
  return {
    delivered,
    deliveryRate: ratePercent(delivered, m.sent),
    openRate: openRatePercent(m.opens, people),
    clickRate: clickRatePercent(m.clicks, people),
    replyRate: replyRatePercent(m.replies, people),
    bounceRate: bounceRatePercent(m.bounced, attempted),
  };
}

export type KpiRow = CampaignMetrics & { status: string };

export type KpiTotals = CampaignMetrics &
  DerivedRates & {
    campaigns: number;
    active: number;
    paused: number;
    completed: number;
  };

export function sumKpis(rows: readonly KpiRow[]): KpiTotals {
  const m: CampaignMetrics = {
    ...emptyTotals(),
    leads: 0,
    opens: 0,
    clicks: 0,
    replies: 0,
    positiveReplies: 0,
    unsubscribes: 0,
  };
  let active = 0;
  let paused = 0;
  let completed = 0;
  for (const r of rows) {
    m.sent += r.sent;
    m.contacted = (m.contacted ?? 0) + (r.contacted ?? r.sent);
    m.bounced += r.bounced;
    m.bouncedAfterSend += r.bouncedAfterSend;
    m.failed += r.failed;
    m.unknown += r.unknown;
    m.leads += r.leads;
    m.opens += r.opens;
    m.clicks += r.clicks;
    m.replies += r.replies;
    m.positiveReplies += r.positiveReplies;
    m.unsubscribes += r.unsubscribes;
    if (r.status === "active") active += 1;
    else if (r.status === "paused") paused += 1;
    else if (r.status === "completed") completed += 1;
  }
  return { ...m, ...deriveRates(m), campaigns: rows.length, active, paused, completed };
}

/**
 * Week-over-week trend from real dated rows. Returns null unless the previous
 * window has data, so no comparison is ever invented.
 */
export function weekTrend(
  dates: readonly (string | null | undefined)[],
  now: Date = new Date(),
): { current: number; previous: number; changePct: number } | null {
  const end = now.getTime();
  const week = 7 * 86_400_000;
  let current = 0;
  let previous = 0;
  for (const d of dates) {
    if (!d) continue;
    const t = Date.parse(d);
    if (Number.isNaN(t) || t > end) continue;
    if (t > end - week) current += 1;
    else if (t > end - 2 * week) previous += 1;
  }
  if (previous === 0) return null;
  return { current, previous, changePct: Math.round(((current - previous) / previous) * 1000) / 10 };
}

/** Daily buckets (UTC) for the last `days` days, oldest first. */
export function dailySeries(
  events: readonly { at: string | null | undefined; kind: "sent" | "bounced" | "failed" }[],
  days: number,
  now: Date = new Date(),
): { day: string; sent: number; bounced: number; failed: number }[] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const out = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { day: d.toISOString().slice(0, 10), sent: 0, bounced: 0, failed: 0 };
  });
  const index = new Map(out.map((o, i) => [o.day, i]));
  for (const e of events) {
    if (!e.at) continue;
    const i = index.get(e.at.slice(0, 10));
    if (i === undefined) continue;
    out[i]![e.kind] += 1;
  }
  return out;
}

/** SMTP reply / enhanced status code found in an error, e.g. "550 5.7.1". */
export function smtpCode(error: string | null | undefined): string | null {
  const text = error ?? "";
  const enhanced = /\b([245]\.\d{1,3}\.\d{1,3})\b/.exec(text)?.[1];
  const basic = /\b([45]\d\d)\b/.exec(text)?.[1];
  if (basic && enhanced) return `${basic} ${enhanced}`;
  return basic ?? enhanced ?? null;
}

/** Short, groupable label for an error message (codes and addresses removed). */
export function errorLabel(error: string | null | undefined): string {
  const text = String(error ?? "").trim();
  if (!text) return "Unspecified error";
  return (
    text
      .replace(/[\w.+-]+@[\w.-]+/g, "<email>")
      .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "<id>")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "Unspecified error"
  );
}

export function topCounts(values: readonly (string | null | undefined)[], limit = 8) {
  const map = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

/* ------------------------------------------------------------- table */

export type SortDir = "asc" | "desc";

export function sortRows<T extends Record<string, unknown>>(rows: readonly T[], key: keyof T, dir: SortDir): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    // Missing values ("—") always sink to the bottom.
    if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    return String(av).localeCompare(String(bv)) * mul;
  });
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return { pages, page: current, rows: rows.slice((current - 1) * pageSize, current * pageSize) };
}

export type CampaignType = "ai" | "standard";
export function campaignType(aiEnabled: boolean | null | undefined): CampaignType {
  return aiEnabled ? "ai" : "standard";
}

/** Admin actions available for a status. Stop is the destructive one. */
export function allowedActions(status: string): ("pause" | "resume" | "stop")[] {
  const out: ("pause" | "resume" | "stop")[] = [];
  if (status === "active") out.push("pause");
  if (status === "paused") out.push("resume");
  if (status === "active" || status === "paused") out.push("stop");
  return out;
}

/** Same rule as the send pipeline's outcome-unknown marker. */
export function isUnknownError(error: string | null | undefined): boolean {
  return Boolean(error && error.startsWith("send_outcome_unknown_after_interrupt"));
}
