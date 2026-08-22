import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const workspaceInput = (input: unknown) =>
  z.object({ workspaceId: z.string().uuid() }).parse(input);

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  recipients: number;
  sent: number;
  replied: number;
  bounced: number;
};

export type ActivityItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  at: string;
};

/**
 * Every read below goes through the caller's authenticated Supabase client,
 * so workspace RLS decides what is visible — passing another workspace id in
 * the URL simply returns nothing.
 */
export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const workspaceId = data.workspaceId;

    const [membership, leads, campaigns, recipients, accounts, domains, warmupEvents] =
      await Promise.all([
      supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabase
        .from("campaigns")
        .select("id, name, status, launched_at, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("campaign_recipients")
        .select("id, campaign_id, status, last_sent_at, updated_at")
        .eq("workspace_id", workspaceId)
        .limit(5000),
      supabase
        .from("sending_accounts")
        .select(
          "id, from_email, label, health_score, warmup_status, daily_limit, sent_today, paused, customer_enabled, created_at, last_error",
        )
        .eq("workspace_id", workspaceId),
      supabase
        .from("sending_domains")
        .select("id, domain, stage, dns_status, verified_at, ready_at, created_at")
        .eq("workspace_id", workspaceId),
      supabase
        .from("warmup_events")
        .select("id, type, detail, occurred_at, sending_account_id")
        .eq("workspace_id", workspaceId)
        .order("occurred_at", { ascending: false })
        .limit(10),
    ]);

    if (!membership.data) throw new Error("Workspace not found");

    const campaignRows = campaigns.data ?? [];
    const recipientRows = recipients.data ?? [];
    const accountRows = accounts.data ?? [];
    const domainRows = domains.data ?? [];
    const warmupRows = warmupEvents.data ?? [];


    const sentStatuses = new Set(["in_progress", "completed", "replied", "bounced", "unsubscribed"]);
    const sent = recipientRows.filter((r) => sentStatuses.has(r.status)).length;
    const replied = recipientRows.filter((r) => r.status === "replied").length;
    const bounced = recipientRows.filter((r) => r.status === "bounced").length;
    const unsubscribed = recipientRows.filter((r) => r.status === "unsubscribed").length;
    const contacted = recipientRows.filter((r) => r.last_sent_at).length;

    const byCampaign = new Map<string, { sent: number; replied: number; bounced: number; total: number }>();
    for (const r of recipientRows) {
      const entry = byCampaign.get(r.campaign_id) ?? { sent: 0, replied: 0, bounced: 0, total: 0 };
      entry.total += 1;
      if (sentStatuses.has(r.status)) entry.sent += 1;
      if (r.status === "replied") entry.replied += 1;
      if (r.status === "bounced") entry.bounced += 1;
      byCampaign.set(r.campaign_id, entry);
    }

    const campaignTable: CampaignRow[] = campaignRows.slice(0, 8).map((c) => {
      const s = byCampaign.get(c.id) ?? { sent: 0, replied: 0, bounced: 0, total: 0 };
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        recipients: s.total,
        sent: s.sent,
        replied: s.replied,
        bounced: s.bounced,
      };
    });

    const accountLabel = new Map(accountRows.map((a) => [a.id, a.label || a.from_email]));

    const activity: ActivityItem[] = [
      ...campaignRows
        .filter((c) => c.launched_at)
        .map((c) => ({
          id: `campaign-${c.id}`,
          kind: "campaign",
          title: "Campaign launched",
          detail: c.name,
          at: c.launched_at as string,
        })),
      ...recipientRows
        .filter((r) => r.status === "replied")
        .slice(0, 10)
        .map((r) => ({
          id: `reply-${r.id}`,
          kind: "reply",
          title: "Reply received",
          detail: campaignRows.find((c) => c.id === r.campaign_id)?.name ?? "Campaign",
          at: r.updated_at,
        })),
      ...domainRows
        .filter((d) => d.verified_at || d.ready_at)
        .map((d) => ({
          id: `domain-${d.id}`,
          kind: "domain",
          title: "Domain verified",
          detail: d.domain,
          at: (d.ready_at ?? d.verified_at) as string,
        })),
      ...accountRows.map((a) => ({
        id: `mailbox-${a.id}`,
        kind: "mailbox",
        title: "Mailbox connected",
        detail: a.label || a.from_email,
        at: a.created_at,
      })),
      ...warmupRows.map((w) => ({
        id: `warmup-${w.id}`,
        kind: "warmup",
        title: `Warmup ${w.type.replace(/_/g, " ")}`,
        detail: w.detail || accountLabel.get(w.sending_account_id) || "Warmup activity",
        at: w.occurred_at,
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 10);

    const healthy = accountRows.filter((a) => a.health_score >= 80 && !a.paused).length;
    const warming = accountRows.filter((a) => a.warmup_status === "warming").length;
    const attention = accountRows.filter((a) => a.paused || a.health_score < 60).length;
    const issues = accountRows.filter((a) => a.last_error || a.paused).length;
    const domainsReady = domainRows.filter((d) => d.ready_at || d.verified_at).length;

    return {

      metrics: {
        leads: leads.count ?? 0,
        contacted,
        sent,
        replied,
        bounced,
        unsubscribed,
        activeCampaigns: campaignRows.filter((c) => c.status === "active").length,
        totalCampaigns: campaignRows.length,
        replyRate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
        bounceRate: sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0,
        unsubscribeRate: sent > 0 ? Math.round((unsubscribed / sent) * 1000) / 10 : 0,
      },
      sending: {
        total: accountRows.length,
        healthy,
        warming,
        attention,
        issues,
        domainsTotal: domainRows.length,
        domainsReady,
        dailyCapacity: accountRows.reduce((sum, a) => sum + (a.daily_limit ?? 0), 0),
        sentToday: accountRows.reduce((sum, a) => sum + (a.sent_today ?? 0), 0),
        overallHealth: accountRows.length
          ? Math.round(accountRows.reduce((s, a) => s + (a.health_score ?? 0), 0) / accountRows.length)
          : 0,
      },

      campaigns: campaignTable,
      activity,
      checklist: {
        hasLeads: (leads.count ?? 0) > 0,
        hasCampaign: campaignRows.length > 0,
        hasSending: accountRows.length > 0,
        hasLaunched: campaignRows.some((c) => c.launched_at),
      },
    };
  });

/** Daily send / reply series for the outreach performance chart. */
export const getOutreachSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), days: z.number().int().min(7).max(90) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);
    const { data: rows, error } = await context.supabase
      .from("campaign_recipients")
      .select("status, last_sent_at, updated_at")
      .eq("workspace_id", data.workspaceId)
      .gte("updated_at", since.toISOString())
      .limit(5000);
    if (error) throw new Error(error.message);

    const buckets = new Map<string, { date: string; sent: number; replied: number }>();
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      buckets.set(d, { date: d, sent: 0, replied: 0 });
    }
    for (const row of rows ?? []) {
      if (row.last_sent_at) {
        const key = row.last_sent_at.slice(0, 10);
        const bucket = buckets.get(key);
        if (bucket) bucket.sent += 1;
      }
      if (row.status === "replied") {
        const key = row.updated_at.slice(0, 10);
        const bucket = buckets.get(key);
        if (bucket) bucket.replied += 1;
      }
    }
    return Array.from(buckets.values());
  });

export type PulsePoint = {
  date: string;
  sent: number;
  delivered: number;
  replies: number;
  positive: number;
  meetings: number;
};

export type RecentReply = {
  id: string;
  conversationId: string | null;
  prospect: string;
  company: string | null;
  subject: string | null;
  preview: string;
  campaign: string | null;
  sentiment: string;
  at: string;
};

export type CampaignPerformance = {
  id: string;
  name: string;
  status: string;
  leads: number;
  sent: number;
  delivered: number;
  replies: number;
  positive: number;
  meetings: number;
  bounced: number;
};

export type PulseTotals = {
  sent: number;
  delivered: number;
  replies: number;
  positive: number;
  meetings: number;
  bounced: number;
  unsubscribed: number;
};

/**
 * Period-aware metrics for the dashboard overview: current window, the
 * previous window of equal length for trend arrows, a daily series for the
 * performance graph, per-campaign performance and the latest replies.
 * Everything is read through the caller's client so workspace RLS applies.
 */
export const getDashboardPulse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ workspaceId: z.string().uuid(), days: z.number().int().min(1).max(365) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const start = new Date(now - data.days * day);
    const prevStart = new Date(now - data.days * 2 * day);

    const [messages, replies, leads, campaigns, recipients] = await Promise.all([
      supabase
        .from("campaign_messages")
        .select(
          "id, sent_at, campaign_id, delivered_at, bounced_at, unsubscribed_at, replied_at",
        )
        .eq("workspace_id", data.workspaceId)
        .eq("status", "sent")
        .gte("sent_at", prevStart.toISOString())
        .limit(10000),
      supabase
        .from("campaign_replies")
        .select("id, lead_id, campaign_id, from_email, subject, body, sentiment, received_at")
        .eq("workspace_id", data.workspaceId)
        .gte("received_at", prevStart.toISOString())
        .order("received_at", { ascending: false })
        .limit(2000),
      supabase
        .from("leads")
        .select("id, email, first_name, last_name, company, crm_stage, last_activity_at")
        .eq("workspace_id", data.workspaceId)
        .in("crm_stage", ["opportunity", "customer"])
        .limit(5000),
      supabase
        .from("campaigns")
        .select("id, name, status")
        .eq("workspace_id", data.workspaceId)
        .limit(200),
      supabase
        .from("campaign_recipients")
        .select("id, campaign_id, lead_id")
        .eq("workspace_id", data.workspaceId)
        .limit(10000),
    ]);

    const messageRows = messages.data ?? [];
    const replyRows = replies.data ?? [];
    const meetingRows = (leads.data ?? []).filter((l) => l.last_activity_at);
    const campaignRows = campaigns.data ?? [];
    const recipientRows = recipients.data ?? [];
    const campaignName = new Map(campaignRows.map((c) => [c.id, c.name]));

    const inWindow = (value: string | null, from: Date) =>
      Boolean(value) && new Date(value as string) >= from;

    const count = (from: Date, to: Date): PulseTotals => {
      const within = (value: string | null) => {
        if (!value) return false;
        const t = new Date(value).getTime();
        return t >= from.getTime() && t < to.getTime();
      };
      const windowReplies = replyRows.filter((r) => within(r.received_at));
      const windowMessages = messageRows.filter((m) => within(m.sent_at));
      return {
        sent: windowMessages.length,
        delivered: windowMessages.filter((m) => m.delivered_at).length,
        replies: windowReplies.length,
        positive: windowReplies.filter((r) => r.sentiment === "positive").length,
        meetings: meetingRows.filter((l) => within(l.last_activity_at)).length,
        bounced: windowMessages.filter((m) => m.bounced_at).length,
        unsubscribed: windowMessages.filter((m) => m.unsubscribed_at).length,
      };
    };

    const current = count(start, new Date(now + day));
    const previous = count(prevStart, start);

    const buckets = new Map<string, PulsePoint>();
    for (let i = data.days - 1; i >= 0; i--) {
      const key = new Date(now - i * day).toISOString().slice(0, 10);
      buckets.set(key, { date: key, sent: 0, delivered: 0, replies: 0, positive: 0, meetings: 0 });
    }
    for (const m of messageRows) {
      if (!inWindow(m.sent_at, start)) continue;
      const b = buckets.get((m.sent_at as string).slice(0, 10));
      if (!b) continue;
      b.sent += 1;
      if (m.delivered_at) b.delivered += 1;
    }
    for (const r of replyRows) {
      if (!inWindow(r.received_at, start)) continue;
      const b = buckets.get(r.received_at.slice(0, 10));
      if (!b) continue;
      b.replies += 1;
      if (r.sentiment === "positive") b.positive += 1;
    }
    for (const l of meetingRows) {
      if (!inWindow(l.last_activity_at, start)) continue;
      const b = buckets.get((l.last_activity_at as string).slice(0, 10));
      if (b) b.meetings += 1;
    }

    // Per-campaign performance inside the selected window.
    const campaignByLead = new Map<string, string>();
    const leadsPerCampaign = new Map<string, number>();
    for (const r of recipientRows) {
      leadsPerCampaign.set(r.campaign_id, (leadsPerCampaign.get(r.campaign_id) ?? 0) + 1);
      if (r.lead_id && !campaignByLead.has(r.lead_id)) campaignByLead.set(r.lead_id, r.campaign_id);
    }

    const perf = new Map<string, CampaignPerformance>();
    const ensure = (id: string) => {
      let row = perf.get(id);
      if (!row) {
        row = {
          id,
          name: campaignName.get(id) ?? "Campaign",
          status: campaignRows.find((c) => c.id === id)?.status ?? "draft",
          leads: leadsPerCampaign.get(id) ?? 0,
          sent: 0,
          delivered: 0,
          replies: 0,
          positive: 0,
          meetings: 0,
          bounced: 0,
        };
        perf.set(id, row);
      }
      return row;
    };
    for (const m of messageRows) {
      if (!inWindow(m.sent_at, start)) continue;
      const row = ensure(m.campaign_id);
      row.sent += 1;
      if (m.delivered_at) row.delivered += 1;
      if (m.bounced_at) row.bounced += 1;
    }
    for (const r of replyRows) {
      if (!inWindow(r.received_at, start)) continue;
      const campaignId = r.campaign_id ?? (r.lead_id ? campaignByLead.get(r.lead_id) : null);
      if (!campaignId) continue;
      const row = ensure(campaignId);
      row.replies += 1;
      if (r.sentiment === "positive") row.positive += 1;
    }
    for (const l of meetingRows) {
      if (!inWindow(l.last_activity_at, start)) continue;
      const campaignId = campaignByLead.get(l.id);
      if (!campaignId) continue;
      ensure(campaignId).meetings += 1;
    }
    const campaignPerformance = Array.from(perf.values())
      .sort((a, b) => b.sent - a.sent || b.replies - a.replies)
      .slice(0, 6);

    const leadIds = Array.from(new Set(replyRows.slice(0, 8).map((r) => r.lead_id).filter((x): x is string => Boolean(x))));
    const [leadLookup, conversationLookup] = await Promise.all([
      leadIds.length
        ? supabase
            .from("leads")
            .select("id, email, first_name, last_name, company")
            .in("id", leadIds)
        : Promise.resolve({ data: [] as { id: string; email: string; first_name: string | null; last_name: string | null; company: string | null }[] }),
      leadIds.length
        ? supabase
            .from("conversations")
            .select("id, lead_id, last_message_at")
            .eq("workspace_id", data.workspaceId)
            .in("lead_id", leadIds)
            .order("last_message_at", { ascending: false })
        : Promise.resolve({ data: [] as { id: string; lead_id: string | null }[] }),
    ]);
    const leadById = new Map((leadLookup.data ?? []).map((l) => [l.id, l]));
    const conversationByLead = new Map<string, string>();
    for (const c of conversationLookup.data ?? []) {
      if (c.lead_id && !conversationByLead.has(c.lead_id)) conversationByLead.set(c.lead_id, c.id);
    }

    const recentReplies: RecentReply[] = replyRows.slice(0, 8).map((r) => {
      const lead = r.lead_id ? leadById.get(r.lead_id) : undefined;
      const name = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ");
      return {
        id: r.id,
        conversationId: (r.lead_id ? conversationByLead.get(r.lead_id) : null) ?? null,
        prospect: name || lead?.email || r.from_email,
        company: lead?.company ?? null,
        subject: r.subject ?? null,
        preview: (r.body ?? r.subject ?? "").replace(/\s+/g, " ").slice(0, 160),
        campaign: r.campaign_id ? (campaignName.get(r.campaign_id) ?? null) : null,
        sentiment: r.sentiment,
        at: r.received_at,
      };
    });

    return {
      days: data.days,
      current: { ...current, activeCampaigns: campaignRows.filter((c) => c.status === "active").length },
      previous,
      series: Array.from(buckets.values()),
      campaigns: campaignPerformance,
      recentReplies,
    };
  });

