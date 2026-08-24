/**
 * Customer settings: notification preferences, billing overview and account
 * security actions. Everything is scoped to the signed-in user (or a workspace
 * they belong to) and re-checked server-side — route guards are never the
 * security boundary.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const NOTIFICATION_KEYS = [
  "new_replies",
  "campaign_completed",
  "bounce_alerts",
  "deliverability_alerts",
  "warmup_alerts",
  "team_activity",
  "support_updates",
  "referral_updates",
  "positive_reply_notifications",
] as const;

export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

export type NotificationPreferences = Record<NotificationKey, boolean> & {
  email_enabled: boolean;
  in_app_enabled: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  new_replies: true,
  campaign_completed: true,
  bounce_alerts: true,
  deliverability_alerts: true,
  warmup_alerts: true,
  team_activity: true,
  support_updates: true,
  referral_updates: true,
  positive_reply_notifications: true,
  email_enabled: true,
  in_app_enabled: true,
};

export const getNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationPreferences> => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return DEFAULT_PREFERENCES;
    const row = data as unknown as Record<string, boolean>;
    const out = { ...DEFAULT_PREFERENCES };
    for (const key of Object.keys(DEFAULT_PREFERENCES) as Array<keyof NotificationPreferences>) {
      if (typeof row[key] === "boolean") out[key] = row[key] as boolean;
    }
    return out;
  });

const preferencesSchema = z.object({
  new_replies: z.boolean(),
  campaign_completed: z.boolean(),
  bounce_alerts: z.boolean(),
  deliverability_alerts: z.boolean(),
  warmup_alerts: z.boolean(),
  team_activity: z.boolean(),
  support_updates: z.boolean(),
  referral_updates: z.boolean(),
  positive_reply_notifications: z.boolean(),
  email_enabled: z.boolean(),
  in_app_enabled: z.boolean(),
});

export const saveNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => preferencesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notification_preferences")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type BillingOverview = {
  planName: string;
  planSlug: string | null;
  status: string;
  paymentStatus: string;
  billingInterval: string;
  monthlyPriceCents: number | null;
  trialEndsAt: string | null;
  renewsAt: string | null;
  limits: {
    emailsMonthly: number | null;
    sendingAccounts: number | null;
    leads: number | null;
    campaigns: number | null;
    users: number | null;
  };
  usage: {
    emailsThisMonth: number;
    sendingAccounts: number;
    leads: number;
    campaigns: number;
    users: number;
  };
};

export const getBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<BillingOverview> => {
    const { data: isMember, error: memberError } = await context.supabase.rpc(
      "is_workspace_member",
      { _workspace_id: data.workspaceId, _user_id: context.userId },
    );
    if (memberError) throw new Error(memberError.message);
    if (!isMember) throw new Error("Not authorized for this workspace");

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [subscription, accounts, leads, campaigns, members, sent] = await Promise.all([
      context.supabase
        .from("workspace_subscriptions")
        .select("status, payment_status, billing_interval, trial_ends_at, current_period_end, plan_id")
        .eq("workspace_id", data.workspaceId)
        .maybeSingle(),
      context.supabase
        .from("sending_accounts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId),
      context.supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId),
      context.supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId),
      context.supabase
        .from("workspace_members")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId),
      context.supabase
        .from("campaign_messages")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId)
        .eq("status", "sent")
        .gte("sent_at", monthStart.toISOString()),
    ]);

    const sub = subscription.data as
      | {
          status: string;
          payment_status: string;
          billing_interval: string;
          trial_ends_at: string | null;
          current_period_end: string | null;
          plan_id: string | null;
        }
      | null;

    type PlanRow = {
      name: string;
      slug: string;
      monthly_price: number;
      max_emails_monthly: number | null;
      max_sending_accounts: number | null;
      max_leads: number | null;
      max_campaigns: number | null;
      max_users: number | null;
    };
    let plan: PlanRow | null = null;

    if (sub?.plan_id) {
      const { data: planRow } = await context.supabase
        .from("plans")
        .select(
          "name, slug, monthly_price, max_emails_monthly, max_sending_accounts, max_leads, max_campaigns, max_users",
        )
        .eq("id", sub.plan_id)
        .maybeSingle();
      plan = (planRow as unknown as PlanRow | null) ?? null;
    }

    return {
      planName: plan?.name ?? "Free trial",
      planSlug: plan?.slug ?? null,
      status: sub?.status ?? "trialing",
      paymentStatus: sub?.payment_status ?? "none",
      billingInterval: sub?.billing_interval ?? "monthly",
      monthlyPriceCents: plan?.monthly_price ?? null,
      trialEndsAt: sub?.trial_ends_at ?? null,
      renewsAt: sub?.current_period_end ?? null,
      limits: {
        emailsMonthly: plan?.max_emails_monthly ?? null,
        sendingAccounts: plan?.max_sending_accounts ?? null,
        leads: plan?.max_leads ?? null,
        campaigns: plan?.max_campaigns ?? null,
        users: plan?.max_users ?? null,
      },
      usage: {
        emailsThisMonth: sent.count ?? 0,
        sendingAccounts: accounts.count ?? 0,
        leads: leads.count ?? 0,
        campaigns: campaigns.count ?? 0,
        users: members.count ?? 0,
      },
    };
  });

export type SecurityOverview = {
  email: string | null;
  emailConfirmed: boolean;
  provider: string;
  lastSignInAt: string | null;
  createdAt: string | null;
  ownedWorkspaces: number;
};

export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SecurityOverview> => {
    const { data: userData } = await context.supabase.auth.getUser();
    const user = userData?.user ?? null;
    const { count } = await context.supabase
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", context.userId);

    return {
      email: user?.email ?? null,
      emailConfirmed: Boolean(user?.email_confirmed_at ?? user?.confirmed_at),
      provider: (user?.app_metadata?.provider as string) ?? "email",
      lastSignInAt: user?.last_sign_in_at ?? null,
      createdAt: user?.created_at ?? null,
      ownedWorkspaces: count ?? 0,
    };
  });

/**
 * Permanently deletes the caller's own account. Requires the exact confirmation
 * phrase and refuses while the user still owns a workspace, so shared data is
 * never destroyed by accident.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ confirm: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.confirm.trim().toUpperCase() !== "DELETE MY ACCOUNT") {
      throw new Error('Type "DELETE MY ACCOUNT" exactly to confirm');
    }

    const { count } = await context.supabase
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", context.userId);
    if ((count ?? 0) > 0) {
      throw new Error(
        "Delete or transfer the workspaces you own before deleting your account.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type SendingSettings = {
  sendingTimezone: string;
  sendDays: number[];
  sendStartHour: number;
  sendEndHour: number;
  defaultDailyLimit: number | null;
  mailboxes: number;
  canEdit: boolean;
};

export const getSendingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SendingSettings> => {
    const { data: ws, error } = await context.supabase
      .from("workspaces")
      .select("sending_timezone, timezone, send_days, send_start_hour, send_end_hour")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ws) throw new Error("Workspace not found");

    const [{ data: canEdit }, accounts] = await Promise.all([
      context.supabase.rpc("has_workspace_role", {
        _workspace_id: data.workspaceId,
        _user_id: context.userId,
        _roles: ["owner", "admin"],
      }),
      context.supabase
        .from("sending_accounts")
        .select("daily_limit", { count: "exact" })
        .eq("workspace_id", data.workspaceId),
    ]);

    const limits = ((accounts.data ?? []) as Array<{ daily_limit: number }>).map((a) => a.daily_limit);
    return {
      sendingTimezone: ws.sending_timezone ?? ws.timezone ?? "UTC",
      sendDays: ws.send_days ?? [1, 2, 3, 4, 5],
      sendStartHour: ws.send_start_hour ?? 9,
      sendEndHour: ws.send_end_hour ?? 17,
      defaultDailyLimit: limits.length
        ? Math.round(limits.reduce((a, b) => a + b, 0) / limits.length)
        : null,
      mailboxes: accounts.count ?? limits.length,
      canEdit: Boolean(canEdit),
    };
  });

export const saveSendingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        sendingTimezone: z.string().trim().min(1).max(64),
        sendDays: z.array(z.number().int().min(0).max(6)).min(1),
        sendStartHour: z.number().int().min(0).max(23),
        sendEndHour: z.number().int().min(1).max(24),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.sendEndHour <= data.sendStartHour) {
      throw new Error("Sending window end must be after the start");
    }
    const { data: ws, error: wErr } = await context.supabase
      .from("workspaces")
      .select("name, slug, logo_url, timezone")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (wErr) throw new Error(wErr.message);
    if (!ws) throw new Error("Workspace not found");

    const { error } = await context.supabase.rpc("update_workspace_settings", {
      _workspace_id: data.workspaceId,
      _name: ws.name,
      _slug: ws.slug,
      _logo_url: ws.logo_url ?? "",
      _timezone: ws.timezone,
      _sending_timezone: data.sendingTimezone,
      _send_days: data.sendDays,
      _send_start_hour: data.sendStartHour,
      _send_end_hour: data.sendEndHour,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
