/**
 * Dashboard command center aggregation.
 *
 * Reads run through the caller's authenticated Supabase client, so workspace
 * RLS decides what is visible. Nothing here writes, schedules or changes any
 * sending/campaign/mailbox behaviour — it only reads the same tables the
 * engine already maintains and shapes them for the dashboard.
 *
 * Metric rules honoured here:
 *  - "Today" always means the campaign's own local sending day.
 *  - Lifetime totals are never mixed into today's KPIs.
 *  - Campaign state comes from `campaignRunStatus`, so reaching a daily quota
 *    is never rendered as "Completed".
 *  - Mailbox capacity uses the rolling 12-hour window model.
 */
import { campaignRunStatus, isRetryableFailure } from "@/lib/campaign-run-state";
import { zonedStartOfDay } from "@/lib/campaign-schedule";
import {
  MAILBOX_WINDOW_HOURS,
  mailboxWindowStart,
} from "@/lib/mailbox-daily-usage";
import {
  SAFETY_WINDOW_DAYS,
  evaluateMailboxSafety,
  type SafetyStatRow,
} from "@/lib/mailbox-pause-state";
import {
  EMPTY_TOTALS,
  buildActionItems,
  buildFunnel,
  buildInsights,
  pct,
  rankCampaigns,
  type ActionItem,
  type CampaignRow,
  type FunnelStep,
  type Insight,
  type MailboxRow,
  type PeriodTotals,
  type SendingHealth,
  type SeriesPoint,
} from "@/lib/dashboard-command-model";
import { mailboxActivityCopy } from "@/lib/activity-copy";
import { messageOutcome } from "@/lib/message-outcomes";
import { outcomeRecipientKey } from "@/lib/cancellation-reason";

type AnyClient = {
  from: (table: string) => any;
};

type Row = Record<string, any>;

export type RecentReplyRow = {
  id: string;
  conversationId: string | null;
  prospect: string;
  company: string | null;
  campaign: string | null;
  subject: string | null;
  preview: string;
  sentiment: string;
  at: string;
};

export type ActivityRow = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  at: string;
};

export type CommandCenter = {
  days: number;
  generatedAt: string;
  timezone: string;
  today: PeriodTotals;
  yesterday: PeriodTotals;
  range: PeriodTotals;
  rangePrevious: PeriodTotals;
  series: SeriesPoint[];
  campaigns: CampaignRow[];
  topCampaigns: CampaignRow[];
  mailboxes: MailboxRow[];
  health: SendingHealth;
  funnel: FunnelStep[];
  actions: ActionItem[];
  insights: Insight[];
  recentReplies: RecentReplyRow[];
  activity: ActivityRow[];
  totals: { leads: number; campaigns: number; mailboxes: number };
};

const DAY = 86_400_000;

function ts(value: unknown): number | null {
  if (!value) return null;
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? t : null;
}

function within(value: unknown, from: number, to: number): boolean {
  const t = ts(value);
  return t !== null && t >= from && t < to;
}

export async function buildCommandCenter(
  supabase: AnyClient,
  workspaceId: string,
  days: number,
): Promise<CommandCenter> {
  const { fetchAllRows } = await import("@/lib/supabase-batch");
  const now = new Date();
  const nowMs = now.getTime();
  const rangeStart = nowMs - days * DAY;
  const prevStart = nowMs - days * 2 * DAY;
  const fetchSince = new Date(Math.min(prevStart, nowMs - SAFETY_WINDOW_DAYS * DAY)).toISOString();

const [
    campaignsRes,
    messages,
    replies,
    leadsCountRes,
    meetingLeads,
    recipients,
    accountsRes,
    domainsRes,
    conversationsRes,
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, name, status, timezone, send_days, send_start_hour, send_end_hour, daily_cap, email_send_limit, emails_sent_count, launched_at, created_at",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(200),
    fetchAllRows<Row>(() =>
      supabase
        .from("campaign_messages")
        .select(
          "id, campaign_id, lead_id, recipient_id, sending_account_id, status, scheduled_at, sent_at, delivered_at, delayed_at, opened_at, clicked_at, bounced_at, replied_at, unsubscribed_at, complained_at, failed_at, last_event_at, delivery_status, last_error, attempts, step_order, cancelled_reason, updated_at",
        )
        .eq("workspace_id", workspaceId)
        .gte("created_at", fetchSince),
    ),
    fetchAllRows<Row>(() =>
      supabase
        .from("campaign_replies")
        .select(
          "id, lead_id, campaign_id, sending_account_id, from_email, subject, body, sentiment, received_at",
        )
        .eq("workspace_id", workspaceId)
        .gte("received_at", new Date(prevStart).toISOString())
        .order("received_at", { ascending: false }),
    ),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    fetchAllRows<Row>(() =>
      supabase
        .from("leads")
        .select("id, last_activity_at, crm_stage")
        .eq("workspace_id", workspaceId)
        .in("crm_stage", ["opportunity", "customer"]),
    ),
    fetchAllRows<Row>(() =>
      supabase
        .from("campaign_recipients")
        .select("id, campaign_id, lead_id, status, last_sent_at")
        .eq("workspace_id", workspaceId),
    ),
    supabase
      .from("sending_accounts")
      .select(
        "id, from_email, label, provider, status, paused, customer_enabled, health_score, daily_limit, sent_today, last_sent_at, last_error, warmup_status, spf_status, dkim_status, dmarc_status, created_at",
      )
      .eq("workspace_id", workspaceId),
    supabase
      .from("sending_domains")
      .select("id, domain, stage, dns_status, verified_at, ready_at")
      .eq("workspace_id", workspaceId),
supabase
      .from("conversations")
      .select("id, unread, archived")
      .eq("workspace_id", workspaceId)
      .eq("unread", true)
      .eq("archived", false),
  ]);

  const campaignRows: Row[] = campaignsRes.data ?? [];
  const accountRows: Row[] = accountsRes.data ?? [];
  const domainRows: Row[] = domainsRes.data ?? [];
  const replyRows: Row[] = replies ?? [];
  const messageRows: Row[] = messages ?? [];
  const recipientRows: Row[] = recipients ?? [];
  const meetingRows: Row[] = (meetingLeads ?? []).filter((l) => l["last_activity_at"]);

  // Per-message bounce evidence; cancellation only proves a stopped send.
  const bounceAtByPerson = new Map<string, number>();
  const bounceAtByCampaign = new Map<string, Map<string, number>>();
  const bounceAtByAccount = new Map<string, Map<string, number>>();
  for (const m of messageRows) {
    const at = ts(m["bounced_at"]);
    if (at === null) continue;
    const key = String(m["id"]);
    bounceAtByPerson.set(key, at);
    for (const [scope, id] of [[bounceAtByCampaign, m["campaign_id"]], [bounceAtByAccount, m["sending_account_id"]]] as const) {
      if (!id) continue;
      const entries = scope.get(String(id)) ?? new Map<string, number>();
      entries.set(key, at); scope.set(String(id), entries);
    }
  }
  const personBounced = (m: Row) => Boolean(m["bounced_at"]);
  const countBounced = (scope: Map<string, number> | undefined, from: number, to: number) => {
    if (!scope) return 0;
    let total = 0;
    for (const at of scope.values()) if (at >= from && at < to) total += 1;
    return total;
  };


  const accountIds = accountRows.map((a) => a["id"] as string);
  const [warmupSettingsRes, safetyStatsRes] = await Promise.all([
    accountIds.length
      ? supabase
          .from("warmup_settings")
          .select(
            "sending_account_id, enabled, paused_by_system, pause_reason, max_bounce_rate, min_health_score",
          )
          .in("sending_account_id", accountIds)
      : Promise.resolve({ data: [] as Row[] }),
    accountIds.length
      ? supabase
          .from("warmup_daily_stats")
          .select("sending_account_id, sent, bounced, failed, complained")
          .in("sending_account_id", accountIds)
          .gte("day", new Date(nowMs - SAFETY_WINDOW_DAYS * DAY).toISOString().slice(0, 10))
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  /* ------------------------------------------------------------ timezone */
  const tzCount = new Map<string, number>();
  for (const c of campaignRows) {
    const tz = String(c["timezone"] || "UTC");
    tzCount.set(tz, (tzCount.get(tz) ?? 0) + 1);
  }
  const timezone =
    Array.from(tzCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const todayStart = zonedStartOfDay(now, timezone).getTime();
  const yesterdayStart = todayStart - DAY;

  /* -------------------------------------------------------------- totals */
  const campaignById = new Map(campaignRows.map((c) => [c["id"] as string, c]));
  const leadCampaign = new Map<string, string>();
  const leadsPerCampaign = new Map<string, number>();
  const remainingPerCampaign = new Map<string, number>();
  // Queued / in-flight / retryable work still owed by the engine.
  const pendingMessagesPerCampaign = new Map<string, number>();
  for (const m of messageRows) {
    const cid = m["campaign_id"] as string | null;
    if (!cid) continue;
    const status = String(m["status"] ?? "");
    const open =
      ["pending", "scheduled", "processing", "queued"].includes(status) ||
      (status === "failed" && isRetryableFailure(m["last_error"] as string | null));
    if (open) pendingMessagesPerCampaign.set(cid, (pendingMessagesPerCampaign.get(cid) ?? 0) + 1);
  }
  for (const r of recipientRows) {
    const cid = r["campaign_id"] as string;
    leadsPerCampaign.set(cid, (leadsPerCampaign.get(cid) ?? 0) + 1);
    const done = ["completed", "replied", "bounced", "unsubscribed", "stopped"].includes(
      String(r["status"]),
    );
    if (!done) remainingPerCampaign.set(cid, (remainingPerCampaign.get(cid) ?? 0) + 1);
    const lid = r["lead_id"] as string | null;
    if (lid && !leadCampaign.has(lid)) leadCampaign.set(lid, cid);
  }

  // A message the provider accepted for sending but then rejected (failed_at set,
  // no bounce) was sent, yet never delivered. Without this, delivered == sent
  // while the failed-event list shows the rejection.
  const rejectedAfterSend = (m: Record<string, unknown>) =>
    ts(m["sent_at"]) !== null && !m["bounced_at"] && m["status"] === "failed";
  const totalsFor = (from: number, to: number): PeriodTotals => {
    const sentMsgs = messageRows.filter((m) => within(m["sent_at"], from, to));

    const windowReplies = replyRows.filter((r) => within(r["received_at"], from, to));
    const uniqueReplyLeads = new Set(
      windowReplies.map((r) => r["lead_id"] ?? r["from_email"]).filter(Boolean),
    );
    const positiveLeads = new Set(
      windowReplies
        .filter((r) => r["sentiment"] === "positive")
        .map((r) => r["lead_id"] ?? r["from_email"])
        .filter(Boolean),
    );
    const windowBounced = countBounced(bounceAtByPerson, from, to);
    return {
      sent: sentMsgs.length,
      // Provider receipts, never inferred from acceptance.
      delivered: sentMsgs.filter(m => !(m as Record<string, unknown>)["bounced_at"]).length,
      replies: uniqueReplyLeads.size,
      positive: positiveLeads.size,
      meetings: meetingRows.filter((l) => within(l["last_activity_at"], from, to)).length,
      bounced: windowBounced,
      uniqueRecipients: new Set(
        sentMsgs.map((m) => m["lead_id"] ?? m["id"]).filter(Boolean),
      ).size,
    };
  };

  const today = totalsFor(todayStart, nowMs + 1);
  const yesterday = totalsFor(yesterdayStart, todayStart);
  const range = totalsFor(rangeStart, nowMs + 1);
  const rangePrevious = totalsFor(prevStart, rangeStart);

  /* -------------------------------------------------------------- series */
  const buckets = new Map<string, SeriesPoint & { rejected?: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(nowMs - i * DAY).toISOString().slice(0, 10);
    buckets.set(key, { date: key, sent: 0, delivered: 0, replies: 0, positive: 0, meetings: 0 });
  }
  for (const m of messageRows) {
    const t = ts(m["sent_at"]);
    if (t === null || t < rangeStart) continue;
    const b = buckets.get(new Date(t).toISOString().slice(0, 10));
    if (!b) continue;
    b.sent += 1;
    if (rejectedAfterSend(m)) b.rejected = (b.rejected ?? 0) + 1;
  }
  // Delivered per day = that day's sends minus that day's bounced people.
  const bouncesPerDay = new Map<string, number>();
  for (const at of bounceAtByPerson.values()) {
    if (at < rangeStart) continue;
    const key = new Date(at).toISOString().slice(0, 10);
    bouncesPerDay.set(key, (bouncesPerDay.get(key) ?? 0) + 1);
  }
  for (const [key, b] of buckets) {
    b.delivered = messageRows.filter(m => m["delivered_at"] && String(m["delivered_at"]).slice(0, 10) === key && messageOutcome(m as never) === "delivered").length;
    delete b.rejected;
  }
  for (const r of replyRows) {
    const t = ts(r["received_at"]);
    if (t === null || t < rangeStart) continue;
    const b = buckets.get(new Date(t).toISOString().slice(0, 10));
    if (!b) continue;
    b.replies += 1;
    if (r["sentiment"] === "positive") b.positive += 1;
  }
  for (const l of meetingRows) {
    const t = ts(l["last_activity_at"]);
    if (t === null || t < rangeStart) continue;
    const b = buckets.get(new Date(t).toISOString().slice(0, 10));
    if (b) b.meetings += 1;
  }
  const series = Array.from(buckets.values());

  /* ----------------------------------------------------------- campaigns */
  const blockedMailboxIds = new Set<string>();
  const campaigns: CampaignRow[] = campaignRows.map((c) => {
    const id = c["id"] as string;
    const tz = String(c["timezone"] || "UTC");
    const dayStart = zonedStartOfDay(now, tz).getTime();
    const mine = messageRows.filter((m) => m["campaign_id"] === id);
    const sentMine = mine.filter((m) => m["sent_at"]);
    const sentToday = sentMine.filter((m) => (ts(m["sent_at"]) ?? 0) >= dayStart).length;
    const inRange = sentMine.filter((m) => (ts(m["sent_at"]) ?? 0) >= rangeStart);
    const myReplies = replyRows.filter(
      (r) =>
        (r["campaign_id"] ?? (r["lead_id"] ? leadCampaign.get(r["lead_id"] as string) : null)) === id &&
        (ts(r["received_at"]) ?? 0) >= rangeStart,
    );
    const uniqueReplies = new Set(myReplies.map((r) => r["lead_id"] ?? r["from_email"])).size;
    const positive = new Set(
      myReplies.filter((r) => r["sentiment"] === "positive").map((r) => r["lead_id"] ?? r["from_email"]),
    ).size;
    const meetings = meetingRows.filter(
      (l) => leadCampaign.get(l["id"] as string) === id && (ts(l["last_activity_at"]) ?? 0) >= rangeStart,
    ).length;

    const status = campaignRunStatus({
      status: String(c["status"] ?? "draft"),
      dailyQuota: Number(c["daily_cap"] ?? 0) || 0,
      sentToday,
      // A campaign is only "completed" when nothing is left anywhere: no open
      // recipient AND no queued/in-flight/retryable message.
      remainingRecipients: Math.max(
        remainingPerCampaign.get(id) ?? 0,
        pendingMessagesPerCampaign.get(id) ?? 0,
      ),
      lifetimeLimit: Number(c["email_send_limit"] ?? 0) || 0,
      lifetimeSent: Number(c["emails_sent_count"] ?? 0) || 0,
      blocked: false,
      now,
      window: {
        timezone: tz,
        sendDays: (c["send_days"] as number[] | null) ?? [1, 2, 3, 4, 5],
        startHour: Number(c["send_start_hour"] ?? 9),
        endHour: Number(c["send_end_hour"] ?? 17),
      },
    });

    return {
      id,
      name: String(c["name"]),
      status: String(c["status"]),
      runState: status.state,
      runLabel: status.label,
      nextRunAt: status.nextRunAt,
      leads: leadsPerCampaign.get(id) ?? 0,
      sentLifetime: sentMine.length,
      sentToday,
      delivered: mine.filter(m => within(m["delivered_at"], rangeStart, nowMs + 1) && messageOutcome(m as never) === "delivered").length,
      replies: uniqueReplies,
      positive,
      meetings,
      bounced: countBounced(bounceAtByCampaign.get(id), rangeStart, nowMs + 1),
      remainingDailyCapacity: status.remainingDailyCapacity,
      dailyQuota: Number(c["daily_cap"] ?? 0) || 0,
    };
  });

  /* ----------------------------------------------------------- mailboxes */
  const settingsById = new Map(
    ((warmupSettingsRes.data ?? []) as Row[]).map((s) => [s["sending_account_id"] as string, s]),
  );
  const safetyById = new Map<string, SafetyStatRow[]>();
  for (const row of (safetyStatsRes.data ?? []) as Row[]) {
    const key = row["sending_account_id"] as string;
    const list = safetyById.get(key) ?? [];
    list.push(row as SafetyStatRow);
    safetyById.set(key, list);
  }

  const windowStart = mailboxWindowStart(now).getTime();
  const mailboxes: MailboxRow[] = accountRows.map((a) => {
    const id = a["id"] as string;
    const setting = settingsById.get(id);
    const mine = messageRows.filter((m) => m["sending_account_id"] === id && m["sent_at"]);
    const inWindow = mine.filter((m) => (ts(m["sent_at"]) ?? 0) >= windowStart).length;
    const inRange = mine.filter((m) => (ts(m["sent_at"]) ?? 0) >= rangeStart);
    const dailyLimit = Number(a["daily_limit"] ?? 0) || 0;
    const used = Math.min(inWindow, dailyLimit || inWindow);
    const capacityExhausted = dailyLimit > 0 && used >= dailyLimit;

    const snapshot = evaluateMailboxSafety({
      stats: safetyById.get(id) ?? [],
      maxBounceRate: Number(setting?.["max_bounce_rate"] ?? 5),
      minHealthScore: Number(setting?.["min_health_score"] ?? 0),
      healthScore: (a["health_score"] as number | null) ?? null,
      accountStatus: a["status"] as string,
      authStatuses: [a["spf_status"], a["dkim_status"], a["dmarc_status"]] as string[],
      manuallyPaused: Boolean(a["paused"]),
      customerEnabled: a["customer_enabled"] !== false,
      pausedBySystem: Boolean(setting?.["paused_by_system"]),
      pauseReason: (setting?.["pause_reason"] as string | null) ?? null,
      capacityExhausted,
      now,
    });

    const kind = snapshot.state.kind;
    let state: MailboxRow["state"] = "active";
    if (kind !== "none" && !snapshot.state.resumable) state = "blocked";
    else if (kind === "capacity") state = "capacity";
    else if (kind === "manual" || kind === "auto_safety" || kind === "disabled") state = "paused";
    else if (String(a["warmup_status"]) === "warming") state = "warming";

    if (state === "blocked") blockedMailboxIds.add(id);

    const replyCount = replyRows.filter(
      (r) => r["sending_account_id"] === id && (ts(r["received_at"]) ?? 0) >= rangeStart,
    ).length;

    return {
      id,
      label: String(a["label"] || a["from_email"]),
      email: String(a["from_email"]),
      state,
      stateLabel:
        state === "active"
          ? "Active"
          : state === "warming"
            ? "Warming up"
            : state === "capacity"
              ? `Capacity used (${MAILBOX_WINDOW_HOURS}h window)`
              : snapshot.state.label,
      reason:
        state === "capacity"
          ? "Sending capacity for the current 12-hour window is used up. It returns automatically."
          : (snapshot.state.detail ?? (a["last_error"] as string | null) ?? null),
      healthScore: (a["health_score"] as number | null) ?? null,
      sent: inRange.length,
      delivered: messageRows.filter(m => m["sending_account_id"] === id && within(m["delivered_at"], rangeStart, nowMs + 1) && messageOutcome(m as never) === "delivered").length,
      bounced: countBounced(bounceAtByAccount.get(id), rangeStart, nowMs + 1),
      replies: replyCount,
      dailyLimit,
      usedInWindow: used,
      available: dailyLimit > 0 ? Math.max(0, dailyLimit - used) : 0,
    };
  });

  const domainsReady = domainRows.filter((d) => d["ready_at"] || d["verified_at"]).length;
  const health: SendingHealth = {
    score: accountRows.length
      ? Math.round(
          accountRows.reduce((s, a) => s + (Number(a["health_score"]) || 0), 0) / accountRows.length,
        )
      : 0,
    total: mailboxes.length,
    healthy: mailboxes.filter((m) => m.state === "active").length,
    warming: mailboxes.filter((m) => m.state === "warming").length,
    paused: mailboxes.filter((m) => m.state === "paused").length,
    blocked: mailboxes.filter((m) => m.state === "blocked").length,
    domainsReady,
    domainsTotal: domainRows.length,
    capacity: mailboxes.reduce((s, m) => s + m.dailyLimit, 0),
    usedInWindow: mailboxes.reduce((s, m) => s + m.usedInWindow, 0),
    available: mailboxes
      .filter((m) => m.state === "active" || m.state === "warming")
      .reduce((s, m) => s + m.available, 0),
  };

  /* ------------------------------------------------------- recent replies */
  const replyLeadIds = Array.from(
    new Set(replyRows.slice(0, 10).map((r) => r["lead_id"]).filter(Boolean)),
  ) as string[];
  const [leadLookup, conversationLookup] = await Promise.all([
    replyLeadIds.length
      ? supabase.from("leads").select("id, email, first_name, last_name, company").in("id", replyLeadIds)
      : Promise.resolve({ data: [] as Row[] }),
    replyLeadIds.length
      ? supabase
          .from("conversations")
          .select("id, lead_id, last_message_at")
          .eq("workspace_id", workspaceId)
          .in("lead_id", replyLeadIds)
          .order("last_message_at", { ascending: false })
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const leadById = new Map(((leadLookup.data ?? []) as Row[]).map((l) => [l["id"] as string, l]));
  const conversationByLead = new Map<string, string>();
  for (const c of (conversationLookup.data ?? []) as Row[]) {
    const lid = c["lead_id"] as string | null;
    if (lid && !conversationByLead.has(lid)) conversationByLead.set(lid, c["id"] as string);
  }

  const recentReplies: RecentReplyRow[] = replyRows.slice(0, 8).map((r) => {
    const lead = r["lead_id"] ? leadById.get(r["lead_id"] as string) : undefined;
    const name = [lead?.["first_name"], lead?.["last_name"]].filter(Boolean).join(" ");
    const campaignId =
      (r["campaign_id"] as string | null) ??
      (r["lead_id"] ? (leadCampaign.get(r["lead_id"] as string) ?? null) : null);
    return {
      id: r["id"] as string,
      conversationId: r["lead_id"] ? (conversationByLead.get(r["lead_id"] as string) ?? null) : null,
      prospect: name || (lead?.["email"] as string) || String(r["from_email"]),
      company: (lead?.["company"] as string | null) ?? null,
      campaign: campaignId ? (String(campaignById.get(campaignId)?.["name"] ?? "") || null) : null,
      subject: (r["subject"] as string | null) ?? null,
      preview: String(r["body"] ?? r["subject"] ?? "").replace(/\s+/g, " ").slice(0, 180),
      sentiment: String(r["sentiment"] ?? "neutral"),
      at: String(r["received_at"]),
    };
  });

/* ------------------------------------------------------------ activity */
  // Outbound rows come from the very same campaign_messages the KPIs count,
  // so the feed can never show sends the numbers don't know about. Warmup is
  // never read here, not even as a fallback.
  const { buildOutboundActivity } = await import("@/lib/dashboard-activity");
  const outboundActivity = buildOutboundActivity(
    messageRows,
    new Map(campaignRows.map((c) => [String(c["id"]), String(c["name"] ?? "Campaign")])),
  );

  const activity: ActivityRow[] = [
    ...outboundActivity,
    ...campaignRows
      .filter((c) => c["launched_at"])
      .map((c) => ({
        id: `campaign-${c["id"]}`,
        kind: "campaign",
        title: "Campaign started",
        detail: String(c["name"]),
        at: String(c["launched_at"]),
      })),
    ...replyRows.slice(0, 10).map((r) => ({
      id: `reply-${r["id"]}`,
      kind: "reply",
      title: "Reply received",
      detail: String(r["from_email"]),
      at: String(r["received_at"]),
    })),
    ...meetingRows.slice(0, 5).map((l) => ({
      id: `meeting-${l["id"]}`,
      kind: "meeting",
      title: "Opportunity created",
      detail: "A lead moved into your pipeline.",
      at: String(l["last_activity_at"]),
    })),
    ...domainRows
      .filter((d) => d["verified_at"] || d["ready_at"])
      .map((d) => ({
        id: `domain-${d["id"]}`,
        kind: "domain",
        title: "Domain verified",
        detail: `${d["domain"]} is verified and ready to send.`,
        at: String(d["ready_at"] ?? d["verified_at"]),
      })),
    ...accountRows.map((a) => ({
      id: `mailbox-${a["id"]}`,
      kind: "mailbox",
      ...mailboxActivityCopy(String(a["label"] || a["from_email"])),
      at: String(a["created_at"]),
    })),
  ]
    .filter((item) => item.at && item.at !== "null")
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12);


  /* -------------------------------------------------- actions & insights */
  const retryableFailures = messageRows.filter(
    (m) =>
      m["status"] === "failed" &&
      !m["sent_at"] &&
      !personBounced(m) &&
      isRetryableFailure((m["last_error"] as string | null) ?? null),
  ).length;

  const leadsTotal = leadsCountRes.count ?? 0;
  const unreadReplies = (conversationsRes.data ?? []).length;

  const actions = buildActionItems({
    campaigns,
    mailboxes,
    domainsPending: domainRows.length - domainsReady,
    unreadReplies,
    retryableFailures,
    hasLeads: leadsTotal > 0,
    hasMailbox: accountRows.length > 0,
  });

  const insights = buildInsights({
    campaigns,
    mailboxes,
    current: range,
    previous: rangePrevious,
    series,
    days,
  });

  const funnel = buildFunnel({
    leads: leadsTotal,
    sent: range.uniqueRecipients || range.sent,
    delivered: range.delivered,
    replies: range.replies,
    positive: range.positive,
    meetings: range.meetings,
  });

  return {
    days,
    generatedAt: now.toISOString(),
    timezone,
    today: today ?? EMPTY_TOTALS,
    yesterday,
    range,
    rangePrevious,
    series,
    campaigns,
    topCampaigns: rankCampaigns(campaigns),
    mailboxes,
    health,
    funnel,
    actions,
    insights,
    recentReplies,
    activity,
    totals: {
      leads: leadsTotal,
      campaigns: campaignRows.length,
      mailboxes: accountRows.length,
    },
  };
}

export { pct };
