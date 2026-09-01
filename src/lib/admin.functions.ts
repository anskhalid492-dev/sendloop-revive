/**
 * MunchReach admin: managed sending infrastructure.
 *
 * Every function here re-checks that the caller holds the platform `admin`
 * role before touching provider credentials, the sending pool or workspace
 * assignments. Credentials never leave the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMAIL_SCOPES, masterEnabled, SCOPE_COLUMN } from "@/lib/email-provider-scope";
import { PROVIDER_IDS } from "@/lib/providers/registry";

const providerEnum = z.enum(PROVIDER_IDS);

async function assertAdmin(
  context: { supabase: any; userId: string; claims?: Record<string, any> },
  options: { sensitive?: boolean; action?: string } = {},
) {
  // Single hardened guard: platform role + admin session revocation + MFA
  // (+ recent re-authentication for sensitive operations).
  const { assertSuperAdmin } = await import("@/lib/admin-access.server");
  await assertSuperAdmin(context, options);
}

export type AdminProvider = {
  id: string;
  provider: string;
  name: string;
  is_enabled: boolean;
  customer_enabled: boolean;
  system_enabled: boolean;
  priority: number;
  daily_capacity: number;
  hourly_capacity: number;
  cost_per_1k_cents: number;
  status: string;
  last_tested_at: string | null;
  last_error: string | null;
  notes: string | null;
  created_at: string;
  mode: string | null;
  region: string | null;
  health_status: string | null;
  health_checked_at: string | null;
  health_detail: string | null;
  last_success_at: string | null;
  success_count: number | null;
  failure_count: number | null;
  sent_hour: number | null;
  sent_day: number | null;
};

export type ProviderRoutingEvent = {
  id: string;
  provider_id: string | null;
  previous_provider_id: string | null;
  domain: string | null;
  event: string;
  reason: string | null;
  detail: string | null;
  created_at: string;
};

export type AdminSendingAccount = {
  id: string;
  provider: string;
  provider_id: string | null;
  workspace_id: string | null;
  label: string;
  from_name: string;
  from_email: string;
  daily_limit: number;
  hourly_limit: number;
  sent_today: number;
  health_score: number;
  warmup_status: string;
  status: string;
  paused: boolean;
  customer_enabled: boolean;
  assigned_at: string | null;
  created_at: string;
};

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    return { isAdmin: Boolean(data) };
  });

/** True when the database predates the per-scope provider permission columns. */
function isMissingScopeColumns(message: string | null | undefined): boolean {
  const text = message ?? "";
  return /customer_enabled|system_enabled/.test(text) && /does not exist|schema cache/i.test(text);
}

const SCOPE_COLUMNS_MISSING_MESSAGE =
  "This database is missing the per-scope provider permission columns (customer_enabled / system_enabled). Apply supabase/manual/provider-scopes.sql to this project, then retry.";

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("email_providers")
      .select("*")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    // Older databases without the scope columns still render: both scopes fall
    // back to the legacy master switch until the migration is applied.
    return (data ?? []).map((row: any) => ({
      ...row,
      customer_enabled: row.customer_enabled ?? row.is_enabled ?? false,
      system_enabled: row.system_enabled ?? row.is_enabled ?? false,
    })) as AdminProvider[];
  });

/**
 * Flips ONE provider permission (customer or admin/system) without touching
 * the other. Generic across every provider — nothing is hardcoded.
 */
export const setProviderScopeEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        scope: z.enum(EMAIL_SCOPES),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, { action: "change email provider permissions" });

    const { data: current, error: readError } = await context.supabase
      .from("email_providers")
      .select("id, name, is_enabled, customer_enabled, system_enabled")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) {
      if (isMissingScopeColumns(readError.message)) throw new Error(SCOPE_COLUMNS_MISSING_MESSAGE);
      throw new Error(readError.message);
    }
    if (!current) throw new Error("Provider not found");

    const next = {
      customer_enabled: current.customer_enabled !== false,
      system_enabled: current.system_enabled !== false,
      [SCOPE_COLUMN[data.scope]]: data.enabled,
    } as { customer_enabled: boolean; system_enabled: boolean };

    const { error } = await context.supabase
      .from("email_providers")
      .update({ ...next, is_enabled: masterEnabled(next), updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) {
      if (isMissingScopeColumns(error.message)) throw new Error(SCOPE_COLUMNS_MISSING_MESSAGE);
      throw new Error(error.message);
    }

    return { ok: true, id: data.id, ...next };
  });


export const saveProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        provider: providerEnum,
        name: z.string().trim().min(2).max(80),
        isEnabled: z.boolean(),
        customerEnabled: z.boolean().optional(),
        systemEnabled: z.boolean().optional(),
        priority: z.number().int().min(1).max(999),
        dailyCapacity: z.number().int().min(0).max(1_000_000),
        hourlyCapacity: z.number().int().min(0).max(100_000),
        costPer1kCents: z.number().int().min(0).max(100_000),
        mode: z.enum(["sandbox", "live"]).optional(),
        region: z.string().trim().max(40).optional(),
        notes: z.string().trim().max(500).optional(),
        credentials: z.record(z.string(), z.string().min(1)).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, { sensitive: true, action: "change email provider credentials" });

    // Customer and admin/system permissions are independent. When the caller
    // does not send them, the legacy switch seeds both.
    const customerEnabled = data.customerEnabled ?? data.isEnabled;
    const systemEnabled = data.systemEnabled ?? data.isEnabled;

    const row = {
      provider: data.provider,
      name: data.name,
      is_enabled: masterEnabled({ customer_enabled: customerEnabled, system_enabled: systemEnabled }),
      customer_enabled: customerEnabled,
      system_enabled: systemEnabled,
      priority: data.priority,
      daily_capacity: data.dailyCapacity,
      hourly_capacity: data.hourlyCapacity,
      cost_per_1k_cents: data.costPer1kCents,
      mode: data.mode ?? "live",
      region: data.region || null,
      notes: data.notes || null,
    };

    let providerId = data.id;
    if (providerId) {
      const { error } = await context.supabase
        .from("email_providers")
        .update(row)
        .eq("id", providerId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await context.supabase
        .from("email_providers")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      providerId = created.id as string;
    }

    if (data.credentials && Object.keys(data.credentials).length > 0) {
      const { encryptCredentials, testProviderCredentials } = await import(
        "./provider-credentials.server"
      );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const result = await testProviderCredentials(data.provider, data.credentials);
      const { error: secretError } = await supabaseAdmin.from("email_provider_secrets").upsert(
        {
          provider_id: providerId,
          credentials_ciphertext: encryptCredentials(data.credentials),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id" },
      );
      if (secretError) throw new Error(secretError.message);

      await context.supabase
        .from("email_providers")
        .update({
          status: result.verified ? "verified" : result.ok ? "untested" : "failed",
          last_tested_at: new Date().toISOString(),
          last_error: result.ok ? null : result.message,
        })
        .eq("id", providerId);

      return { id: providerId, ...result };
    }

    return { id: providerId, ok: true, verified: false, message: "Provider saved." };
  });

export const testProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getAdapter, readCredentials } = await import("./providers/adapter.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: provider, error } = await context.supabase
      .from("email_providers")
      .select("id, provider")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!provider) throw new Error("Provider not found");

    const { data: secret } = await supabaseAdmin
      .from("email_provider_secrets")
      .select("credentials_ciphertext")
      .eq("provider_id", data.id)
      .maybeSingle();
    if (!secret) throw new Error("No credentials stored for this provider yet");

    const result = await getAdapter(provider.provider).validateConnection(
      readCredentials(secret.credentials_ciphertext),
    );

    await context.supabase
      .from("email_providers")
      .update({
        status: result.verified ? "verified" : result.ok ? "untested" : "failed",
        last_tested_at: new Date().toISOString(),
        last_error: result.ok ? null : result.message,
      })
      .eq("id", data.id);

    return result;
  });

export const deleteProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, { sensitive: true, action: "delete email provider" });
    const { error } = await context.supabase.from("email_providers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Runs a live health probe against every provider in the global pool and
 * persists the result. Routing consumes these health values automatically.
 */
export const runProviderPoolHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkPoolHealth } = await import("@/lib/provider-pool.server");
    const results = await checkPoolHealth(supabaseAdmin);
    return { ok: true, results };
  });

/** Global routing / failover audit trail. */
export const listProviderRoutingEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("provider_routing_events")
      .select("id, provider_id, previous_provider_id, domain, event, reason, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as ProviderRoutingEvent[];
  });

export const listAllSendingAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("sending_accounts")
      .select(
        "id, provider, provider_id, workspace_id, label, from_name, from_email, daily_limit, hourly_limit, sent_today, health_score, warmup_status, status, paused, customer_enabled, assigned_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminSendingAccount[];
  });

export const listAllWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("workspaces")
      .select("id, name, slug, outreach_type, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string;
      name: string;
      slug: string;
      outreach_type: string | null;
      created_at: string;
    }[];
  });

export const saveSendingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        providerId: z.string().uuid(),
        provider: providerEnum,
        label: z.string().trim().min(2).max(80),
        fromName: z.string().trim().min(1).max(80),
        fromEmail: z.string().trim().email(),
        replyTo: z.string().trim().email().or(z.literal("")).optional(),
        dailyLimit: z.number().int().min(1).max(5000),
        hourlyLimit: z.number().int().min(1).max(1000),
        warmupDailyTarget: z.number().int().min(1).max(1000),
        warmupStatus: z.enum(["warming", "ready", "paused"]),
        workspaceId: z.string().uuid().nullable(),
        paused: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const row = {
      provider_id: data.providerId,
      provider: data.provider,
      label: data.label,
      from_name: data.fromName,
      from_email: data.fromEmail,
      reply_to: data.replyTo || null,
      daily_limit: data.dailyLimit,
      hourly_limit: data.hourlyLimit,
      warmup_daily_target: data.warmupDailyTarget,
      warmup_status: data.warmupStatus,
      workspace_id: data.workspaceId,
      paused: data.paused,
      assigned_at: data.workspaceId ? new Date().toISOString() : null,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("sending_accounts")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: created, error } = await context.supabase
      .from("sending_accounts")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const assignSendingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), workspaceId: z.string().uuid().nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("sending_accounts")
      .update({
        workspace_id: data.workspaceId,
        assigned_at: data.workspaceId ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSendingAccountPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), paused: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("sending_accounts")
      .update({ paused: data.paused })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSendingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, { sensitive: true, action: "delete sending account" });
    const { error } = await context.supabase.from("sending_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendAdminTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), to: z.string().trim().email() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getAdapter, readCredentials } = await import("./providers/adapter.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: account, error } = await context.supabase
      .from("sending_accounts")
      .select("id, provider, provider_id, from_name, from_email")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account?.provider_id) throw new Error("This account is not linked to a provider yet");

    const { data: secret } = await supabaseAdmin
      .from("email_provider_secrets")
      .select("credentials_ciphertext")
      .eq("provider_id", account.provider_id)
      .maybeSingle();
    if (!secret) throw new Error("No credentials stored for this provider yet");

    const result = await getAdapter(account.provider).sendEmail(
      readCredentials(secret.credentials_ciphertext),
      {
        fromName: account.from_name,
        fromEmail: account.from_email,
        to: data.to,
        subject: "MunchReach infrastructure test",
        text: "Test send from the MunchReach sending pool.",
      },
    );

    await context.supabase
      .from("sending_accounts")
      .update({
        status: result.ok ? "verified" : "failed",
        last_tested_at: new Date().toISOString(),
        last_error: result.ok ? null : result.message,
      })
      .eq("id", data.id);

    return result;
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const [providers, accounts, workspaces, campaigns] = await Promise.all([
      context.supabase.from("email_providers").select("id, provider, name, is_enabled, daily_capacity, cost_per_1k_cents"),
      context.supabase
        .from("sending_accounts")
        .select("id, provider, workspace_id, daily_limit, sent_today, health_score, warmup_status, paused, status"),
      context.supabase.from("workspaces").select("id"),
      context.supabase.from("campaigns").select("id, status"),
    ]);

    const accountRows = (accounts.data ?? []) as {
      provider: string;
      workspace_id: string | null;
      daily_limit: number;
      sent_today: number;
      health_score: number;
      warmup_status: string;
      paused: boolean;
      status: string;
    }[];

    const byProvider = new Map<string, { accounts: number; capacity: number; sentToday: number }>();
    for (const a of accountRows) {
      const entry = byProvider.get(a.provider) ?? { accounts: 0, capacity: 0, sentToday: 0 };
      entry.accounts += 1;
      entry.capacity += a.daily_limit;
      entry.sentToday += a.sent_today;
      byProvider.set(a.provider, entry);
    }

    return {
      providers: (providers.data ?? []).length,
      workspaces: (workspaces.data ?? []).length,
      campaigns: (campaigns.data ?? []).length,
      activeCampaigns: ((campaigns.data ?? []) as { status: string }[]).filter(
        (c) => c.status === "active",
      ).length,
      pool: {
        total: accountRows.length,
        assigned: accountRows.filter((a) => a.workspace_id).length,
        unassigned: accountRows.filter((a) => !a.workspace_id).length,
        healthy: accountRows.filter(
          (a) => !a.paused && a.health_score >= 70 && a.warmup_status !== "warming",
        ).length,
        warming: accountRows.filter((a) => !a.paused && a.warmup_status === "warming").length,
        paused: accountRows.filter((a) => a.paused).length,
        error: accountRows.filter((a) => a.status === "failed").length,
        capacity: accountRows.reduce((s, a) => s + a.daily_limit, 0),
        sentToday: accountRows.reduce((s, a) => s + a.sent_today, 0),
      },
      byProvider: Array.from(byProvider.entries()).map(([provider, v]) => ({ provider, ...v })),
    };
  });

/** Platform users with their workspace memberships and platform role. */
export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const [profiles, members, roles, workspaces] = await Promise.all([
      context.supabase.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }),
      context.supabase.from("workspace_members").select("user_id, workspace_id, role"),
      context.supabase.from("user_roles").select("user_id, role"),
      context.supabase.from("workspaces").select("id, name"),
    ]);

    const wsName = new Map(((workspaces.data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]));
    const memberRows = (members.data ?? []) as { user_id: string; workspace_id: string; role: string }[];
    const roleRows = (roles.data ?? []) as { user_id: string; role: string }[];

    return ((profiles.data ?? []) as { id: string; email: string | null; full_name: string | null; created_at: string }[]).map((p) => ({
      ...p,
      platformRole: roleRows.find((r) => r.user_id === p.id)?.role ?? "user",
      workspaces: memberRows
        .filter((m) => m.user_id === p.id)
        .map((m) => ({ name: wsName.get(m.workspace_id) ?? "—", role: m.role })),
    }));
  });

/** Every campaign across all workspaces. */
export const listPlatformCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const [campaigns, workspaces] = await Promise.all([
      context.supabase
        .from("campaigns")
        .select("id, name, status, workspace_id, daily_cap, launched_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      context.supabase.from("workspaces").select("id, name"),
    ]);

    const wsName = new Map(((workspaces.data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]));
    return ((campaigns.data ?? []) as {
      id: string;
      name: string;
      status: string;
      workspace_id: string;
      daily_cap: number;
      launched_at: string | null;
      created_at: string;
    }[]).map((c) => ({ ...c, workspaceName: wsName.get(c.workspace_id) ?? "—" }));
  });

/** Aggregate sending + pipeline analytics for the whole platform. */
export const getSystemAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const [recipients, accounts, leads, providers] = await Promise.all([
      context.supabase.from("campaign_recipients").select("status, last_sent_at"),
      context.supabase.from("sending_accounts").select("sent_today, daily_limit, health_score, provider"),
      context.supabase.from("leads").select("id"),
      context.supabase.from("email_providers").select("id, name, is_enabled, daily_capacity, cost_per_1k_cents"),
    ]);

    const recRows = (recipients.data ?? []) as { status: string; last_sent_at: string | null }[];
    const accRows = (accounts.data ?? []) as { sent_today: number; daily_limit: number; health_score: number; provider: string }[];

    const byStatus: Record<string, number> = {};
    for (const r of recRows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

    const sentToday = accRows.reduce((n, a) => n + a.sent_today, 0);
    const capacity = accRows.reduce((n, a) => n + a.daily_limit, 0);

    return {
      recipients: recRows.length,
      byStatus,
      leads: (leads.data ?? []).length,
      sentToday,
      capacity,
      utilization: capacity ? Math.round((sentToday / capacity) * 100) : 0,
      avgHealth: accRows.length
        ? Math.round(accRows.reduce((n, a) => n + a.health_score, 0) / accRows.length)
        : 0,
      providers: (providers.data ?? []) as {
        id: string;
        name: string;
        is_enabled: boolean;
        daily_capacity: number;
        cost_per_1k_cents: number;
      }[],
    };
  });

/** Platform billing view: plans and workspace counts. */
export const getPlatformBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const [plans, workspaces, providers] = await Promise.all([
      context.supabase.from("plans").select("id, name, monthly_price, yearly_price, sort_order").order("sort_order"),
      context.supabase.from("workspaces").select("id"),
      context.supabase.from("email_providers").select("daily_capacity, cost_per_1k_cents, is_enabled"),
    ]);

    const provRows = (providers.data ?? []) as { daily_capacity: number; cost_per_1k_cents: number; is_enabled: boolean }[];
    const monthlyInfraCents = provRows
      .filter((p) => p.is_enabled)
      .reduce((n, p) => n + (p.daily_capacity * 30 * p.cost_per_1k_cents) / 1000, 0);

    return {
      plans: (plans.data ?? []) as { id: string; name: string; monthly_price: number; yearly_price: number }[],
      workspaces: (workspaces.data ?? []).length,
      estimatedMonthlyInfraCents: Math.round(monthlyInfraCents),
    };
  });

/** Recent system events: provider errors and failed sends. */
export const listSystemLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const [providers, accounts, recipients] = await Promise.all([
      context.supabase.from("email_providers").select("name, status, last_error, last_tested_at, updated_at"),
      context.supabase.from("sending_accounts").select("label, from_email, status, last_error, last_tested_at, updated_at"),
      context.supabase
        .from("campaign_recipients")
        .select("id, status, last_error, updated_at")
        .not("last_error", "is", null)
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    const entries: { at: string; level: "error" | "info"; source: string; message: string }[] = [];

    for (const p of (providers.data ?? []) as { name: string; status: string; last_error: string | null; last_tested_at: string | null; updated_at: string }[]) {
      entries.push({
        at: p.last_tested_at ?? p.updated_at,
        level: p.last_error ? "error" : "info",
        source: `provider:${p.name}`,
        message: p.last_error ?? `Connection status: ${p.status}`,
      });
    }
    for (const a of (accounts.data ?? []) as { label: string; from_email: string; status: string; last_error: string | null; last_tested_at: string | null; updated_at: string }[]) {
      if (!a.last_error) continue;
      entries.push({
        at: a.last_tested_at ?? a.updated_at,
        level: "error",
        source: `mailbox:${a.from_email}`,
        message: a.last_error,
      });
    }
    for (const r of (recipients.data ?? []) as { id: string; status: string; last_error: string | null; updated_at: string }[]) {
      entries.push({
        at: r.updated_at,
        level: "error",
        source: `send:${r.id.slice(0, 8)}`,
        message: r.last_error ?? r.status,
      });
    }

    return entries.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 100);
  });

/**
 * Reply-to inbox.
 *
 * Replies land in an inbox the platform controls, so admins set one global
 * reply-to address plus optional per-provider overrides. Customers never see
 * or configure this.
 */
export const getReplyToSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [setting, providers] = await Promise.all([
      context.supabase.from("platform_settings").select("value").eq("key", "reply_to").maybeSingle(),
      context.supabase
        .from("email_providers")
        .select("id, name, provider, reply_to_email")
        .order("priority", { ascending: true }),
    ]);
    const value = (setting.data?.value ?? {}) as { email?: string; forwardHint?: string };
    return {
      defaultReplyTo: value.email ?? "",
      forwardHint: value.forwardHint ?? "",
      providers: (providers.data ?? []) as {
        id: string;
        name: string;
        provider: string;
        reply_to_email: string | null;
      }[],
      inboundEndpoint: "/api/public/inbound/email",
      inboundConfigured: Boolean(process.env["INBOUND_EMAIL_SECRET"]),
    };
  });

export const saveReplyToSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        defaultReplyTo: z.string().trim().email().max(200).or(z.literal("")),
        forwardHint: z.string().trim().max(300).default(""),
        providerOverrides: z
          .array(
            z.object({
              id: z.string().uuid(),
              replyTo: z.string().trim().email().max(200).or(z.literal("")),
            }),
          )
          .max(50)
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, { sensitive: true, action: "change system email configuration" });
    const { error } = await context.supabase.from("platform_settings").upsert(
      {
        key: "reply_to",
        value: { email: data.defaultReplyTo, forwardHint: data.forwardHint },
      } as never,
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);

    for (const override of data.providerOverrides) {
      const { error: providerError } = await context.supabase
        .from("email_providers")
        .update({ reply_to_email: override.replyTo || null } as never)
        .eq("id", override.id);
      if (providerError) throw new Error(providerError.message);
    }
    return { ok: true };
  });

/**
 * Inbound reply webhook management.
 *
 * Replies land on the reply-to inbox at the sending provider; the provider then
 * POSTs them to MunchReach's inbound endpoint. These functions let an admin see
 * and register that webhook without leaving the app.
 */
export const getInboundWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const secretConfigured = Boolean(process.env["INBOUND_EMAIL_SECRET"]);
    const { resolvePlatformProviderId } = await import("@/lib/ops.server");
    const { getEmailProvider } = await import("@/lib/email-providers/registry.server");
    const providerId = await resolvePlatformProviderId();
    const provider = getEmailProvider(providerId);
    if (!provider.listDomains && !provider.listWebhooks) {
      return { provider: providerId, available: false, secretConfigured, domains: [], webhooks: [] };
    }

    const [domains, webhooks] = await Promise.all([
      provider.listDomains ? provider.listDomains({}).catch(() => []) : Promise.resolve([]),
      provider.listWebhooks ? provider.listWebhooks({}).catch(() => []) : Promise.resolve([]),
    ]);

    return {
      provider: providerId,
      available: domains.length > 0 || webhooks.length > 0,
      secretConfigured,
      domains,
      // The endpoint carries the shared secret, so it is masked before it leaves the server.
      webhooks: webhooks.map((w) => ({
        ...w,
        endpoint: w.endpoint.replace(/token=[^&]+/, "token=•••"),
      })),
    };
  });

export const registerInboundWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ baseUrl: z.string().trim().url().max(300) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, { sensitive: true, action: "change inbound webhook configuration" });
    const secret = process.env["INBOUND_EMAIL_SECRET"];
    if (!secret) throw new Error("INBOUND_EMAIL_SECRET is not configured.");
    const { resolvePlatformProviderId } = await import("@/lib/ops.server");
    const { getEmailProvider } = await import("@/lib/email-providers/registry.server");
    const provider = getEmailProvider(await resolvePlatformProviderId());
    if (!provider.registerWebhook) {
      throw new Error("This email provider does not support webhook registration.");
    }
    const endpoint = `${data.baseUrl.replace(/\/+$/, "")}/api/public/inbound/email?token=${encodeURIComponent(secret)}`;
    const result = await provider.registerWebhook({}, endpoint, ["email.received"]);
    if (!result.ok) throw new Error(result.detail);
    return { id: result.id ?? "" };
  });

export const deleteInboundWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().trim().min(3).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, { sensitive: true, action: "delete inbound webhook" });
    const { resolvePlatformProviderId } = await import("@/lib/ops.server");
    const { getEmailProvider } = await import("@/lib/email-providers/registry.server");
    const provider = getEmailProvider(await resolvePlatformProviderId());
    if (!provider.deleteWebhook) {
      throw new Error("This email provider does not support webhook management.");
    }
    const result = await provider.deleteWebhook({}, data.id);
    if (!result.ok) throw new Error(result.detail);
    return { ok: true };
  });

export type ManagedProviderHealth = {
  id: string | null;
  provider: string;
  name: string;
  isEnabled: boolean;
  hasCredentials: boolean;
  credentialSource: "provider_secret" | "platform_env" | null;
  reachable: boolean;
  message: string;
  verifiedDomains: string[];
};

export type ManagedInfraStatus = {
  configured: boolean;
  providers: ManagedProviderHealth[];
  domains: Array<{
    id: string;
    domain: string;
    workspaceId: string;
    dnsStatus: string;
    providerStatus: "verified" | "not_verified" | "unknown" | "error";
    providerDetail: string;
    mailboxes: number;
  }>;
};

/** Admin check: is the MunchReach-managed sending provider wired up correctly? */
export const getManagedInfraStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedInfraStatus> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      loadManagedProviderCredentials,
      checkSenderDomainVerification,
    } = await import("@/lib/managed-sending.server");
    const { testProviderCredentials } = await import("@/lib/provider-credentials.server");

    const { data: providerRows } = await supabaseAdmin
      .from("email_providers")
      .select("id, provider, name, is_enabled, priority")
      .order("priority", { ascending: true });

    const providers: ManagedProviderHealth[] = [];
    let primary: { provider: string; credentials: Record<string, string> } | null = null;

    for (const row of (providerRows ?? []) as Array<Record<string, unknown>>) {
      const managed = await loadManagedProviderCredentials(supabaseAdmin, {
        provider: row["provider"] as string,
        provider_id: row["id"] as string,
      });
      if (!managed) {
        providers.push({
          id: row["id"] as string,
          provider: row["provider"] as string,
          name: row["name"] as string,
          isEnabled: Boolean(row["is_enabled"]),
          hasCredentials: false,
          credentialSource: null,
          reachable: false,
          message: "No MunchReach-managed credentials stored for this provider.",
          verifiedDomains: [],
        });
        continue;
      }
      const test = await testProviderCredentials(managed.provider, managed.credentials);
      const probe = await checkSenderDomainVerification(
        managed.provider,
        managed.credentials,
        "__list__.invalid",
        { fresh: true },
      );
      if (!primary && Boolean(row["is_enabled"]) && test.ok) {
        primary = { provider: managed.provider, credentials: managed.credentials };
      }
      providers.push({
        id: row["id"] as string,
        provider: managed.provider,
        name: row["name"] as string,
        isEnabled: Boolean(row["is_enabled"]),
        hasCredentials: true,
        credentialSource: managed.source,
        reachable: test.ok,
        message: test.message,
        verifiedDomains: probe.providerDomains ?? [],
      });
    }

    const { data: domainRows } = await supabaseAdmin
      .from("sending_domains")
      .select("id, domain, workspace_id, dns_status")
      .order("created_at", { ascending: false })
      .limit(50);
    const { data: mailboxRows } = await supabaseAdmin
      .from("sending_accounts")
      .select("domain_id")
      .not("domain_id", "is", null);
    const mailboxCounts = new Map<string, number>();
    for (const row of (mailboxRows ?? []) as Array<{ domain_id: string }>) {
      mailboxCounts.set(row.domain_id, (mailboxCounts.get(row.domain_id) ?? 0) + 1);
    }

    const domains: ManagedInfraStatus["domains"] = [];
    for (const row of (domainRows ?? []) as Array<Record<string, unknown>>) {
      const check = primary
        ? await checkSenderDomainVerification(
            primary.provider,
            primary.credentials,
            row["domain"] as string,
          )
        : { status: "unknown" as const, detail: "No reachable managed provider configured." };
      domains.push({
        id: row["id"] as string,
        domain: row["domain"] as string,
        workspaceId: row["workspace_id"] as string,
        dnsStatus: row["dns_status"] as string,
        providerStatus: check.status,
        providerDetail: check.detail,
        mailboxes: mailboxCounts.get(row["id"] as string) ?? 0,
      });
    }

    return {
      configured: providers.some((p) => p.isEnabled && p.hasCredentials && p.reachable),
      providers,
      domains,
    };
  });

/**
 * Full health diagnostics for one provider, computed from the rolling window of
 * real API operations (credential checks, domain lookups, sends).
 */
export const getProviderDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeProviderDiagnostics } = await import("@/lib/provider-health.server");
    return computeProviderDiagnostics(supabaseAdmin, data.id);
  });

/** Runs a real, safe read-only probe against one provider and updates health. */
export const testProviderHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkProviderHealth, loadPool, logRoutingEvent } = await import(
      "@/lib/provider-pool.server"
    );
    const { computeProviderDiagnostics } = await import("@/lib/provider-health.server");

    const row = (await loadPool(supabaseAdmin)).find((p) => p.id === data.id);
    if (!row) throw new Error("Provider not found");

    const probe = await checkProviderHealth(supabaseAdmin, row);
    await logRoutingEvent(supabaseAdmin, {
      providerId: row.id,
      event: "health_check",
      reason: probe.health,
      detail: probe.reason,
    });
    const diagnostics = await computeProviderDiagnostics(supabaseAdmin, data.id);
    return { probe, diagnostics };
  });

/** Rolling-window health metrics for every provider in the pool (no probing). */
export const listProviderHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeProviderDiagnostics } = await import("@/lib/provider-health.server");
    const { data } = await supabaseAdmin.from("email_providers").select("id");
    const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    const results = await Promise.all(
      ids.map((id) => computeProviderDiagnostics(supabaseAdmin, id)),
    );
    return results;
  });
