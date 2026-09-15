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
  /** Optional campaign filter shared by every section of the page. */
  campaignId: z.string().uuid().nullish(),
  /** Optional mailbox (sending account) filter. */
  accountId: z.string().uuid().nullish(),
});

type RangeInput = z.infer<typeof rangeInput>;

/** Campaign scope for the shared stats reader. */
function campaignScope(data: RangeInput) {
  return data.campaignId ? { campaignIds: [data.campaignId] } : {};
}

/**
 * The de-duplicated message units for the selected range and filters. Every
 * section derives its numbers from these, so the page is internally
 * consistent whatever combination of filters is applied.
 */
async function loadUnits(client: Client, data: RangeInput) {
  const from = new Date(data.from);
  const to = new Date(data.to);
  const [{ fetchCampaignStats }, { collapseMessageUnits }] = await Promise.all([
    import("@/lib/campaign-stats.server"),
    import("@/lib/campaign-stats"),
  ]);
  const bundle = await fetchCampaignStats(client, {
    workspaceId: data.workspaceId,
    ...campaignScope(data),
    from,
    to,
  });
  const all = Array.from(collapseMessageUnits(bundle.messages, bundle.signals).values());
  const units = data.accountId ? all.filter((u) => u.accountId === data.accountId) : all;
  return { bundle, units, from, to };
}

const ZERO: AnalyticsSummary = {
  sent: 0,
  delivered: 0,
  opens: 0,
  clicks: 0,
  replies: 0,
  positiveReplies: 0,
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
    positiveReplies: Number(row["positive_replied"] ?? row["positiveReplies"] ?? 0),
    bounced: Number(row["bounced"] ?? 0),
    unsubscribed: Number(row["unsubscribed"] ?? 0),
    complained: Number(row["complained"] ?? 0),
    failed: Number(row["failed"] ?? 0),
  };
}

/** Reply rows for the range, honouring the campaign and mailbox filters. */
async function fetchReplyRows(client: Client, data: RangeInput, from: Date, to: Date) {
  let q = client
    .from("campaign_replies")
    .select("id, campaign_id, sending_account_id, lead_id, from_email, subject, sentiment, received_at")
    .eq("workspace_id", data.workspaceId)
    .gte("received_at", from.toISOString())
    .lt("received_at", to.toISOString())
    .order("received_at", { ascending: false })
    .limit(2000);
  if (data.campaignId) q = q.eq("campaign_id", data.campaignId);
  if (data.accountId) q = q.eq("sending_account_id", data.accountId);
  const { data: rows, error } = await q;
  if (error) return [] as Array<Record<string, unknown>>;
  return (rows ?? []) as Array<Record<string, unknown>>;
}

export type ReplyCategory = "positive" | "neutral" | "negative" | "out_of_office" | "unsubscribe";

/** Map a stored sentiment onto the five reply-intelligence buckets. */
export function replyCategory(sentiment: unknown): ReplyCategory {
  const value = String(sentiment ?? "").trim().toLowerCase();
  if (value.includes("unsub") || value.includes("opt_out") || value.includes("opt-out")) {
    return "unsubscribe";
  }
  if (value.includes("out_of_office") || value.includes("out-of-office") || value === "ooo" || value.includes("auto")) {
    return "out_of_office";
  }
  if (value.includes("positive") || value.includes("interested") || value.includes("meeting")) {
    return "positive";
  }
  if (value.includes("negative") || value.includes("not_interested") || value.includes("reject")) {
    return "negative";
  }
  return "neutral";
}

/** Meetings booked in the range (lead activity written by the booking flows). */
async function countMeetings(client: Client, data: RangeInput, from: Date, to: Date) {
  let q = client
    .from("lead_activities")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", data.workspaceId)
    .eq("type", "meeting_booked")
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString());
  if (data.campaignId) q = q.eq("campaign_id", data.campaignId);
  const { count, error } = await q;
  if (error) return null;
  return Number(count ?? 0);
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
    const { collapseMessageUnits, computeAccountTotals } = await import("@/lib/campaign-stats");
    const sum = (rows: Iterable<import("@/lib/campaign-stats").CampaignStats>) => {
      const total = { ...ZERO };
      for (const s of rows) {
        total.sent += s.sent;
        total.delivered += s.delivered;
        total.opens += s.opened;
        total.clicks += s.clicked;
        total.replies += s.replied;
        total.positiveReplies += s.positiveReplied;
        total.bounced += s.bounced;
        total.unsubscribed += s.unsubscribed;
        total.complained += s.complained;
        total.failed += s.failed;
      }
      return total;
    };

    const scope = campaignScope(data);
    const [current, previous, meetings] = await Promise.all([
      fetchCampaignStats(client, { workspaceId: data.workspaceId, ...scope, from, to }),
      fetchCampaignStats(client, {
        workspaceId: data.workspaceId,
        ...scope,
        from: prevFrom,
        to: from,
      }),
      countMeetings(client, data, from, to),
    ]);

    if (!data.accountId) {
      return {
        current: sum(current.byCampaign.values()),
        previous: sum(previous.byCampaign.values()),
        meetings,
      };
    }

    // Mailbox filter: derive the same metrics from the units that belong to
    // that mailbox, and take reply intent from the replies it received.
    const scoped = async (
      bundle: Awaited<ReturnType<typeof fetchCampaignStats>>,
      lo: Date,
      hi: Date,
    ): Promise<AnalyticsSummary> => {
      const units = Array.from(
        collapseMessageUnits(bundle.messages, bundle.signals).values(),
      ).filter((u) => u.accountId === data.accountId);
      const totals = computeAccountTotals(units, { from: lo, to: hi })[0];
      const replies = await fetchReplyRows(client, data, lo, hi);
      const positive = replies.filter((r) => replyCategory(r["sentiment"]) === "positive").length;
      return {
        ...ZERO,
        sent: totals?.sent ?? 0,
        delivered: totals?.delivered ?? 0,
        opens: totals?.opens ?? 0,
        clicks: totals?.clicks ?? 0,
        replies: totals?.replies ?? 0,
        positiveReplies: positive,
        bounced: totals?.bounced ?? 0,
        unsubscribed: totals?.unsubscribed ?? 0,
        failed: totals?.failed ?? 0,
      };
    };

    return {
      current: await scoped(current, from, to),
      previous: await scoped(previous, prevFrom, from),
      meetings,
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
    const { computeTimeseries } = await import("@/lib/campaign-stats");
    const { units, from, to } = await loadUnits(client, data);
    return computeTimeseries(units, {
      bucket: data.bucket,
      from,
      to,
    }) as AnalyticsTimeseriesPoint[];
  });


/** Per-campaign performance for the range. */
export const getAnalyticsByCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { fetchCampaignStats } = await import("@/lib/campaign-stats.server");
    const from = new Date(data.from);
    const to = new Date(data.to);
    const { byCampaign } = await fetchCampaignStats(client, {
      workspaceId: data.workspaceId,
      ...campaignScope(data),
      from,
      to,
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

    let rows = Array.from(byCampaign.values()).map((s) => ({
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
      negativeReplies: s.negativeReplied,
      outOfOfficeReplies: s.outOfOfficeReplied,
      bounced: s.bounced,
      unsubscribed: s.unsubscribed,
      complained: s.complained,
      failed: s.failed,
    }));

    // With a mailbox filter the table must only report what that mailbox did,
    // recomputed from the same de-duplicated units as everything else.
    if (data.accountId) {
      const { computeUnitTotals } = await import("@/lib/analytics-sequence");
      const { units } = await loadUnits(client, data);
      const byId = new Map<string, typeof units>();
      for (const unit of units) {
        if (!unit.campaignId) continue;
        const list = byId.get(unit.campaignId) ?? [];
        list.push(unit);
        byId.set(unit.campaignId, list);
      }
      const replies = await fetchReplyRows(client, data, from, to);
      rows = rows
        .filter((row) => byId.has(row.campaignId))
        .map((row) => {
          const totals = computeUnitTotals(byId.get(row.campaignId) ?? [], { from, to });
          const scopedReplies = replies.filter(
            (r) => String(r["campaign_id"] ?? "") === row.campaignId,
          );
          const count = (category: string) =>
            scopedReplies.filter((r) => replyCategory(r["sentiment"]) === category).length;
          return {
            ...row,
            ...totals,
            positiveReplies: count("positive"),
            negativeReplies: count("negative"),
            outOfOfficeReplies: count("out_of_office"),
          };
        });
    }

    return rows.sort(
      (a, b) => b.sent - a.sent || a.name.localeCompare(b.name),
    ) as AnalyticsCampaignRow[];
  });


/** Per-mailbox performance for the range. */
export const getAnalyticsByAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const from = new Date(data.from);
    const to = new Date(data.to);
    const [{ fetchCampaignStats }, { collapseMessageUnits, computeAccountTotals }] =
      await Promise.all([
        import("@/lib/campaign-stats.server"),
        import("@/lib/campaign-stats"),
      ]);
    const bundle = await fetchCampaignStats(client, { workspaceId: data.workspaceId, from, to });
    const totals = computeAccountTotals(
      collapseMessageUnits(bundle.messages, bundle.signals).values(),
      { from, to },
    );

    const emails = new Map<string, string>();
    if (totals.length) {
      const { data: accounts } = await client
        .from("sending_accounts")
        .select("id, from_email")
        .in(
          "id",
          totals.map((t) => t.accountId),
        );
      for (const a of (accounts ?? []) as Array<Record<string, unknown>>) {
        emails.set(String(a["id"]), String(a["from_email"] ?? ""));
      }
    }

    return totals
      .map((t) => ({
        accountId: t.accountId,
        fromEmail: emails.get(t.accountId) ?? "",
        sent: t.sent,
        delivered: t.delivered,
        opens: t.opens,
        clicks: t.clicks,
        replies: t.replies,
        bounced: t.bounced,
        unsubscribed: t.unsubscribed,
      }))
      .sort((a, b) => b.sent - a.sent) as AnalyticsAccountRow[];
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
