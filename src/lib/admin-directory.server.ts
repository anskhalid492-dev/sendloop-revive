/**
 * Admin user + workspace directory.
 *
 * Runs with the service-role client so the platform console can see every
 * tenant, but every entry point in `admin-directory.functions.ts` verifies the
 * caller holds the platform super admin role first (checked with the caller's
 * own RLS-bound client through the `has_role` security-definer function).
 *
 * Nothing here ever returns passwords, OAuth secrets, API keys, provider
 * credentials or encrypted material — only profile fields, membership,
 * subscription state, counts and timestamps.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = () => supabaseAdmin as any;

export type AdminUserRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  platformRole: "admin" | "support" | null;
  status: "active" | "suspended" | "invited";
  createdAt: string | null;
  lastActivityAt: string | null;
  workspaces: { id: string; name: string; role: string }[];
  primaryWorkspaceId: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
};

export type AdminUserDetail = AdminUserRow & {
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  provider: string | null;
  timezone: string | null;
  onboardingCompleted: boolean | null;
  creditBalance: number | null;
  activity: { id: string; at: string; title: string; detail: string | null }[];
  campaigns: { id: string; name: string; status: string; workspace: string; createdAt: string }[];
  tickets: { id: string; subject: string; status: string; priority: string; createdAt: string }[];
  billing: {
    id: string;
    at: string;
    kind: string;
    status: string;
    amountCents: number;
    currency: string;
    workspace: string;
  }[];
};

export type AdminWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  members: number;
  planName: string | null;
  subscriptionStatus: string | null;
  creditBalance: number | null;
  campaigns: number;
  sendingAccounts: number;
  createdAt: string;
  status: "active" | "suspended";
};

export type AdminWorkspaceDetail = AdminWorkspaceRow & {
  suspendedAt: string | null;
  suspendedReason: string | null;
  timezone: string | null;
  companyName: string | null;
  subscription: {
    planName: string | null;
    status: string | null;
    interval: string | null;
    amountCents: number | null;
    currency: string | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean | null;
    provider: string | null;
    environment: string | null;
  } | null;
  memberList: {
    userId: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    role: string;
    status: string;
    joinedAt: string;
    lastActiveAt: string | null;
  }[];
  usage: {
    emailsSent: number;
    campaigns: number;
    leads: number;
    sendingAccounts: number;
    warmupAccounts: number;
    creditsUsed: number | null;
  };
  invoices: {
    id: string;
    at: string | null;
    number: string | null;
    status: string;
    amountCents: number;
    currency: string;
    hostedUrl: string | null;
  }[];
  transactions: {
    id: string;
    at: string;
    kind: string;
    status: string;
    amountCents: number;
    currency: string;
  }[];
  activity: { id: string; at: string; type: string; detail: string | null; actor: string | null }[];
};

type AuthUser = {
  id: string;
  email?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  banned_until?: string | null;
  app_metadata?: { provider?: string } | null;
};

async function listAuthUsers(): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = (data?.users ?? []) as AuthUser[];
    out.push(...users);
    if (users.length < 200) break;
  }
  return out;
}

function isBanned(user: AuthUser) {
  if (!user.banned_until) return false;
  return new Date(user.banned_until).getTime() > Date.now();
}

async function planLookup() {
  const { data } = await db().from("plans").select("id,name").order("sort_order");
  const map = new Map<string, string>();
  for (const p of data ?? []) map.set(p.id, p.name);
  return map;
}

/** Subscription (plan + status) per workspace, preferring the billing table. */
async function subscriptionLookup(plans: Map<string, string>) {
  const map = new Map<string, { planName: string | null; status: string | null }>();
  const { data: legacy } = await db()
    .from("workspace_subscriptions")
    .select("workspace_id,plan_id,status");
  for (const s of legacy ?? []) {
    map.set(s.workspace_id, { planName: plans.get(s.plan_id) ?? null, status: s.status ?? null });
  }
  const { data: billing } = await db()
    .from("billing_subscriptions")
    .select("workspace_id,plan_id,status,created_at")
    .order("created_at", { ascending: false });
  for (const s of billing ?? []) {
    if (!map.has(s.workspace_id) || map.get(s.workspace_id)?.status == null) {
      map.set(s.workspace_id, {
        planName: plans.get(s.plan_id) ?? null,
        status: s.status ?? null,
      });
    }
  }
  return map;
}

async function countBy(table: string, column: string) {
  const map = new Map<string, number>();
  const { data } = await db().from(table).select(column);
  for (const row of (data ?? []) as any[]) {
    const key = row[column];
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export async function listAdminUsers() {
  const [authUsers, profilesRes, membersRes, workspacesRes, rolesRes, plans] = await Promise.all([
    listAuthUsers(),
    db().from("profiles").select("id,email,full_name,display_name,avatar_url,created_at"),
    db().from("workspace_members").select("workspace_id,user_id,role,created_at,last_active_at"),
    db().from("workspaces").select("id,name,slug,owner_id,status"),
    db().from("user_roles").select("user_id,role"),
    planLookup(),
  ]);

  const subs = await subscriptionLookup(plans);
  const profiles = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
  const workspaces = new Map((workspacesRes.data ?? []).map((w: any) => [w.id, w]));
  const roles = new Map<string, "admin" | "support">();
  for (const r of rolesRes.data ?? []) {
    if (r.role === "admin") roles.set(r.user_id, "admin");
    else if (r.role === "support" && !roles.has(r.user_id)) roles.set(r.user_id, "support");
  }

  const membership = new Map<string, { id: string; name: string; role: string; last: string | null }[]>();
  for (const m of membersRes.data ?? []) {
    const ws = workspaces.get(m.workspace_id);
    if (!ws) continue;
    const list = membership.get(m.user_id) ?? [];
    list.push({ id: ws.id, name: ws.name, role: m.role, last: m.last_active_at ?? null });
    membership.set(m.user_id, list);
  }

  const rows: AdminUserRow[] = authUsers.map((u) => {
    const profile: any = profiles.get(u.id);
    const mine = membership.get(u.id) ?? [];
    const primary = mine[0] ?? null;
    const sub = primary ? subs.get(primary.id) : undefined;
    const lastActivity = mine
      .map((m) => m.last)
      .filter(Boolean)
      .sort()
      .pop();
    return {
      id: u.id,
      email: u.email ?? profile?.email ?? null,
      fullName: profile?.display_name ?? profile?.full_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      platformRole: roles.get(u.id) ?? null,
      status: isBanned(u)
        ? "suspended"
        : u.email_confirmed_at || u.confirmed_at
          ? "active"
          : "invited",
      createdAt: u.created_at ?? profile?.created_at ?? null,
      lastActivityAt: (lastActivity as string | undefined) ?? u.last_sign_in_at ?? null,
      workspaces: mine.map((m) => ({ id: m.id, name: m.name, role: m.role })),
      primaryWorkspaceId: primary?.id ?? null,
      planName: sub?.planName ?? null,
      subscriptionStatus: sub?.status ?? null,
    };
  });

  return rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function getAdminUser(userId: string): Promise<AdminUserDetail> {
  const { data: authRes, error } = await db().auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);
  const authUser = authRes?.user as AuthUser | undefined;
  if (!authUser) throw new Error("User not found");

  const [profileRes, membersRes, rolesRes, plans] = await Promise.all([
    db().from("profiles").select("*").eq("id", userId).maybeSingle(),
    db()
      .from("workspace_members")
      .select("workspace_id,role,created_at,last_active_at")
      .eq("user_id", userId),
    db().from("user_roles").select("role").eq("user_id", userId),
    planLookup(),
  ]);

  const workspaceIds = (membersRes.data ?? []).map((m: any) => m.workspace_id);
  const [workspacesRes, subs] = await Promise.all([
    workspaceIds.length
      ? db().from("workspaces").select("id,name,slug,status").in("id", workspaceIds)
      : Promise.resolve({ data: [] }),
    subscriptionLookup(plans),
  ]);
  const wsMap = new Map((workspacesRes.data ?? []).map((w: any) => [w.id, w]));

  const [activityRes, campaignsRes, ticketsRes, txRes] = await Promise.all([
    workspaceIds.length
      ? db()
          .from("workspace_activity")
          .select("id,type,detail,created_at,workspace_id")
          .in("workspace_id", workspaceIds)
          .or(`actor_id.eq.${userId},target_user_id.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] }),
    db()
      .from("campaigns")
      .select("id,name,status,created_at,workspace_id")
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    db()
      .from("support_tickets")
      .select("id,subject,status,priority,created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    workspaceIds.length
      ? db()
          .from("billing_transactions")
          .select("id,kind,status,amount_cents,currency,occurred_at,workspace_id")
          .in("workspace_id", workspaceIds)
          .order("occurred_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
  ]);

  const profile: any = profileRes.data ?? {};
  const mine = (membersRes.data ?? []).map((m: any) => ({
    id: m.workspace_id,
    name: wsMap.get(m.workspace_id)?.name ?? "Unknown workspace",
    role: m.role,
    last: m.last_active_at ?? null,
  }));
  const primary = mine[0] ?? null;
  const sub = primary ? subs.get(primary.id) : undefined;
  const platformRole = (rolesRes.data ?? []).some((r: any) => r.role === "admin")
    ? "admin"
    : (rolesRes.data ?? []).some((r: any) => r.role === "support")
      ? "support"
      : null;

  return {
    id: userId,
    email: authUser.email ?? profile.email ?? null,
    fullName: profile.display_name ?? profile.full_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
    platformRole: platformRole as "admin" | "support" | null,
    status: isBanned(authUser)
      ? "suspended"
      : authUser.email_confirmed_at || authUser.confirmed_at
        ? "active"
        : "invited",
    createdAt: authUser.created_at ?? null,
    lastActivityAt:
      (mine.map((m) => m.last).filter(Boolean).sort().pop() as string | undefined) ??
      authUser.last_sign_in_at ??
      null,
    workspaces: mine.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    primaryWorkspaceId: primary?.id ?? null,
    planName: sub?.planName ?? null,
    subscriptionStatus: sub?.status ?? null,
    emailConfirmedAt: authUser.email_confirmed_at ?? authUser.confirmed_at ?? null,
    lastSignInAt: authUser.last_sign_in_at ?? null,
    provider: authUser.app_metadata?.provider ?? null,
    timezone: profile.timezone ?? null,
    onboardingCompleted: profile.onboarding_completed ?? null,
    // No credit ledger exists in this schema yet — surfaced as "No data".
    creditBalance: null,
    activity: (activityRes.data ?? []).map((a: any) => ({
      id: a.id,
      at: a.created_at,
      title: a.type,
      detail: a.detail ?? null,
    })),
    campaigns: (campaignsRes.data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      workspace: wsMap.get(c.workspace_id)?.name ?? "—",
      createdAt: c.created_at,
    })),
    tickets: (ticketsRes.data ?? []).map((t: any) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      createdAt: t.created_at,
    })),
    billing: (txRes.data ?? []).map((t: any) => ({
      id: t.id,
      at: t.occurred_at,
      kind: t.kind,
      status: t.status,
      amountCents: t.amount_cents ?? 0,
      currency: t.currency ?? "usd",
      workspace: wsMap.get(t.workspace_id)?.name ?? "—",
    })),
  };
}

export async function listAdminWorkspaces(): Promise<AdminWorkspaceRow[]> {
  const [wsRes, profilesRes, plans] = await Promise.all([
    db()
      .from("workspaces")
      .select("id,name,slug,owner_id,created_at,status")
      .order("created_at", { ascending: false }),
    db().from("profiles").select("id,email,full_name,display_name"),
    planLookup(),
  ]);
  const [subs, memberCounts, campaignCounts, accountCounts] = await Promise.all([
    subscriptionLookup(plans),
    countBy("workspace_members", "workspace_id"),
    countBy("campaigns", "workspace_id"),
    countBy("sending_accounts", "workspace_id"),
  ]);
  const profiles = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));

  return (wsRes.data ?? []).map((w: any) => {
    const owner: any = w.owner_id ? profiles.get(w.owner_id) : null;
    const sub = subs.get(w.id);
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      ownerId: w.owner_id ?? null,
      ownerName: owner?.display_name ?? owner?.full_name ?? null,
      ownerEmail: owner?.email ?? null,
      members: memberCounts.get(w.id) ?? 0,
      planName: sub?.planName ?? null,
      subscriptionStatus: sub?.status ?? null,
      creditBalance: null,
      campaigns: campaignCounts.get(w.id) ?? 0,
      sendingAccounts: accountCounts.get(w.id) ?? 0,
      createdAt: w.created_at,
      status: w.status === "suspended" ? "suspended" : "active",
    };
  });
}

export async function getAdminWorkspace(workspaceId: string): Promise<AdminWorkspaceDetail> {
  const { data: ws, error } = await db()
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!ws) throw new Error("Workspace not found");

  const plans = await planLookup();
  const [membersRes, subsRes, campaignsRes, accountsRes, invoicesRes, txRes, activityRes] =
    await Promise.all([
      db()
        .from("workspace_members")
        .select("user_id,role,created_at,last_active_at")
        .eq("workspace_id", workspaceId),
      db()
        .from("billing_subscriptions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1),
      db().from("campaigns").select("id,status").eq("workspace_id", workspaceId),
      db()
        .from("sending_accounts")
        .select("id,warmup_status")
        .eq("workspace_id", workspaceId),
      db()
        .from("billing_invoices")
        .select("id,number,status,amount_cents,currency,issued_at,hosted_url")
        .eq("workspace_id", workspaceId)
        .order("issued_at", { ascending: false })
        .limit(15),
      db()
        .from("billing_transactions")
        .select("id,kind,status,amount_cents,currency,occurred_at")
        .eq("workspace_id", workspaceId)
        .order("occurred_at", { ascending: false })
        .limit(15),
      db()
        .from("workspace_activity")
        .select("id,type,detail,created_at,actor_id,target_email")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  const memberIds = (membersRes.data ?? []).map((m: any) => m.user_id);
  const actorIds = (activityRes.data ?? []).map((a: any) => a.actor_id).filter(Boolean);
  const ids = Array.from(new Set([...memberIds, ...actorIds, ws.owner_id].filter(Boolean)));
  const { data: profileRows } = ids.length
    ? await db().from("profiles").select("id,email,full_name,display_name,avatar_url").in("id", ids)
    : { data: [] as any[] };
  const profiles = new Map((profileRows ?? []).map((p: any) => [p.id, p]));

  const [{ count: leadCount }, { count: sentCount }] = await Promise.all([
    db().from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    db()
      .from("campaign_messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "sent"),
  ]);

  const legacySub = !subsRes.data?.length
    ? (
        await db()
          .from("workspace_subscriptions")
          .select("*")
          .eq("workspace_id", workspaceId)
          .maybeSingle()
      ).data
    : null;
  const sub: any = subsRes.data?.[0] ?? legacySub ?? null;
  const owner: any = ws.owner_id ? profiles.get(ws.owner_id) : null;

  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    ownerId: ws.owner_id ?? null,
    ownerName: owner?.display_name ?? owner?.full_name ?? null,
    ownerEmail: owner?.email ?? null,
    members: membersRes.data?.length ?? 0,
    planName: sub?.plan_id ? (plans.get(sub.plan_id) ?? null) : null,
    subscriptionStatus: sub?.status ?? null,
    creditBalance: null,
    campaigns: campaignsRes.data?.length ?? 0,
    sendingAccounts: accountsRes.data?.length ?? 0,
    createdAt: ws.created_at,
    status: ws.status === "suspended" ? "suspended" : "active",
    suspendedAt: ws.suspended_at ?? null,
    suspendedReason: ws.suspended_reason ?? null,
    timezone: ws.timezone ?? null,
    companyName: ws.company_name ?? null,
    subscription: sub
      ? {
          planName: sub.plan_id ? (plans.get(sub.plan_id) ?? null) : null,
          status: sub.status ?? null,
          interval: sub.billing_interval ?? null,
          amountCents: sub.amount_cents ?? null,
          currency: sub.currency ?? null,
          currentPeriodEnd: sub.current_period_end ?? null,
          trialEndsAt: sub.trial_ends_at ?? null,
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? null,
          provider: sub.provider ?? null,
          environment: sub.environment ?? null,
        }
      : null,
    memberList: (membersRes.data ?? []).map((m: any) => {
      const p: any = profiles.get(m.user_id);
      return {
        userId: m.user_id,
        name: p?.display_name ?? p?.full_name ?? null,
        email: p?.email ?? null,
        avatarUrl: p?.avatar_url ?? null,
        role: m.role,
        status: m.user_id === ws.owner_id ? "owner" : "active",
        joinedAt: m.created_at,
        lastActiveAt: m.last_active_at ?? null,
      };
    }),
    usage: {
      emailsSent: sentCount ?? 0,
      campaigns: campaignsRes.data?.length ?? 0,
      leads: leadCount ?? 0,
      sendingAccounts: accountsRes.data?.length ?? 0,
      warmupAccounts: (accountsRes.data ?? []).filter(
        (a: any) => a.warmup_status && a.warmup_status !== "off",
      ).length,
      creditsUsed: null,
    },
    invoices: (invoicesRes.data ?? []).map((i: any) => ({
      id: i.id,
      at: i.issued_at ?? null,
      number: i.number ?? null,
      status: i.status,
      amountCents: i.amount_cents ?? 0,
      currency: i.currency ?? "usd",
      hostedUrl: i.hosted_url ?? null,
    })),
    transactions: (txRes.data ?? []).map((t: any) => ({
      id: t.id,
      at: t.occurred_at,
      kind: t.kind,
      status: t.status,
      amountCents: t.amount_cents ?? 0,
      currency: t.currency ?? "usd",
    })),
    activity: (activityRes.data ?? []).map((a: any) => {
      const p: any = a.actor_id ? profiles.get(a.actor_id) : null;
      return {
        id: a.id,
        at: a.created_at,
        type: a.type,
        detail: a.detail ?? a.target_email ?? null,
        actor: p?.display_name ?? p?.full_name ?? p?.email ?? null,
      };
    }),
  };
}

async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  targetLabel: string | null,
  detail: Record<string, unknown>,
) {
  await db().from("admin_audit_log").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    target_label: targetLabel,
    detail,
  });
}

/** Suspend or reactivate a user by banning their auth session. */
export async function setUserSuspended(
  actorId: string,
  userId: string,
  suspended: boolean,
  reason: string | null,
) {
  if (actorId === userId) throw new Error("You cannot suspend your own account");
  const { data, error } = await db().auth.admin.updateUserById(userId, {
    ban_duration: suspended ? "876000h" : "none",
  });
  if (error) throw new Error(error.message);
  await audit(
    actorId,
    suspended ? "user.suspend" : "user.reactivate",
    "user",
    userId,
    data?.user?.email ?? null,
    { reason },
  );
  return { ok: true, status: suspended ? "suspended" : "active" };
}

/** Suspend or reactivate a workspace. */
export async function setWorkspaceSuspended(
  actorId: string,
  workspaceId: string,
  suspended: boolean,
  reason: string | null,
) {
  const { data, error } = await db()
    .from("workspaces")
    .update({
      status: suspended ? "suspended" : "active",
      suspended_at: suspended ? new Date().toISOString() : null,
      suspended_reason: suspended ? reason : null,
      suspended_by: suspended ? actorId : null,
    })
    .eq("id", workspaceId)
    .select("id,name,status")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workspace not found");

  await Promise.all([
    audit(
      actorId,
      suspended ? "workspace.suspend" : "workspace.reactivate",
      "workspace",
      workspaceId,
      data.name,
      { reason },
    ),
    db().from("workspace_activity").insert({
      workspace_id: workspaceId,
      actor_id: actorId,
      type: suspended ? "workspace.suspended" : "workspace.reactivated",
      detail: reason ?? "By Sendloop staff",
    }),
  ]);

  return { ok: true, status: data.status as "active" | "suspended" };
}
