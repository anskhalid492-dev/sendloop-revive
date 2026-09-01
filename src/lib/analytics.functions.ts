/**
 * Analytics server functions.
 *
 * Every number is aggregated in Postgres from real send, engagement and reply
 * rows. The aggregation functions are security definer and check workspace
 * membership themselves, so a caller can never read another workspace.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AnalyticsAccountRow,
  AnalyticsCampaignRow,
  AnalyticsSummary,
  AnalyticsTimeseriesPoint,
} from "@/lib/analytics-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const rangeInput = z.object({
  workspaceId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
});

const ZERO: AnalyticsSummary = {
  sent: 0,
  delivered: 0,
  opens: 0,
  clicks: 0,
  replies: 0,
  bounced: 0,
  unsubscribed: 0,
  complained: 0,
  failed: 0,
};

function toSummary(row: Record<string, unknown> | undefined): AnalyticsSummary {
  if (!row) return ZERO;
  return {
    sent: Number(row["sent"] ?? 0),
    delivered: Number(row["delivered"] ?? 0),
    opens: Number(row["opens"] ?? 0),
    clicks: Number(row["clicks"] ?? 0),
    replies: Number(row["replies"] ?? 0),
    bounced: Number(row["bounced"] ?? 0),
    unsubscribed: Number(row["unsubscribed"] ?? 0),
    complained: Number(row["complained"] ?? 0),
    failed: Number(row["failed"] ?? 0),
  };
}

/** Totals for the selected range plus the immediately preceding range. */
export const getAnalyticsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const from = new Date(data.from);
    const to = new Date(data.to);
    const span = Math.max(to.getTime() - from.getTime(), 60_000);
    const prevFrom = new Date(from.getTime() - span);

    // Same authoritative reader as the Campaign Overview and the dashboard,
    // so workspace totals always equal the sum of the campaign numbers.
    const { fetchCampaignStats } = await import("@/lib/campaign-stats.server");
    const sum = (rows: Iterable<import("@/lib/campaign-stats").CampaignStats>) => {
      const total = { ...ZERO };
      for (const s of rows) {
        total.sent += s.sent;
        total.delivered += s.delivered;
        total.opens += s.opened;
        total.clicks += s.clicked;
        total.replies += s.replied;
        total.bounced += s.bounced;
        total.unsubscribed += s.unsubscribed;
        total.complained += s.complained;
        total.failed += s.failed;
      }
      return total;
    };

    const [current, previous] = await Promise.all([
      fetchCampaignStats(client, { workspaceId: data.workspaceId, from, to }),
      fetchCampaignStats(client, { workspaceId: data.workspaceId, from: prevFrom, to: from }),
    ]);

    return {
      current: sum(current.byCampaign.values()),
      previous: sum(previous.byCampaign.values()),
    };

  });

/** Bucketed series for the performance chart. */
export const getAnalyticsTimeseries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    rangeInput.extend({ bucket: z.enum(["hour", "day"]).default("day") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: rows, error } = await client.rpc("analytics_timeseries", {
      _workspace_id: data.workspaceId,
      _from: new Date(data.from).toISOString(),
      _to: new Date(data.to).toISOString(),
      _bucket: data.bucket,
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      bucket: String(r["bucket"]),
      sent: Number(r["sent"] ?? 0),
      delivered: Number(r["delivered"] ?? 0),
      opens: Number(r["opens"] ?? 0),
      clicks: Number(r["clicks"] ?? 0),
      replies: Number(r["replies"] ?? 0),
      bounced: Number(r["bounced"] ?? 0),
      unsubscribed: Number(r["unsubscribed"] ?? 0),
    })) as AnalyticsTimeseriesPoint[];
  });

/** Per-campaign performance for the range. */
export const getAnalyticsByCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { fetchCampaignStats } = await import("@/lib/campaign-stats.server");
    const { byCampaign } = await fetchCampaignStats(client, {
      workspaceId: data.workspaceId,
      from: new Date(data.from),
      to: new Date(data.to),
    });

    // Open tracking is per campaign: when it is off we must show "Disabled"
    // instead of a misleading 0% open rate.
    const ids = Array.from(byCampaign.keys());
    const tracking = new Map<string, boolean>();
    if (ids.length) {
      const { data: campaigns } = await client
        .from("campaigns")
        .select("id, open_tracking")
        .in("id", ids);
      for (const c of (campaigns ?? []) as Array<Record<string, unknown>>) {
        tracking.set(String(c["id"]), Boolean(c["open_tracking"]));
      }
    }

    return Array.from(byCampaign.values())
      .map((s) => ({
        openTracking: tracking.get(s.campaignId) ?? true,
        campaignId: s.campaignId,
        name: s.name || "Untitled campaign",
        status: s.status,
        sent: s.sent,
        delivered: s.delivered,
        opens: s.opened,
        clicks: s.clicked,
        replies: s.replied,
        positiveReplies: s.positiveReplied,
        bounced: s.bounced,
        unsubscribed: s.unsubscribed,
        complained: s.complained,
        failed: s.failed,
      }))
      .sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name)) as AnalyticsCampaignRow[];
  });


/** Per-mailbox performance for the range. */
export const getAnalyticsByAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: rows, error } = await client.rpc("analytics_by_account", {
      _workspace_id: data.workspaceId,
      _from: new Date(data.from).toISOString(),
      _to: new Date(data.to).toISOString(),
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      accountId: String(r["account_id"]),
      fromEmail: String(r["from_email"] ?? ""),
      sent: Number(r["sent"] ?? 0),
      delivered: Number(r["delivered"] ?? 0),
      opens: Number(r["opens"] ?? 0),
      clicks: Number(r["clicks"] ?? 0),
      replies: Number(r["replies"] ?? 0),
      bounced: Number(r["bounced"] ?? 0),
      unsubscribed: Number(r["unsubscribed"] ?? 0),
    })) as AnalyticsAccountRow[];
  });

export type FunnelStep = "sent" | "delivered" | "opens" | "replies";

export type FunnelDrilldownRow = {
  key: string;
  email: string;
  leadId: string | null;
  leadName: string | null;
  company: string | null;
  campaignId: string | null;
  campaignName: string | null;
  occurredAt: string;
};

/**
 * Underlying deduplicated events behind one funnel step, with the related
 * leads. RLS scopes every table to the caller's workspaces; the explicit
 * workspace filter keeps the result to the selected workspace.
 */
export const getFunnelDrilldown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    rangeInput
      .extend({
        step: z.enum(["sent", "delivered", "opens", "replies"]),
        campaignId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const from = new Date(data.from).toISOString();
    const to = new Date(data.to).toISOString();

    const campaignNames = new Map<string, string>();
    const { data: campaigns } = await client
      .from("campaigns")
      .select("id, name")
      .eq("workspace_id", data.workspaceId);
    for (const c of (campaigns ?? []) as Array<{ id: string; name: string }>) {
      campaignNames.set(c.id, c.name);
    }

    const leadIds = new Set<string>();
    let rows: FunnelDrilldownRow[] = [];

    if (data.step === "sent") {
      let q = client
        .from("campaign_messages")
        .select("id, lead_id, campaign_id, to_email, sent_at")
        .eq("workspace_id", data.workspaceId)
        .eq("status", "sent")
        .gte("sent_at", from)
        .lt("sent_at", to)
        .order("sent_at", { ascending: false })
        .limit(data.limit);
      if (data.campaignId) q = q.eq("campaign_id", data.campaignId);
      const { data: msgs, error } = await q;
      if (error) throw new Error(error.message);
      rows = ((msgs ?? []) as Record<string, unknown>[]).map((m) => ({
        key: String(m["id"]),
        email: String(m["to_email"] ?? ""),
        leadId: (m["lead_id"] as string | null) ?? null,
        leadName: null,
        company: null,
        campaignId: (m["campaign_id"] as string | null) ?? null,
        campaignName: campaignNames.get(String(m["campaign_id"])) ?? null,
        occurredAt: String(m["sent_at"]),
      }));
    } else if (data.step === "replies") {
      let q = client
        .from("campaign_replies")
        .select("id, lead_id, campaign_id, from_email, received_at")
        .eq("workspace_id", data.workspaceId)
        .gte("received_at", from)
        .lt("received_at", to)
        .order("received_at", { ascending: false })
        .limit(data.limit);
      if (data.campaignId) q = q.eq("campaign_id", data.campaignId);
      const { data: reps, error } = await q;
      if (error) throw new Error(error.message);
      const seen = new Set<string>();
      for (const r of (reps ?? []) as Record<string, unknown>[]) {
        const dedupe = String(r["lead_id"] ?? r["from_email"] ?? r["id"]);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        rows.push({
          key: String(r["id"]),
          email: String(r["from_email"] ?? ""),
          leadId: (r["lead_id"] as string | null) ?? null,
          leadName: null,
          company: null,
          campaignId: (r["campaign_id"] as string | null) ?? null,
          campaignName: campaignNames.get(String(r["campaign_id"])) ?? null,
          occurredAt: String(r["received_at"]),
        });
      }
    } else {
      const eventType = data.step === "delivered" ? "delivered" : "opened";
      let q = client
        .from("email_engagement_events")
        .select("id, lead_id, campaign_id, message_id, recipient_email, occurred_at")
        .eq("workspace_id", data.workspaceId)
        .eq("event_type", eventType)
        .gte("occurred_at", from)
        .lt("occurred_at", to)
        .order("occurred_at", { ascending: false })
        .limit(data.limit * 3);
      if (data.campaignId) q = q.eq("campaign_id", data.campaignId);
      const { data: evs, error } = await q;
      if (error) throw new Error(error.message);
      // Same dedupe key the aggregation RPCs use: message_id, else recipient.
      const seen = new Set<string>();
      for (const e of (evs ?? []) as Record<string, unknown>[]) {
        const dedupe = String(e["message_id"] ?? e["recipient_email"] ?? e["id"]);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        rows.push({
          key: String(e["id"]),
          email: String(e["recipient_email"] ?? ""),
          leadId: (e["lead_id"] as string | null) ?? null,
          leadName: null,
          company: null,
          campaignId: (e["campaign_id"] as string | null) ?? null,
          campaignName: campaignNames.get(String(e["campaign_id"])) ?? null,
          occurredAt: String(e["occurred_at"]),
        });
        if (rows.length >= data.limit) break;
      }
    }

    for (const r of rows) if (r.leadId) leadIds.add(r.leadId);
    if (leadIds.size) {
      const { data: leads } = await client
        .from("leads")
        .select("id, email, first_name, last_name, company")
        .in("id", [...leadIds]);
      const byId = new Map<string, Record<string, unknown>>();
      for (const l of (leads ?? []) as Record<string, unknown>[]) {
        byId.set(String(l["id"]), l);
      }
      rows = rows.map((r) => {
        const lead = r.leadId ? byId.get(r.leadId) : undefined;
        if (!lead) return r;
        const name = [lead["first_name"], lead["last_name"]].filter(Boolean).join(" ").trim();
        return {
          ...r,
          email: r.email || String(lead["email"] ?? ""),
          leadName: name || null,
          company: (lead["company"] as string | null) ?? null,
        };
      });
    }

    return { step: data.step, total: rows.length, rows };
  });
