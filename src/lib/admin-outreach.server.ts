/**
 * Admin outreach management (Phase 4): platform-wide read models and safe
 * control actions for campaigns, leads, mailboxes, sending domains and warmup.
 *
 * Runs with the service-role client so the console can see every tenant, but
 * every entry point in `admin-outreach.functions.ts` first verifies the caller
 * holds the platform super admin role using the caller's own RLS-bound client.
 * Customers keep their normal workspace-scoped RLS paths — nothing here is
 * reachable without the admin role check.
 *
 * Credentials are never read or returned: no SMTP passwords, API keys, OAuth
 * tokens or encrypted provider material appear in any type below. Every metric
 * is derived from real rows; absent data stays 0/null so the UI can say
 * "No data available" rather than invent a result.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = () => supabaseAdmin as any;

type Dict<T> = Record<string, T>;

async function workspaceNames(ids: string[]): Promise<Dict<string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return {};
  const { data } = await db().from("workspaces").select("id, name").in("id", unique);
  const out: Dict<string> = {};
  for (const w of data ?? []) out[w.id] = w.name;
  return out;
}

async function profileNames(ids: string[]): Promise<Dict<{ email: string | null; name: string | null }>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return {};
  const { data } = await db().from("profiles").select("id, email, full_name").in("id", unique);
  const out: Dict<{ email: string | null; name: string | null }> = {};
  for (const p of data ?? []) out[p.id] = { email: p.email ?? null, name: p.full_name ?? null };
  return out;
}

function tally<T>(rows: T[], key: (row: T) => string | null | undefined) {
  const out: Dict<number> = {};
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/* ============================================================ campaigns */

export type AdminCampaignRow = {
  id: string;
  name: string;
  status: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string | null;
  ownerName: string | null;
  leads: number;
  sent: number;
  opens: number;
  replies: number;
  positiveReplies: number;
  bounces: number;
  meetings: number;
  sendingAccounts: string[];
  createdAt: string;
  lastActivityAt: string | null;
};

export type AdminCampaignFilters = {
  workspaceId?: string | null | undefined;
  status?: string | null | undefined;
  sendingAccountId?: string | null | undefined;
  from?: string | null | undefined;
  to?: string | null | undefined;
  search?: string | null | undefined;
};

export async function listAdminCampaigns(filters: AdminCampaignFilters = {}) {
  const { fetchAllRows, fetchByIds } = await import("@/lib/supabase-batch");
  let q = db()
    .from("campaigns")
    .select(
      "id, name, status, workspace_id, created_by, created_at, updated_at, sending_account_ids, launched_at",
    )
    .order("created_at", { ascending: false });
  if (filters.workspaceId) q = q.eq("workspace_id", filters.workspaceId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);

  let campaigns = await fetchAllRows<any>(() => q);
  if (filters.sendingAccountId) {
    campaigns = campaigns.filter((c) =>
      (c.sending_account_ids ?? []).includes(filters.sendingAccountId),
    );
  }
  const term = (filters.search ?? "").trim().toLowerCase();
  if (term) campaigns = campaigns.filter((c) => String(c.name).toLowerCase().includes(term));

  const ids = campaigns.map((c) => c.id);
  if (!ids.length) return [] as AdminCampaignRow[];

  const [recipients, messages, replies, engagement, workspaces, owners, accounts, activities] =
    await Promise.all([
      fetchByIds<any>(ids, (chunk) =>
        db().from("campaign_recipients").select("campaign_id, status").in("campaign_id", chunk),
      ),
      fetchByIds<any>(ids, (chunk) =>
        db().from("campaign_messages").select("campaign_id, status, sent_at").in("campaign_id", chunk),
      ),
      fetchByIds<any>(ids, (chunk) =>
        db().from("campaign_replies").select("campaign_id, sentiment, received_at").in("campaign_id", chunk),
      ),
      fetchByIds<any>(ids, (chunk) =>
        db()
          .from("email_engagement_events")
          .select("campaign_id, event_type, message_id, recipient_email")
          .in("campaign_id", chunk),
      ),
      workspaceNames(campaigns.map((c) => c.workspace_id)),
      profileNames(campaigns.map((c) => c.created_by)),
      fetchAllRows<any>(() => db().from("sending_accounts").select("id, from_email")),
      fetchByIds<any>(ids, (chunk) =>
        db().from("lead_activities").select("campaign_id, type, created_at").in("campaign_id", chunk),
      ),
    ]);

  const recipientCounts = tally(recipients, (r: any) => r.campaign_id);
  const sentCounts: Dict<number> = {};
  const bounceCounts: Dict<number> = {};
  const lastActivity: Dict<string> = {};
  for (const m of messages as any[]) {
    if (m.status === "sent") sentCounts[m.campaign_id] = (sentCounts[m.campaign_id] ?? 0) + 1;
    if (m.status === "failed") bounceCounts[m.campaign_id] = (bounceCounts[m.campaign_id] ?? 0) + 1;
    if (m.sent_at && (!lastActivity[m.campaign_id] || m.sent_at > lastActivity[m.campaign_id]!))
      lastActivity[m.campaign_id] = m.sent_at;
  }
  const replyCounts: Dict<number> = {};
  const positiveCounts: Dict<number> = {};
  for (const r of replies as any[]) {
    replyCounts[r.campaign_id] = (replyCounts[r.campaign_id] ?? 0) + 1;
    if (r.sentiment === "positive")
      positiveCounts[r.campaign_id] = (positiveCounts[r.campaign_id] ?? 0) + 1;
    if (r.received_at && (!lastActivity[r.campaign_id] || r.received_at > lastActivity[r.campaign_id]!))
      lastActivity[r.campaign_id] = r.received_at;
  }
  const openKeys: Dict<Set<string>> = {};
  const bounceEvents: Dict<number> = {};
  for (const e of engagement as any[]) {
    if (e.event_type === "open" || e.event_type === "opened") {
      const key = e.message_id ?? e.recipient_email ?? `${e.campaign_id}:unknown`;
      const set = openKeys[e.campaign_id] ?? new Set<string>();
      set.add(String(key));
      openKeys[e.campaign_id] = set;
    }
    if (e.event_type === "bounce" || e.event_type === "bounced")
      bounceEvents[e.campaign_id] = (bounceEvents[e.campaign_id] ?? 0) + 1;
  }
  const meetingCounts: Dict<number> = {};
  for (const a of activities as any[]) {
    if (String(a.type).toLowerCase().includes("meeting"))
      meetingCounts[a.campaign_id] = (meetingCounts[a.campaign_id] ?? 0) + 1;
  }
  const accountEmails: Dict<string> = {};
  for (const a of accounts as any[]) accountEmails[a.id] = a.from_email;

  return campaigns.map((c): AdminCampaignRow => {
    const owner = owners[c.created_by] ?? { email: null, name: null };
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      workspaceId: c.workspace_id,
      workspaceName: workspaces[c.workspace_id] ?? "—",
      ownerEmail: owner.email,
      ownerName: owner.name,
      leads: recipientCounts[c.id] ?? 0,
      sent: sentCounts[c.id] ?? 0,
      opens: openKeys[c.id]?.size ?? 0,
      replies: replyCounts[c.id] ?? 0,
      positiveReplies: positiveCounts[c.id] ?? 0,
      bounces: (bounceCounts[c.id] ?? 0) + (bounceEvents[c.id] ?? 0),
      meetings: meetingCounts[c.id] ?? 0,
      sendingAccounts: (c.sending_account_ids ?? [])
        .map((id: string) => accountEmails[id])
        .filter(Boolean),
      createdAt: c.created_at,
      lastActivityAt: lastActivity[c.id] ?? c.launched_at ?? null,
    };
  });
}

export async function getAdminCampaign(campaignId: string) {
  const { data: campaign, error } = await db()
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) throw new Error("Campaign not found");

  const [steps, variants, recipients, messages, replies, engagement, workspaces, owners, accounts] =
    await Promise.all([
      db()
        .from("campaign_steps")
        .select("id, step_order, name, step_type, subject, wait_days, wait_hours, delay_minutes")
        .eq("campaign_id", campaignId)
        .order("step_order"),
      db()
        .from("campaign_step_variants")
        .select("id, step_id, label, subject, weight")
        .eq("campaign_id", campaignId),
      db()
        .from("campaign_recipients")
        .select("id, lead_id, status, current_step, next_send_at, last_sent_at, last_error")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(200),
      db()
        .from("campaign_messages")
        .select("id, status, to_email, subject, sent_at, scheduled_at, last_error, sending_account_id")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(200),
      db()
        .from("campaign_replies")
        .select("id, from_email, subject, sentiment, received_at")
        .eq("campaign_id", campaignId)
        .order("received_at", { ascending: false })
        .limit(50),
      db().from("email_engagement_events").select("event_type").eq("campaign_id", campaignId),
      workspaceNames([campaign.workspace_id]),
      profileNames([campaign.created_by]),
      db()
        .from("sending_accounts")
        .select("id, from_email, provider, status, warmup_status, daily_limit")
        .in("id", campaign.sending_account_ids ?? ["00000000-0000-0000-0000-000000000000"]),
    ]);

  const leadIds = (recipients.data ?? []).map((r: any) => r.lead_id).filter(Boolean);
  const { data: leads } = leadIds.length
    ? await db().from("leads").select("id, email, first_name, last_name, company").in("id", leadIds)
    : { data: [] };
  const leadById: Dict<any> = {};
  for (const l of leads ?? []) leadById[l.id] = l;

  const msgRows = (messages.data ?? []) as any[];
  const engRows = (engagement.data ?? []) as any[];

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description ?? null,
      status: campaign.status,
      workspaceId: campaign.workspace_id,
      workspaceName: workspaces[campaign.workspace_id] ?? "—",
      ownerEmail: owners[campaign.created_by]?.email ?? null,
      timezone: campaign.timezone,
      dailyCap: campaign.daily_cap,
      maxPerHour: campaign.max_per_hour,
      sendDays: campaign.send_days,
      sendStartHour: campaign.send_start_hour,
      sendEndHour: campaign.send_end_hour,
      stopOnReply: campaign.stop_on_reply,
      openTracking: campaign.open_tracking,
      clickTracking: campaign.click_tracking,
      createdAt: campaign.created_at,
      launchedAt: campaign.launched_at,
      readinessReady: campaign.readiness_ready,
      readinessIssues: campaign.readiness_issues ?? [],
    },
    steps: (steps.data ?? []).map((s: any) => ({
      id: s.id,
      order: s.step_order,
      name: s.name,
      type: s.step_type,
      subject: s.subject,
      waitDays: s.wait_days,
      waitHours: s.wait_hours,
      delayMinutes: s.delay_minutes,
      variants: (variants.data ?? [])
        .filter((v: any) => v.step_id === s.id)
        .map((v: any) => ({ id: v.id, label: v.label, subject: v.subject, weight: v.weight })),
    })),
    recipients: (recipients.data ?? []).map((r: any) => ({
      id: r.id,
      status: r.status,
      currentStep: r.current_step,
      nextSendAt: r.next_send_at,
      lastSentAt: r.last_sent_at,
      lastError: r.last_error,
      email: leadById[r.lead_id]?.email ?? null,
      name:
        [leadById[r.lead_id]?.first_name, leadById[r.lead_id]?.last_name]
          .filter(Boolean)
          .join(" ") || null,
      company: leadById[r.lead_id]?.company ?? null,
    })),
    sendingAccounts: (accounts.data ?? []).map((a: any) => ({
      id: a.id,
      email: a.from_email,
      provider: a.provider,
      status: a.status,
      warmupStatus: a.warmup_status,
      dailyLimit: a.daily_limit,
    })),
    stats: {
      recipients: recipients.data?.length ?? 0,
      queued: msgRows.filter((m) => m.status === "pending" || m.status === "scheduled").length,
      sent: msgRows.filter((m) => m.status === "sent").length,
      failed: msgRows.filter((m) => m.status === "failed").length,
      opens: engRows.filter((e) => e.event_type === "open" || e.event_type === "opened").length,
      clicks: engRows.filter((e) => e.event_type === "click" || e.event_type === "clicked").length,
      bounces: engRows.filter((e) => e.event_type === "bounce" || e.event_type === "bounced").length,
      replies: replies.data?.length ?? 0,
      positiveReplies: (replies.data ?? []).filter((r: any) => r.sentiment === "positive").length,
    },
    replies: (replies.data ?? []).map((r: any) => ({
      id: r.id,
      fromEmail: r.from_email,
      subject: r.subject,
      sentiment: r.sentiment,
      receivedAt: r.received_at,
    })),
    errors: msgRows
      .filter((m) => m.last_error)
      .slice(0, 30)
      .map((m) => ({ id: m.id, at: m.sent_at ?? m.scheduled_at, email: m.to_email, error: m.last_error })),
    activity: msgRows
      .filter((m) => m.sent_at)
      .slice(0, 30)
      .map((m) => ({ id: m.id, at: m.sent_at, email: m.to_email, subject: m.subject, status: m.status })),
  };
}

/**
 * Admin campaign control. Pause/resume/stop only flip the campaign status the
 * scheduler already honours — no message is force-sent and no safety control
 * (readiness gate, caps, sending window, suppression) is bypassed. Resuming a
 * campaign that never passed the readiness gate is refused.
 */
export async function adminCampaignAction(
  actorId: string,
  campaignId: string,
  action: "pause" | "resume" | "stop",
) {
  const { data: campaign, error } = await db()
    .from("campaigns")
    .select("id, status, workspace_id, name, readiness_ready, launched_at")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) throw new Error("Campaign not found");

  let status: string;
  if (action === "pause") {
    if (campaign.status !== "active")
      throw new Error("Only an active campaign can be paused.");
    status = "paused";
  } else if (action === "resume") {
    if (campaign.status !== "paused") throw new Error("Only a paused campaign can be resumed.");
    if (!campaign.launched_at)
      throw new Error("This campaign was never launched — the customer must launch it.");
    if (campaign.readiness_ready === false)
      throw new Error("Campaign fails its sending readiness checks and cannot be resumed.");
    status = "active";
  } else {
    if (campaign.status === "completed" || campaign.status === "archived")
      throw new Error("Campaign is already stopped.");
    status = "completed";
  }

  const { error: updateError } = await db()
    .from("campaigns")
    .update({ status })
    .eq("id", campaignId);
  if (updateError) throw new Error(updateError.message);

  if (action === "stop") {
    // Cancel only work that has not left the building yet.
    await db()
      .from("campaign_messages")
      .update({ status: "cancelled" })
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "scheduled"]);
  }

  await db().from("admin_audit_log").insert({
    actor_id: actorId,
    action: `campaign.${action}`,
    target_type: "campaign",
    target_id: campaignId,
    target_label: campaign.name,
    detail: { workspaceId: campaign.workspace_id, from: campaign.status, to: status },
  });

  return { ok: true, status };
}

/* ================================================================ leads */

export type AdminLeadFilters = {
  workspaceId?: string | null | undefined;
  campaignId?: string | null | undefined;
  listId?: string | null | undefined;
  status?: string | null | undefined;
  search?: string | null | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  sort?: "created_at" | "last_activity_at" | "email" | "company" | undefined;
  direction?: "asc" | "desc" | undefined;
};

export async function listAdminLeads(filters: AdminLeadFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const sort = filters.sort ?? "created_at";
  const ascending = filters.direction === "asc";

  let campaignLeadIds: string[] | null = null;
  if (filters.campaignId) {
    const { data } = await db()
      .from("campaign_recipients")
      .select("lead_id")
      .eq("campaign_id", filters.campaignId)
      .limit(5000);
    campaignLeadIds = Array.from(new Set((data ?? []).map((r: any) => r.lead_id).filter(Boolean)));
    if (!campaignLeadIds.length) return { rows: [], total: 0, page, pageSize };
  }

  let q = db()
    .from("leads")
    .select(
      "id, workspace_id, list_id, email, first_name, last_name, company, job_title, status, created_at, last_activity_at",
      { count: "exact" },
    )
    .order(sort, { ascending, nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (filters.workspaceId) q = q.eq("workspace_id", filters.workspaceId);
  if (filters.listId) q = q.eq("list_id", filters.listId);
  if (filters.status) q = q.eq("status", filters.status);
  if (campaignLeadIds) q = q.in("id", campaignLeadIds);
  const term = (filters.search ?? "").trim();
  if (term) {
    const like = `%${term}%`;
    q = q.or(
      `email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like}`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const leads = (data ?? []) as any[];
  const ids = leads.map((l) => l.id);

  const [workspaces, lists, recipients] = await Promise.all([
    workspaceNames(leads.map((l) => l.workspace_id)),
    db().from("lead_lists").select("id, name"),
    ids.length
      ? db().from("campaign_recipients").select("lead_id, campaign_id").in("lead_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const campaignIds = Array.from(
    new Set(((recipients as any).data ?? []).map((r: any) => r.campaign_id)),
  );
  const { data: campaigns } = campaignIds.length
    ? await db().from("campaigns").select("id, name").in("id", campaignIds)
    : { data: [] };
  const campaignName: Dict<string> = {};
  for (const c of campaigns ?? []) campaignName[c.id] = c.name;
  const listName: Dict<string> = {};
  for (const l of (lists as any).data ?? []) listName[l.id] = l.name;
  const leadCampaigns: Dict<string[]> = {};
  for (const r of ((recipients as any).data ?? []) as any[]) {
    const name = campaignName[r.campaign_id];
    if (!name) continue;
    (leadCampaigns[r.lead_id] ??= []).push(name);
  }

  return {
    total: count ?? leads.length,
    page,
    pageSize,
    rows: leads.map((l) => ({
      id: l.id,
      name: [l.first_name, l.last_name].filter(Boolean).join(" ") || null,
      email: l.email,
      company: l.company,
      jobTitle: l.job_title,
      workspaceId: l.workspace_id,
      workspaceName: workspaces[l.workspace_id] ?? "—",
      listName: l.list_id ? (listName[l.list_id] ?? null) : null,
      status: l.status,
      campaigns: leadCampaigns[l.id] ?? [],
      createdAt: l.created_at,
      lastActivityAt: l.last_activity_at,
    })),
  };
}

export async function getAdminLead(leadId: string) {
  const { data: lead, error } = await db().from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) throw new Error("Lead not found");

  const [recipients, messages, replies, notes, tasks, activities, workspaces, lists] =
    await Promise.all([
      db()
        .from("campaign_recipients")
        .select("id, campaign_id, status, current_step, last_sent_at, last_error")
        .eq("lead_id", leadId),
      db()
        .from("campaign_messages")
        .select("id, campaign_id, subject, status, sent_at, to_email, last_error")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(100),
      db()
        .from("campaign_replies")
        .select("id, subject, sentiment, received_at, from_email")
        .eq("lead_id", leadId)
        .order("received_at", { ascending: false })
        .limit(50),
      db()
        .from("lead_notes")
        .select("id, body, created_at, author_id")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false }),
      db()
        .from("lead_tasks")
        .select("id, title, due_at, completed, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false }),
      db()
        .from("lead_activities")
        .select("id, type, detail, created_at, campaign_id")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(100),
      workspaceNames([lead.workspace_id]),
      db().from("lead_lists").select("id, name"),
    ]);

  const campaignIds = Array.from(
    new Set(
      [
        ...(recipients.data ?? []).map((r: any) => r.campaign_id),
        ...(messages.data ?? []).map((m: any) => m.campaign_id),
        ...(activities.data ?? []).map((a: any) => a.campaign_id),
      ].filter(Boolean),
    ),
  );
  const { data: campaigns } = campaignIds.length
    ? await db().from("campaigns").select("id, name").in("id", campaignIds)
    : { data: [] };
  const campaignName: Dict<string> = {};
  for (const c of campaigns ?? []) campaignName[c.id] = c.name;
  const listName: Dict<string> = {};
  for (const l of (lists as any).data ?? []) listName[l.id] = l.name;

  return {
    lead: {
      id: lead.id,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null,
      email: lead.email,
      phone: lead.phone,
      linkedinUrl: lead.linkedin_url,
      jobTitle: lead.job_title,
      company: lead.company,
      website: lead.website,
      country: lead.country,
      city: lead.city,
      state: lead.state,
      status: lead.status,
      tags: lead.tags ?? [],
      leadSource: lead.lead_source,
      dealValue: lead.deal_value,
      workspaceId: lead.workspace_id,
      workspaceName: workspaces[lead.workspace_id] ?? "—",
      listName: lead.list_id ? (listName[lead.list_id] ?? null) : null,
      createdAt: lead.created_at,
      lastActivityAt: lead.last_activity_at,
    },
    campaigns: (recipients.data ?? []).map((r: any) => ({
      id: r.id,
      campaign: campaignName[r.campaign_id] ?? "—",
      status: r.status,
      currentStep: r.current_step,
      lastSentAt: r.last_sent_at,
      lastError: r.last_error,
    })),
    emails: (messages.data ?? []).map((m: any) => ({
      id: m.id,
      campaign: campaignName[m.campaign_id] ?? "—",
      subject: m.subject,
      status: m.status,
      sentAt: m.sent_at,
      error: m.last_error,
    })),
    replies: (replies.data ?? []).map((r: any) => ({
      id: r.id,
      subject: r.subject,
      sentiment: r.sentiment,
      receivedAt: r.received_at,
      fromEmail: r.from_email,
    })),
    notes: (notes.data ?? []).map((n: any) => ({ id: n.id, body: n.body, createdAt: n.created_at })),
    tasks: (tasks.data ?? []).map((t: any) => ({
      id: t.id,
      title: t.title,
      dueAt: t.due_at,
      completed: t.completed,
    })),
    activities: (activities.data ?? []).map((a: any) => ({
      id: a.id,
      type: a.type,
      detail: a.detail,
      campaign: a.campaign_id ? (campaignName[a.campaign_id] ?? null) : null,
      createdAt: a.created_at,
    })),
  };
}

/* ====================================================== email accounts */

export type AdminAccountFilters = {
  workspaceId?: string | null | undefined;
  provider?: string | null | undefined;
  status?: string | null | undefined;
  warmup?: string | null | undefined;
  search?: string | null | undefined;
};

/** Connection state derived from the mailbox's real test/auth columns. */
function connectionState(a: any): "connected" | "connecting" | "error" | "disabled" | "disconnected" {
  if (a.customer_enabled === false || a.paused) return "disabled";
  if (a.status === "failed" || a.auth_status === "failed") return "error";
  if (a.status === "verified" || a.auth_status === "verified") return "connected";
  if (!a.last_tested_at) return "connecting";
  return "disconnected";
}

export async function listAdminEmailAccounts(filters: AdminAccountFilters = {}) {
  let q = db()
    .from("sending_accounts")
    .select(
      "id, workspace_id, provider, label, from_email, from_name, status, auth_status, customer_enabled, paused, daily_limit, hourly_limit, sent_today, warmup_status, warmup_daily_target, health_score, last_tested_at, last_sent_at, last_error, created_at, domain_id, connection_method",
    )
    .order("created_at", { ascending: false })
    .limit(2000);
  if (filters.workspaceId) q = q.eq("workspace_id", filters.workspaceId);
  if (filters.provider) q = q.eq("provider", filters.provider);
  if (filters.warmup) q = q.eq("warmup_status", filters.warmup);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let accounts = (data ?? []) as any[];
  const term = (filters.search ?? "").trim().toLowerCase();
  if (term)
    accounts = accounts.filter((a) =>
      [a.from_email, a.label, a.from_name].filter(Boolean).some((v: string) =>
        v.toLowerCase().includes(term),
      ),
    );
  if (filters.status) accounts = accounts.filter((a) => connectionState(a) === filters.status);

  const [workspaces, domains, messages] = await Promise.all([
    workspaceNames(accounts.map((a) => a.workspace_id)),
    db().from("sending_domains").select("id, domain, dns_status"),
    db().from("campaign_messages").select("sending_account_id, status").eq("status", "sent"),
  ]);
  const domainById: Dict<any> = {};
  for (const d of (domains as any).data ?? []) domainById[d.id] = d;
  const sentCounts = tally(((messages as any).data ?? []) as any[], (m: any) => m.sending_account_id);

  return accounts.map((a) => ({
    id: a.id,
    email: a.from_email,
    label: a.label,
    workspaceId: a.workspace_id,
    workspaceName: workspaces[a.workspace_id] ?? "—",
    domain: a.domain_id
      ? (domainById[a.domain_id]?.domain ?? null)
      : String(a.from_email ?? "").split("@")[1] ?? null,
    domainStatus: a.domain_id ? (domainById[a.domain_id]?.dns_status ?? null) : null,
    provider: a.provider,
    connectionMethod: a.connection_method,
    connectionState: connectionState(a),
    sendingStatus: a.paused ? "paused" : a.customer_enabled === false ? "disabled" : "sending",
    warmupStatus: a.warmup_status,
    dailyLimit: a.daily_limit,
    hourlyLimit: a.hourly_limit,
    sentToday: a.sent_today ?? 0,
    emailsSent: sentCounts[a.id] ?? 0,
    healthScore: a.health_score,
    lastError: a.last_error,
    lastActivityAt: a.last_sent_at ?? a.last_tested_at ?? null,
    createdAt: a.created_at,
  }));
}

export async function getAdminEmailAccount(accountId: string) {
  const { data: account, error } = await db()
    .from("sending_accounts")
    .select(
      "id, workspace_id, provider, label, from_email, from_name, reply_to, status, auth_status, customer_enabled, paused, daily_limit, hourly_limit, sent_today, warmup_status, warmup_daily_target, warmup_started_at, warmup_target_days, health_score, spf_status, dkim_status, dmarc_status, mx_status, last_tested_at, last_sent_at, last_reply_at, last_error, created_at, domain_id, connection_method, admin_notes",
    )
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!account) throw new Error("Mailbox not found");

  const [workspaces, domain, checks, messages, warmupSettings, warmupStats, warmupEvents, audit] =
    await Promise.all([
      workspaceNames([account.workspace_id]),
      account.domain_id
        ? db()
            .from("sending_domains")
            .select("id, domain, dns_status, spf_status, dkim_status, dmarc_status, verified_at")
            .eq("id", account.domain_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      db()
        .from("sending_account_checks")
        .select("id, kind, ok, message, status_code, duration_ms, created_at")
        .eq("sending_account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(25),
      db()
        .from("campaign_messages")
        .select("id, status, to_email, subject, sent_at, last_error")
        .eq("sending_account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(100),
      db()
        .from("warmup_settings")
        .select("*")
        .eq("sending_account_id", accountId)
        .maybeSingle(),
      db()
        .from("warmup_daily_stats")
        .select("day, target, sent, delivered, bounced, failed, replied, health_score")
        .eq("sending_account_id", accountId)
        .order("day", { ascending: false })
        .limit(30),
      db()
        .from("warmup_events")
        .select("id, type, detail, occurred_at")
        .eq("sending_account_id", accountId)
        .order("occurred_at", { ascending: false })
        .limit(25),
      db()
        .from("sending_account_audit")
        .select("*")
        .eq("sending_account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  const msgRows = (messages.data ?? []) as any[];

  return {
    account: {
      id: account.id,
      email: account.from_email,
      fromName: account.from_name,
      replyTo: account.reply_to,
      label: account.label,
      provider: account.provider,
      connectionMethod: account.connection_method,
      connectionState: connectionState(account),
      sendingStatus: account.paused
        ? "paused"
        : account.customer_enabled === false
          ? "disabled"
          : "sending",
      workspaceId: account.workspace_id,
      workspaceName: workspaces[account.workspace_id] ?? "—",
      dailyLimit: account.daily_limit,
      hourlyLimit: account.hourly_limit,
      sentToday: account.sent_today ?? 0,
      healthScore: account.health_score,
      warmupStatus: account.warmup_status,
      warmupDailyTarget: account.warmup_daily_target,
      warmupStartedAt: account.warmup_started_at,
      auth: {
        spf: account.spf_status,
        dkim: account.dkim_status,
        dmarc: account.dmarc_status,
        mx: account.mx_status,
      },
      lastTestedAt: account.last_tested_at,
      lastSentAt: account.last_sent_at,
      lastReplyAt: account.last_reply_at,
      lastError: account.last_error,
      createdAt: account.created_at,
      adminNotes: account.admin_notes,
    },
    domain: (domain as any).data
      ? {
          id: (domain as any).data.id,
          domain: (domain as any).data.domain,
          status: (domain as any).data.dns_status,
          spf: (domain as any).data.spf_status,
          dkim: (domain as any).data.dkim_status,
          dmarc: (domain as any).data.dmarc_status,
          verifiedAt: (domain as any).data.verified_at,
        }
      : null,
    stats: {
      sent: msgRows.filter((m) => m.status === "sent").length,
      failed: msgRows.filter((m) => m.status === "failed").length,
      queued: msgRows.filter((m) => m.status === "pending" || m.status === "scheduled").length,
    },
    warmup: warmupSettings.data
      ? {
          enabled: warmupSettings.data.enabled,
          mode: warmupSettings.data.mode,
          startVolume: warmupSettings.data.start_volume,
          maxVolume: warmupSettings.data.max_volume,
          dailyIncrease: warmupSettings.data.daily_increase,
          rampDays: warmupSettings.data.ramp_days,
          pausedBySystem: warmupSettings.data.paused_by_system,
          pauseReason: warmupSettings.data.pause_reason,
          startedAt: warmupSettings.data.started_at,
        }
      : null,
    warmupStats: (warmupStats.data ?? []).map((s: any) => ({
      day: s.day,
      target: s.target,
      sent: s.sent,
      delivered: s.delivered,
      bounced: s.bounced,
      failed: s.failed,
      replied: s.replied,
      healthScore: s.health_score,
    })),
    warmupEvents: (warmupEvents.data ?? []).map((e: any) => ({
      id: e.id,
      type: e.type,
      detail: e.detail,
      at: e.occurred_at,
    })),
    checks: (checks.data ?? []).map((c: any) => ({
      id: c.id,
      kind: c.kind,
      ok: c.ok,
      message: c.message,
      statusCode: c.status_code,
      durationMs: c.duration_ms,
      at: c.created_at,
    })),
    errors: msgRows
      .filter((m) => m.last_error)
      .slice(0, 25)
      .map((m) => ({ id: m.id, at: m.sent_at, email: m.to_email, error: m.last_error })),
    activity: msgRows
      .filter((m) => m.sent_at)
      .slice(0, 25)
      .map((m) => ({ id: m.id, at: m.sent_at, email: m.to_email, subject: m.subject })),
    audit: (audit.data ?? []).map((a: any) => ({
      id: a.id,
      action: a.action ?? a.kind ?? "change",
      at: a.created_at,
      detail: a.detail ?? null,
    })),
  };
}

/** Enable or disable a customer mailbox for sending. */
export async function adminSetAccountEnabled(actorId: string, accountId: string, enabled: boolean) {
  const { data: account } = await db()
    .from("sending_accounts")
    .select("id, from_email, workspace_id, customer_enabled, paused")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) throw new Error("Mailbox not found");

  const { error } = await db()
    .from("sending_accounts")
    .update({ customer_enabled: enabled, paused: !enabled })
    .eq("id", accountId);
  if (error) throw new Error(error.message);

  await db().from("admin_audit_log").insert({
    actor_id: actorId,
    action: enabled ? "mailbox.enable" : "mailbox.disable",
    target_type: "sending_account",
    target_id: accountId,
    target_label: account.from_email,
    detail: { workspaceId: account.workspace_id, enabled },
  });
  return { ok: true };
}

/**
 * Runs the same provider credential + sender-domain verification test the
 * customer mailbox page uses. Credentials are loaded and discarded server-side;
 * only the pass/fail message is returned.
 */
export async function adminTestAccountConnection(actorId: string, accountId: string) {
  const { data: account } = await db()
    .from("sending_accounts")
    .select("id, workspace_id, provider, provider_id, from_email")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) throw new Error("Mailbox not found");

  const { loadAccountCredentials } = await import("@/lib/account-credentials.server");
  const credentials = await loadAccountCredentials(supabaseAdmin, {
    id: account.id as string,
    provider_id: (account.provider_id as string | null) ?? null,
    provider: (account.provider as string | null) ?? null,
  });
  const startedAt = Date.now();

  if (!credentials) {
    const message = "No provider credentials are configured for this mailbox.";
    await db()
      .from("sending_accounts")
      .update({
        status: "failed",
        auth_status: "failed",
        last_tested_at: new Date().toISOString(),
        last_error: message,
      })
      .eq("id", accountId);
    await db().from("sending_account_checks").insert({
      workspace_id: account.workspace_id,
      sending_account_id: accountId,
      actor_id: actorId,
      kind: "test",
      ok: false,
      provider: account.provider,
      message,
    });
    return { ok: false, message };
  }

  const { testProviderCredentials } = await import("@/lib/provider-credentials.server");
  const { checkSenderDomainVerification, senderDomain, DOMAIN_NOT_VERIFIED_MESSAGE } = await import(
    "@/lib/managed-sending.server"
  );
  const test = await testProviderCredentials(account.provider as string, credentials);
  const domain = senderDomain(account.from_email as string);
  const verification = test.ok
    ? await checkSenderDomainVerification(account.provider as string, credentials, domain, {
        fresh: true,
      })
    : { status: "unknown" as const, detail: "Provider credentials check failed." };
  const domainBlocked = verification.status === "not_verified";
  const ok = test.ok && !domainBlocked;
  const message = domainBlocked ? DOMAIN_NOT_VERIFIED_MESSAGE : test.message;

  await db()
    .from("sending_accounts")
    .update({
      status: domainBlocked ? "failed" : test.verified ? "verified" : test.ok ? "untested" : "failed",
      auth_status: domainBlocked
        ? "failed"
        : test.verified
          ? "verified"
          : test.ok
            ? "untested"
            : "failed",
      last_tested_at: new Date().toISOString(),
      last_error: ok ? null : message,
    })
    .eq("id", accountId);

  await db().from("sending_account_checks").insert({
    workspace_id: account.workspace_id,
    sending_account_id: accountId,
    actor_id: actorId,
    kind: "test",
    ok,
    provider: account.provider,
    message,
    duration_ms: Date.now() - startedAt,
    detail: { domain, domainVerification: verification.status, adminInitiated: true },
  });

  await db().from("admin_audit_log").insert({
    actor_id: actorId,
    action: "mailbox.test_connection",
    target_type: "sending_account",
    target_id: accountId,
    target_label: account.from_email,
    detail: { workspaceId: account.workspace_id, ok },
  });

  return { ok, message };
}

/* ============================================================== domains */

export type AdminDomainFilters = {
  workspaceId?: string | null | undefined;
  status?: string | null | undefined;
  search?: string | null | undefined;
};

export async function listAdminDomains(filters: AdminDomainFilters = {}) {
  let q = db()
    .from("sending_domains")
    .select(
      "id, workspace_id, domain, dns_status, spf_status, dkim_status, dmarc_status, mx_status, tracking_status, last_checked_at, verified_at, last_error, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (filters.workspaceId) q = q.eq("workspace_id", filters.workspaceId);
  if (filters.status) q = q.eq("dns_status", filters.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let domains = (data ?? []) as any[];
  const term = (filters.search ?? "").trim().toLowerCase();
  if (term) domains = domains.filter((d) => String(d.domain).toLowerCase().includes(term));

  const [workspaces, accounts, alerts] = await Promise.all([
    workspaceNames(domains.map((d) => d.workspace_id)),
    db().from("sending_accounts").select("id, domain_id, from_email"),
    db().from("domain_alerts").select("domain_id, severity, title").is("resolved_at", null),
  ]);
  const mailboxCounts = tally(((accounts as any).data ?? []) as any[], (a: any) => a.domain_id);
  const openAlerts = tally(((alerts as any).data ?? []) as any[], (a: any) => a.domain_id);

  return domains.map((d) => ({
    id: d.id,
    domain: d.domain,
    workspaceId: d.workspace_id,
    workspaceName: workspaces[d.workspace_id] ?? "—",
    status: d.dns_status,
    spf: d.spf_status,
    dkim: d.dkim_status,
    dmarc: d.dmarc_status,
    mx: d.mx_status,
    tracking: d.tracking_status,
    mailboxes: mailboxCounts[d.id] ?? 0,
    openAlerts: openAlerts[d.id] ?? 0,
    lastError: d.last_error,
    lastCheckedAt: d.last_checked_at,
    verifiedAt: d.verified_at,
    createdAt: d.created_at,
  }));
}

export async function getAdminDomain(domainId: string) {
  const { data: row, error } = await db()
    .from("sending_domains")
    .select("*")
    .eq("id", domainId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Domain not found");

  const { buildDnsRecords } = await import("@/lib/dns.server");
  const statuses: Dict<string> = {
    spf: row.spf_status,
    dkim: row.dkim_status,
    dmarc: row.dmarc_status,
    mx: row.mx_status,
    tracking: row.tracking_status,
  };
  const [workspaces, mailboxes, alerts] = await Promise.all([
    workspaceNames([row.workspace_id]),
    db()
      .from("sending_accounts")
      .select("id, from_email, status, warmup_status")
      .eq("domain_id", domainId),
    db()
      .from("domain_alerts")
      .select("id, kind, severity, title, detail, created_at, resolved_at")
      .eq("domain_id", domainId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  return {
    domain: {
      id: row.id,
      domain: row.domain,
      workspaceId: row.workspace_id,
      workspaceName: workspaces[row.workspace_id] ?? "—",
      status: row.dns_status,
      registrar: row.registrar,
      trackingHost: row.tracking_host,
      lastCheckedAt: row.last_checked_at,
      verifiedAt: row.verified_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      provider: row.provider,
      providerId: row.provider_id,
      providerStatus: row.provider_status,
      stage: row.disabled_at ? "disabled" : (row.stage ?? "pending_dns"),
      disabledAt: row.disabled_at,
    },
    records: (((row.provider_records ?? []) as any[]).length
      ? ((row.provider_records ?? []) as any[]).map((spec: any) => {
          const check = ((row.record_checks ?? []) as any[]).find((c: any) => c.id === spec.id);
          return { ...spec, status: check?.status ?? "pending", message: check?.message ?? null };
        })
      : buildDnsRecords(row.domain as string, row.dkim_selector as string).map((spec) => ({
          ...spec,
          status: statuses[spec.kind] ?? "pending",
        }))),
    mailboxes: (mailboxes.data ?? []).map((m: any) => ({
      id: m.id,
      email: m.from_email,
      status: m.status,
      warmupStatus: m.warmup_status,
    })),
    alerts: (alerts.data ?? []).map((a: any) => ({
      id: a.id,
      kind: a.kind,
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      at: a.created_at,
      resolvedAt: a.resolved_at,
    })),
  };
}

/**
 * Re-runs the existing DNS verification (live lookups) and persists the real
 * result. It never creates, edits or removes a customer's DNS records.
 */
/**
 * Admin re-check. This runs the exact same automatic pipeline the customer
 * triggers (DNS lookups + provider authorisation) — admins never manually
 * approve a domain, they only re-run or troubleshoot verification.
 */
export async function adminRecheckDomain(actorId: string, domainId: string) {
  const { data: row } = await db()
    .from("sending_domains")
    .select(
      "id, domain, dkim_selector, workspace_id, provider, provider_id, provider_domain_id, provider_records, stage, disabled_at",
    )
    .eq("id", domainId)
    .maybeSingle();
  if (!row) throw new Error("Domain not found");

  const { runDomainVerification } = await import("@/lib/domain-verification.server");
  const outcome = await runDomainVerification(db(), row);

  await db().from("admin_audit_log").insert({
    actor_id: actorId,
    action: "domain.recheck",
    target_type: "sending_domain",
    target_id: domainId,
    target_label: row.domain,
    detail: {
      workspaceId: row.workspace_id,
      stage: outcome.stage,
      provider: row.provider,
      providerDetail: outcome.providerDetail,
    },
  });

  return {
    status: outcome.readyToSend ? "verified" : outcome.dnsVerified ? "provider_pending" : "failed",
    stage: outcome.stage,
    provider: row.provider,
    providerDetail: outcome.providerDetail,
    errors: outcome.records
      .filter((record) => record.required && record.status === "failed")
      .map((record) => `${record.kind.toUpperCase()}: ${record.message ?? "not found"}`),
    records: outcome.records,
  };
}

/** Admin can disable or re-enable a domain (the only manual domain control). */
export async function adminSetDomainEnabled(actorId: string, domainId: string, enabled: boolean) {
  const { data: row } = await db()
    .from("sending_domains")
    .select("id, domain, workspace_id, stage")
    .eq("id", domainId)
    .maybeSingle();
  if (!row) throw new Error("Domain not found");

  const { error } = await db()
    .from("sending_domains")
    .update({
      disabled_at: enabled ? null : new Date().toISOString(),
      stage: enabled ? "pending_dns" : "disabled",
    })
    .eq("id", domainId);
  if (error) throw new Error(error.message);

  await db().from("admin_audit_log").insert({
    actor_id: actorId,
    action: enabled ? "domain.enable" : "domain.disable",
    target_type: "sending_domain",
    target_id: domainId,
    target_label: row.domain,
    detail: { workspaceId: row.workspace_id },
  });

  return { enabled };
}

/** Re-assign the sending infrastructure that handles a domain. */
export async function adminSetDomainProvider(actorId: string, domainId: string, providerId: string | null) {
  const { data: row } = await db()
    .from("sending_domains")
    .select("id, domain, workspace_id")
    .eq("id", domainId)
    .maybeSingle();
  if (!row) throw new Error("Domain not found");

  let provider: string | null = null;
  if (providerId) {
    const { data: p } = await db()
      .from("email_providers")
      .select("id, provider")
      .eq("id", providerId)
      .maybeSingle();
    if (!p) throw new Error("Provider not found");
    provider = p.provider as string;
  }

  const { error } = await db()
    .from("sending_domains")
    .update({
      provider,
      provider_id: providerId,
      provider_domain_id: null,
      provider_records: [],
      record_checks: [],
      provider_status: null,
      stage: "pending_dns",
      dns_status: "pending",
    })
    .eq("id", domainId);
  if (error) throw new Error(error.message);

  await db().from("admin_audit_log").insert({
    actor_id: actorId,
    action: "domain.provider_change",
    target_type: "sending_domain",
    target_id: domainId,
    target_label: row.domain,
    detail: { workspaceId: row.workspace_id, providerId, provider },
  });

  return { provider, providerId };
}

/* =============================================================== warmup */

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function listAdminWarmup(
  filters: AdminDomainFilters = {},
) {
  let q = db()
    .from("warmup_settings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (filters.workspaceId) q = q.eq("workspace_id", filters.workspaceId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const settings = (data ?? []) as any[];
  if (!settings.length) return [];

  const accountIds = settings.map((s) => s.sending_account_id);
  const [accounts, stats, events, workspaces, health] = await Promise.all([
    db()
      .from("sending_accounts")
      .select("id, from_email, workspace_id, warmup_status, warmup_daily_target")
      .in("id", accountIds),
    db()
      .from("warmup_daily_stats")
      .select("sending_account_id, day, target, sent, delivered, bounced, failed")
      .in("sending_account_id", accountIds)
      .eq("day", todayUtc()),
    db()
      .from("warmup_events")
      .select("sending_account_id, occurred_at")
      .in("sending_account_id", accountIds)
      .order("occurred_at", { ascending: false })
      .limit(2000),
    workspaceNames(settings.map((s) => s.workspace_id)),
    db().from("warmup_health").select("sending_account_id, score, status").in("sending_account_id", accountIds),
  ]);

  const accountById: Dict<any> = {};
  for (const a of (accounts as any).data ?? []) accountById[a.id] = a;
  const statsById: Dict<any> = {};
  for (const s of (stats as any).data ?? []) statsById[s.sending_account_id] = s;
  const healthById: Dict<any> = {};
  for (const h of (health as any).data ?? []) healthById[h.sending_account_id] = h;
  const lastEvent: Dict<string> = {};
  for (const e of ((events as any).data ?? []) as any[]) {
    if (!lastEvent[e.sending_account_id]) lastEvent[e.sending_account_id] = e.occurred_at;
  }

  let rows = settings.map((s) => {
    const account = accountById[s.sending_account_id];
    const today = statsById[s.sending_account_id] ?? null;
    const sent = today?.sent ?? 0;
    const delivered = today?.delivered ?? 0;
    const bounced = today?.bounced ?? 0;
    const failed = today?.failed ?? 0;
    const state = !s.enabled
      ? "stopped"
      : s.paused_by_system
        ? "paused"
        : (account?.warmup_status ?? "warming");
    const rampDay = s.started_at
      ? Math.min(
          s.ramp_days ?? 0,
          Math.floor((Date.now() - new Date(s.started_at).getTime()) / 86_400_000) + 1,
        )
      : null;
    return {
      accountId: s.sending_account_id,
      email: account?.from_email ?? "—",
      workspaceId: s.workspace_id,
      workspaceName: workspaces[s.workspace_id] ?? "—",
      enabled: s.enabled,
      state,
      pauseReason: s.pause_reason,
      dailyTarget: today?.target ?? account?.warmup_daily_target ?? null,
      sentToday: today ? sent : null,
      successfulToday: today ? delivered : null,
      failedToday: today ? bounced + failed : null,
      bounceRate: today && sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : null,
      healthScore: healthById[s.sending_account_id]?.score ?? null,
      healthStatus: healthById[s.sending_account_id]?.status ?? null,
      rampStage: rampDay ? `Day ${rampDay} of ${s.ramp_days}` : null,
      lastActivityAt: lastEvent[s.sending_account_id] ?? null,
    };
  });

  const term = (filters.search ?? "").trim().toLowerCase();
  if (term) rows = rows.filter((r) => r.email.toLowerCase().includes(term));
  if (filters.status) rows = rows.filter((r) => r.state === filters.status);
  return rows;
}

export async function getAdminWarmupAccount(accountId: string) {
  const [settings, account, stats, events, jobs, health] = await Promise.all([
    db().from("warmup_settings").select("*").eq("sending_account_id", accountId).maybeSingle(),
    db()
      .from("sending_accounts")
      .select("id, from_email, workspace_id, provider, warmup_status, warmup_daily_target, status")
      .eq("id", accountId)
      .maybeSingle(),
    db()
      .from("warmup_daily_stats")
      .select("day, target, scheduled, sent, delivered, bounced, complained, failed, replied, health_score")
      .eq("sending_account_id", accountId)
      .order("day", { ascending: false })
      .limit(60),
    db()
      .from("warmup_events")
      .select("id, type, detail, occurred_at, provider")
      .eq("sending_account_id", accountId)
      .order("occurred_at", { ascending: false })
      .limit(50),
    db()
      .from("warmup_jobs")
      .select("id, status, to_email, subject, scheduled_at, processed_at, attempts, error")
      .eq("sending_account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(50),
    db().from("warmup_health").select("*").eq("sending_account_id", accountId).maybeSingle(),
  ]);

  if (!account.data) throw new Error("Mailbox not found");
  const workspaces = await workspaceNames([account.data.workspace_id]);
  const s = settings.data;

  return {
    account: {
      id: account.data.id,
      email: account.data.from_email,
      provider: account.data.provider,
      status: account.data.status,
      warmupStatus: account.data.warmup_status,
      workspaceId: account.data.workspace_id,
      workspaceName: workspaces[account.data.workspace_id] ?? "—",
    },
    settings: s
      ? {
          enabled: s.enabled,
          mode: s.mode,
          startVolume: s.start_volume,
          maxVolume: s.max_volume,
          dailyIncrease: s.daily_increase,
          rampDays: s.ramp_days,
          replyRate: s.reply_rate,
          maxBounceRate: s.max_bounce_rate,
          minHealthScore: s.min_health_score,
          autoPause: s.auto_pause,
          pausedBySystem: s.paused_by_system,
          pauseReason: s.pause_reason,
          pausedAt: s.paused_at,
          startedAt: s.started_at,
          sendDays: s.send_days,
          sendStartHour: s.send_start_hour,
          sendEndHour: s.send_end_hour,
          timezone: s.timezone,
        }
      : null,
    dailyStats: (stats.data ?? []).map((r: any) => ({
      day: r.day,
      target: r.target,
      scheduled: r.scheduled,
      sent: r.sent,
      delivered: r.delivered,
      bounced: r.bounced,
      complained: r.complained,
      failed: r.failed,
      replied: r.replied,
      healthScore: r.health_score,
    })),
    events: (events.data ?? []).map((e: any) => ({
      id: e.id,
      type: e.type,
      detail: e.detail,
      provider: e.provider,
      at: e.occurred_at,
    })),
    jobs: (jobs.data ?? []).map((j: any) => ({
      id: j.id,
      status: j.status,
      toEmail: j.to_email,
      subject: j.subject,
      scheduledAt: j.scheduled_at,
      processedAt: j.processed_at,
      attempts: j.attempts,
      error: j.error,
    })),
    health: health.data
      ? {
          score: health.data.score,
          status: health.data.status,
          factors: health.data.factors,
          recommendation: health.data.recommendation,
          computedAt: health.data.computed_at,
        }
      : null,
  };
}

/**
 * Warmup control that writes only the state the existing warmup engine reads:
 * `warmup_settings.enabled` / pause flags and the mailbox warmup badge. The
 * worker keeps enforcing ramp limits, bounce ceilings and health auto-pause.
 */
export async function adminWarmupAction(
  actorId: string,
  accountId: string,
  action: "start" | "pause" | "resume" | "stop",
) {
  const { data: account } = await db()
    .from("sending_accounts")
    .select("id, workspace_id, from_email, status")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) throw new Error("Mailbox not found");
  if ((action === "start" || action === "resume") && account.status === "failed")
    throw new Error("Mailbox connection is failing — fix the connection before warming it up.");

  const { data: existing } = await db()
    .from("warmup_settings")
    .select("id, started_at, enabled")
    .eq("sending_account_id", accountId)
    .maybeSingle();

  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  let warmupBadge: string;

  if (action === "start") {
    patch = { enabled: true, paused_by_system: false, pause_reason: null, paused_at: null, started_at: existing?.started_at ?? now };
    warmupBadge = "warming";
  } else if (action === "resume") {
    if (!existing) throw new Error("Warmup has never been configured for this mailbox.");
    patch = { enabled: true, paused_by_system: false, pause_reason: null, paused_at: null };
    warmupBadge = "warming";
  } else if (action === "pause") {
    if (!existing?.enabled) throw new Error("Warmup is not running for this mailbox.");
    patch = { paused_by_system: true, pause_reason: "Paused by platform admin", paused_at: now };
    warmupBadge = "paused";
  } else {
    patch = { enabled: false, paused_by_system: false, pause_reason: null, paused_at: null };
    warmupBadge = "not_started";
  }

  if (existing) {
    const { error } = await db().from("warmup_settings").update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db()
      .from("warmup_settings")
      .insert({ ...patch, workspace_id: account.workspace_id, sending_account_id: accountId });
    if (error) throw new Error(error.message);
  }

  await db()
    .from("sending_accounts")
    .update({
      warmup_status: warmupBadge,
      ...(action === "start" ? { warmup_started_at: existing?.started_at ?? now } : {}),
    })
    .eq("id", accountId);

  if (action === "stop" || action === "pause") {
    // Drop only work the worker has not picked up yet.
    await db()
      .from("warmup_jobs")
      .update({ status: "cancelled" })
      .eq("sending_account_id", accountId)
      .in("status", ["queued"]);
  }

  await db().from("warmup_events").insert({
    workspace_id: account.workspace_id,
    sending_account_id: accountId,
    type: `admin_${action}`,
    detail: "Platform admin control action",
  });

  await db().from("admin_audit_log").insert({
    actor_id: actorId,
    action: `warmup.${action}`,
    target_type: "sending_account",
    target_id: accountId,
    target_label: account.from_email,
    detail: { workspaceId: account.workspace_id },
  });

  return { ok: true, state: warmupBadge };
}

/* ============================================================== filters */

/** Small option lists shared by the outreach filter bars. */
export async function adminOutreachFilterOptions() {
  const [workspaces, lists, campaigns, accounts] = await Promise.all([
    db().from("workspaces").select("id, name").order("name").limit(500),
    db().from("lead_lists").select("id, name, workspace_id").order("name").limit(500),
    db().from("campaigns").select("id, name, workspace_id").order("name").limit(500),
    db().from("sending_accounts").select("id, from_email, workspace_id").order("from_email").limit(500),
  ]);
  return {
    workspaces: (workspaces.data ?? []).map((w: any) => ({ id: w.id, name: w.name })),
    lists: (lists.data ?? []).map((l: any) => ({ id: l.id, name: l.name, workspaceId: l.workspace_id })),
    campaigns: (campaigns.data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      workspaceId: c.workspace_id,
    })),
    sendingAccounts: (accounts.data ?? []).map((a: any) => ({
      id: a.id,
      email: a.from_email,
      workspaceId: a.workspace_id,
    })),
  };
}

/* ==================================================== lead CSV export */

/**
 * CSV export of the admin lead directory.
 *
 * Reuses `listAdminLeads` so the export is exactly what the table shows:
 * the same filters, and either the current page or every matching row
 * (capped so a runaway export can never exhaust the worker).
 */
export async function exportAdminLeadsCsv(
  filters: AdminLeadFilters & { scope?: "page" | "all" | undefined } = {},
) {
  const scope = filters.scope ?? "page";
  const rows: any[] = [];
  if (scope === "page") {
    const result = await listAdminLeads(filters);
    rows.push(...result.rows);
  } else {
    const pageSize = 200;
    const max = 20000;
    for (let page = 1; rows.length < max; page += 1) {
      const result = await listAdminLeads({ ...filters, page, pageSize });
      rows.push(...result.rows);
      if (result.rows.length < pageSize || rows.length >= (result.total ?? 0)) break;
    }
  }

  const headers = [
    "email",
    "name",
    "company",
    "job_title",
    "workspace",
    "list",
    "campaigns",
    "status",
    "created_at",
    "last_activity_at",
  ];
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    // Neutralise spreadsheet formula injection on export.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.email,
        row.name,
        row.company,
        row.jobTitle,
        row.workspaceName,
        row.listName,
        (row.campaigns ?? []).join(" | "),
        row.status,
        row.createdAt,
        row.lastActivityAt,
      ]
        .map(escape)
        .join(","),
    );
  }

  return { csv: lines.join("\n"), count: rows.length };
}
