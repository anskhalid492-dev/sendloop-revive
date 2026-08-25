/**
 * Admin dashboard aggregation.
 *
 * Runs with the service-role client so platform-wide counts are accurate, but
 * is only ever reached after the caller has been verified as a platform admin
 * in `admin-dashboard.functions.ts`. Nothing here returns credentials, secrets
 * or payloads — only counts, timestamps and human-readable labels.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminMetric = {
  key: string;
  label: string;
  value: number | null;
  hint?: string;
};

export type AdminActivityItem = {
  id: string;
  at: string;
  kind:
    | "user"
    | "workspace"
    | "subscription"
    | "campaign"
    | "payment"
    | "ticket"
    | "job";
  title: string;
  detail?: string | null;
};

export type AdminAlert = {
  id: string;
  at: string;
  severity: "critical" | "warning";
  source: string;
  title: string;
  detail?: string | null;
};

export type AdminDashboard = {
  generatedAt: string;
  metrics: AdminMetric[];
  revenue: { month: string; cents: number }[];
  revenueTotalCents: number | null;
  mrrCents: number | null;
  subscriptions: { status: string; count: number }[];
  userGrowth: { date: string; count: number }[];
  emailActivity: { date: string; sent: number; failed: number }[];
  activity: AdminActivityItem[];
  alerts: AdminAlert[];
};

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

async function count(table: string, apply?: (q: any) => any): Promise<number | null> {
  let query = supabaseAdmin.from(table as never).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count: value, error } = await query;
  if (error) {
    console.error(`[AdminDashboard] Count query failed for ${table}: ${error.message}`);
    throw new Error(`Database query failed for ${table}: ${error.message}`);
  }
  return value ?? 0;
}

export async function buildAdminDashboard(): Promise<AdminDashboard> {
  const since30 = daysAgo(30);
  const since14 = daysAgo(14);
  const since180 = daysAgo(180);

  const [
    totalUsers,
    totalWorkspaces,
    activeSubscriptions,
    emailsSent,
    activeCampaigns,
    connectedAccounts,
    openTickets,
  ] = await Promise.all([
    count("profiles"),
    count("workspaces"),
    count("billing_subscriptions", (q) => q.in("status", ["active", "trialing"])),
    count("campaign_messages", (q) => q.eq("status", "sent")),
    count("campaigns", (q) => q.eq("status", "active")),
    count("sending_accounts"),
    count("support_tickets", (q) => q.in("status", ["open", "pending", "in_progress", "waiting"])),
  ]);

  const [
    activeMembers,
    subsRows,
    txRows,
    newProfiles,
    recentMessages,
    newWorkspaces,
    launchedCampaigns,
    newTickets,
    failedRuns,
    providerRows,
    failedAccounts,
    webhookFails,
    inboundFails,
  ] = await Promise.all([
    supabaseAdmin.from("workspace_members").select("user_id").gte("last_active_at", since30),
    supabaseAdmin
      .from("billing_subscriptions")
      .select("id, status, amount_cents, billing_interval, created_at, workspace_id")
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("billing_transactions")
      .select("id, amount_cents, status, kind, occurred_at, description")
      .gte("occurred_at", since180)
      .order("occurred_at", { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabaseAdmin
      .from("campaign_messages")
      .select("id, status, sent_at, updated_at")
      .gte("updated_at", since14)
      .limit(5000),
    supabaseAdmin
      .from("workspaces")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("campaigns")
      .select("id, name, launched_at")
      .not("launched_at", "is", null)
      .order("launched_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("support_tickets")
      .select("id, subject, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("automation_runs")
      .select("id, error, completed_at, created_at, status")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("email_providers")
      .select("id, name, status, last_error, last_tested_at, updated_at")
      .not("last_error", "is", null)
      .limit(20),
    supabaseAdmin
      .from("sending_accounts")
      .select("id, from_email, status, last_error, updated_at")
      .eq("status", "failed")
      .limit(20),
    supabaseAdmin
      .from("billing_webhook_events")
      .select("id, provider, event_type, status, error, signature_ok, received_at")
      .or("status.eq.failed,signature_ok.eq.false")
      .order("received_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("email_events")
      .select("id, provider, status, error, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const queryResults = [
    ["workspace_members", activeMembers],
    ["billing_subscriptions", subsRows],
    ["billing_transactions", txRows],
    ["profiles", newProfiles],
    ["campaign_messages", recentMessages],
    ["workspaces", newWorkspaces],
    ["campaigns", launchedCampaigns],
    ["support_tickets", newTickets],
    ["automation_runs", failedRuns],
    ["email_providers", providerRows],
    ["sending_accounts", failedAccounts],
    ["billing_webhook_events", webhookFails],
    ["email_events", inboundFails],
  ] as const;

  for (const [table, result] of queryResults) {
    if (result.error) {
      console.error(`[AdminDashboard] Query failed for ${table}: ${result.error.message}`);
      throw new Error(`Database query failed for ${table}: ${result.error.message}`);
    }
  }

  const activeUsers = new Set((activeMembers.data ?? []).map((r: any) => r.user_id)).size;

  const metrics: AdminMetric[] = [
    { key: "users", label: "Total users", value: totalUsers },
    {
      key: "active-users",
      label: "Active users",
      value: activeUsers,
      hint: "Active in the last 30 days",
    },
    { key: "workspaces", label: "Total workspaces", value: totalWorkspaces },
    {
      key: "subscriptions",
      label: "Active subscriptions",
      value: activeSubscriptions,
      hint: "Active or trialing",
    },
    { key: "emails", label: "Emails sent", value: emailsSent, hint: "All time, campaign sends" },
    { key: "campaigns", label: "Active campaigns", value: activeCampaigns },
    { key: "accounts", label: "Connected email accounts", value: connectedAccounts },
    { key: "tickets", label: "Open support tickets", value: openTickets },
  ];

  // Revenue: successful payment transactions bucketed by month.
  const paid = (txRows.data ?? []).filter((t: any) =>
    ["succeeded", "paid", "completed"].includes(String(t.status).toLowerCase()) &&
    String(t.kind).toLowerCase() !== "refund",
  );
  const revenueMap = new Map<string, number>();
  for (const t of paid as any[]) {
    const key = monthKey(t.occurred_at);
    revenueMap.set(key, (revenueMap.get(key) ?? 0) + (t.amount_cents ?? 0));
  }
  const revenue = Array.from(revenueMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, cents]) => ({ month, cents }));
  const revenueTotalCents = revenue.reduce((n, r) => n + r.cents, 0);

  const subs = (subsRows.data ?? []) as any[];
  const subStatus = new Map<string, number>();
  for (const s of subs) subStatus.set(s.status, (subStatus.get(s.status) ?? 0) + 1);
  const mrrCents = subs
    .filter((s) => ["active", "trialing"].includes(s.status))
    .reduce(
      (n, s) =>
        n + (s.billing_interval === "yearly" ? Math.round((s.amount_cents ?? 0) / 12) : s.amount_cents ?? 0),
      0,
    );

  // User growth over the last 30 days.
  const growthMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) growthMap.set(dayKey(daysAgo(i)), 0);
  for (const p of (newProfiles.data ?? []) as any[]) {
    const key = dayKey(p.created_at);
    if (growthMap.has(key)) growthMap.set(key, (growthMap.get(key) ?? 0) + 1);
  }
  const userGrowth = Array.from(growthMap.entries()).map(([date, c]) => ({ date, count: c }));

  // Email activity over the last 14 days.
  const activityMap = new Map<string, { sent: number; failed: number }>();
  for (let i = 13; i >= 0; i--) activityMap.set(dayKey(daysAgo(i)), { sent: 0, failed: 0 });
  for (const m of (recentMessages.data ?? []) as any[]) {
    const key = dayKey(m.sent_at ?? m.updated_at);
    const entry = activityMap.get(key);
    if (!entry) continue;
    if (m.status === "sent") entry.sent += 1;
    else if (m.status === "failed") entry.failed += 1;
  }
  const emailActivity = Array.from(activityMap.entries()).map(([date, v]) => ({ date, ...v }));

  // Recent activity feed.
  const activity: AdminActivityItem[] = [];
  for (const p of ((newProfiles.data ?? []) as any[]).slice(0, 15))
    activity.push({
      id: `user-${p.id}`,
      at: p.created_at,
      kind: "user",
      title: "New user signed up",
      detail: p.full_name || p.email,
    });
  for (const w of (newWorkspaces.data ?? []) as any[])
    activity.push({
      id: `ws-${w.id}`,
      at: w.created_at,
      kind: "workspace",
      title: "New workspace created",
      detail: w.name,
    });
  for (const s of subs.slice(0, 15))
    activity.push({
      id: `sub-${s.id}`,
      at: s.created_at,
      kind: "subscription",
      title: `Subscription ${s.status}`,
      detail: `${((s.amount_cents ?? 0) / 100).toFixed(2)} / ${s.billing_interval}`,
    });
  for (const c of (launchedCampaigns.data ?? []) as any[])
    activity.push({
      id: `camp-${c.id}`,
      at: c.launched_at,
      kind: "campaign",
      title: "Campaign launched",
      detail: c.name,
    });
  for (const t of (paid as any[]).slice(0, 15))
    activity.push({
      id: `tx-${t.id}`,
      at: t.occurred_at,
      kind: "payment",
      title: "Payment received",
      detail: `${((t.amount_cents ?? 0) / 100).toFixed(2)}${t.description ? ` · ${t.description}` : ""}`,
    });
  for (const t of (newTickets.data ?? []) as any[])
    activity.push({
      id: `ticket-${t.id}`,
      at: t.created_at,
      kind: "ticket",
      title: "Support ticket created",
      detail: t.subject,
    });
  for (const r of (failedRuns.data ?? []) as any[])
    activity.push({
      id: `run-${r.id}`,
      at: r.completed_at ?? r.created_at,
      kind: "job",
      title: "Automation run failed",
      detail: r.error,
    });

  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  // System alerts.
  const alerts: AdminAlert[] = [];
  for (const p of (providerRows.data ?? []) as any[])
    alerts.push({
      id: `provider-${p.id}`,
      at: p.last_tested_at ?? p.updated_at,
      severity: "critical",
      source: `Provider · ${p.name}`,
      title: "Provider reported an error",
      detail: p.last_error,
    });
  for (const a of (failedAccounts.data ?? []) as any[])
    alerts.push({
      id: `account-${a.id}`,
      at: a.updated_at,
      severity: "critical",
      source: `Mailbox · ${a.from_email}`,
      title: "Sending account failed",
      detail: a.last_error,
    });
  for (const w of (webhookFails.data ?? []) as any[])
    alerts.push({
      id: `webhook-${w.id}`,
      at: w.received_at,
      severity: w.signature_ok === false ? "critical" : "warning",
      source: `Billing webhook · ${w.provider}`,
      title: w.signature_ok === false ? "Invalid webhook signature" : "Webhook processing failed",
      detail: w.error ?? w.event_type,
    });
  for (const e of (inboundFails.data ?? []) as any[])
    alerts.push({
      id: `inbound-${e.id}`,
      at: e.created_at,
      severity: "warning",
      source: `Inbound · ${e.provider}`,
      title: "Inbound event failed",
      detail: e.error,
    });
  for (const r of ((failedRuns.data ?? []) as any[]).slice(0, 5))
    alerts.push({
      id: `job-${r.id}`,
      at: r.completed_at ?? r.created_at,
      severity: "warning",
      source: "Automations",
      title: "Failed job",
      detail: r.error,
    });

  alerts.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    generatedAt: new Date().toISOString(),
    metrics,
    revenue,
    revenueTotalCents,
    mrrCents,
    subscriptions: Array.from(subStatus.entries()).map(([status, c]) => ({ status, count: c })),
    userGrowth,
    emailActivity,
    activity: activity.slice(0, 25),
    alerts: alerts.slice(0, 20),
  };
}

export type AdminSearchResult = {
  id: string;
  kind: "user" | "workspace" | "campaign" | "ticket";
  label: string;
  sublabel?: string | null;
};

export async function runAdminSearch(term: string): Promise<AdminSearchResult[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const [users, workspaces, campaigns, tickets] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .or(`email.ilike.${like},full_name.ilike.${like}`)
      .limit(5),
    supabaseAdmin.from("workspaces").select("id, name, slug").ilike("name", like).limit(5),
    supabaseAdmin.from("campaigns").select("id, name, status").ilike("name", like).limit(5),
    supabaseAdmin
      .from("support_tickets")
      .select("id, subject, status")
      .ilike("subject", like)
      .limit(5),
  ]);

  const results: AdminSearchResult[] = [];
  for (const u of (users.data ?? []) as any[])
    results.push({ id: u.id, kind: "user", label: u.full_name || u.email || u.id, sublabel: u.email });
  for (const w of (workspaces.data ?? []) as any[])
    results.push({ id: w.id, kind: "workspace", label: w.name, sublabel: w.slug });
  for (const c of (campaigns.data ?? []) as any[])
    results.push({ id: c.id, kind: "campaign", label: c.name, sublabel: c.status });
  for (const t of (tickets.data ?? []) as any[])
    results.push({ id: t.id, kind: "ticket", label: t.subject, sublabel: t.status });
  return results;
}
