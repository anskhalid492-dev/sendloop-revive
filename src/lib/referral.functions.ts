/**
 * Referral program server functions.
 *
 * Thin wrappers only: every runtime helper lives in `referral.server.ts`.
 * Customer functions are scoped by RLS to the signed-in referrer; admin
 * functions re-check the platform `admin` role before doing anything.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  ReferralAttributionRow,
  ReferralCommission,
  ReferralPayout,
  ReferralProfile,
  ReferralProgram,
  ReferralStats,
} from "@/lib/referral-model";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

/** Public program terms for the marketing page (no auth, no PII). */
export const getPublicReferralProgram = createServerFn({ method: "GET" }).handler(async (): Promise<ReferralProgram | null> => {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: any, init: any) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data } = await client.rpc("referral_program_public");
  const row = Array.isArray(data) ? data[0] : data;
  return (row as ReferralProgram) ?? null;
});

export type ReferralOverview = {
  program: ReferralProgram;
  profile: ReferralProfile | null;
  stats: ReferralStats;
  commissions: ReferralCommission[];
  payouts: ReferralPayout[];
  referrals: ReferralAttributionRow[];
  activity: { id: string; action: string; detail: string | null; created_at: string }[];
};

export const getReferralOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReferralOverview> => {
    const { supabase } = context;
    const [{ data: programRows }, { data: profile }] = await Promise.all([
      supabase.rpc("referral_program_public"),
      supabase.from("referral_profiles").select("*").eq("user_id", context.userId).maybeSingle(),
    ]);
    const program = ((Array.isArray(programRows) ? programRows[0] : programRows) ?? null) as ReferralProgram;

    const empty: ReferralStats = {
      clicks: 0, signups: 0, customers: 0, active_customers: 0,
      pending_cents: 0, approved_cents: 0, paid_cents: 0,
      reversed_cents: 0, requested_cents: 0, available_cents: 0,
    };
    if (!profile) {
      return { program, profile: null, stats: empty, commissions: [], payouts: [], referrals: [], activity: [] };
    }

    const [statsRes, commissionsRes, payoutsRes, referralsRes, activityRes] = await Promise.all([
      supabase.rpc("referral_dashboard_stats"),
      supabase
        .from("referral_commissions")
        .select("id, provider, plan_name, amount_cents, currency, commission_amount_cents, commission_rate, commission_type, status, created_at, approved_at, paid_at, reversed_at, notes")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("referral_payouts").select("*").order("created_at", { ascending: false }).limit(50),
      supabase
        .from("referral_attributions")
        .select("id, status, signed_up_at, converted_at, referred_user_id")
        .order("signed_up_at", { ascending: false })
        .limit(100),
      supabase
        .from("referral_audit_logs")
        .select("id, action, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const statsRow = (Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data) as ReferralStats | null;

    return {
      program,
      profile: profile as ReferralProfile,
      stats: statsRow ?? empty,
      commissions: (commissionsRes.data ?? []) as ReferralCommission[],
      payouts: (payoutsRes.data ?? []) as ReferralPayout[],
      referrals: (referralsRes.data ?? []) as ReferralAttributionRow[],
      activity: (activityRes.data ?? []) as ReferralOverview["activity"],
    };
  });

export const joinReferralProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReferralProfile> => {
    const { data, error } = await context.supabase.rpc("ensure_referral_profile");
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as ReferralProfile;
  });

export const requestReferralPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amountCents: number; method: string; destinationHint?: string }) =>
    z
      .object({
        amountCents: z.number().int().positive(),
        method: z.string().min(2).max(40),
        destinationHint: z.string().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("request_referral_payout", {
      _amount_cents: data.amountCents,
      _method: data.method,
      _destination_hint: (data.destinationHint ?? null) as unknown as string,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Attributes the signed-in user to a referral code captured before signup.
 * All validation (self-referral, duplicates, account age, fraud flags) runs
 * server-side; the client can only propose a code.
 */
export const claimReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(4).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { claimAttribution } = await import("@/lib/referral.server");
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    const { data: authUser } = await context.supabase.auth.getUser();
    const result = await claimAttribution({
      code: data.code,
      userId: context.userId,
      userEmail: email ?? authUser?.user?.email ?? null,
      signedUpAt: authUser?.user?.created_at ?? null,
    });
    return result;
  });

/* ------------------------------- admin ---------------------------------- */

export const getAdminReferralOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [program, referrers, commissions, payouts, flags, audit] = await Promise.all([
      supabaseAdmin.from("referral_programs").select("*").eq("singleton", true).maybeSingle(),
      supabaseAdmin
        .from("referral_profiles")
        .select("id, user_id, code, status, payout_method, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("referral_commissions")
        .select("id, referral_profile_id, referrer_user_id, referred_user_id, provider, plan_name, amount_cents, currency, commission_amount_cents, status, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("referral_payouts").select("*").order("created_at", { ascending: false }).limit(200),
      supabaseAdmin
        .from("referral_fraud_flags")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("referral_audit_logs")
        .select("id, action, detail, created_at, actor_role")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    // Webhook health: recent deliveries plus rolled-up counters for the panel.
    const { data: webhookRows } = await supabaseAdmin
      .from("referral_webhook_events")
      .select("id, provider, event_id, event_type, signature_ok, status_code, result, error, received_at")
      .order("received_at", { ascending: false })
      .limit(25);
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [{ count: total24 }, { count: rejected24 }, { count: failed24 }] = await Promise.all([
      supabaseAdmin.from("referral_webhook_events").select("id", { count: "exact", head: true }).gte("received_at", since),
      supabaseAdmin
        .from("referral_webhook_events")
        .select("id", { count: "exact", head: true })
        .gte("received_at", since)
        .eq("signature_ok", false),
      supabaseAdmin
        .from("referral_webhook_events")
        .select("id", { count: "exact", head: true })
        .gte("received_at", since)
        .eq("result", "error"),
    ]);
    const recent = webhookRows ?? [];
    const lastVerified = recent.find((r) => r.signature_ok) ?? null;
    const webhook = {
      configured: Boolean(process.env["REFERRAL_BILLING_SECRET"] ?? process.env["INBOUND_EMAIL_SECRET"]),
      endpoint: "/api/public/referral/billing",
      recent,
      lastEventAt: recent[0]?.received_at ?? null,
      lastVerifiedAt: lastVerified?.received_at ?? null,
      lastError: recent.find((r) => r.error)?.error ?? null,
      total24h: total24 ?? 0,
      rejected24h: rejected24 ?? 0,
      failed24h: failed24 ?? 0,
    };

    const userIds = new Set<string>();
    for (const r of referrers.data ?? []) userIds.add(r.user_id);
    for (const c of commissions.data ?? []) {
      userIds.add(c.referrer_user_id);
      userIds.add(c.referred_user_id);
    }
    const { data: profiles } = userIds.size
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", [...userIds])
      : { data: [] as { id: string; email: string | null; full_name: string | null }[] };

    const emails: Record<string, string> = {};
    for (const p of profiles ?? []) emails[p.id] = p.email ?? p.full_name ?? p.id.slice(0, 8);

    const { data: attributionCounts } = await supabaseAdmin
      .from("referral_attributions")
      .select("referral_profile_id, status");

    const perReferrer: Record<string, { signups: number; customers: number }> = {};
    for (const a of attributionCounts ?? []) {
      const bucket = (perReferrer[a.referral_profile_id] ??= { signups: 0, customers: 0 });
      bucket.signups += 1;
      if (a.status === "converted") bucket.customers += 1;
    }

    return {
      program: program.data,
      referrers: (referrers.data ?? []).map((r) => ({
        ...r,
        email: emails[r.user_id] ?? r.user_id.slice(0, 8),
        signups: perReferrer[r.id]?.signups ?? 0,
        customers: perReferrer[r.id]?.customers ?? 0,
      })),
      commissions: (commissions.data ?? []).map((c) => ({
        ...c,
        referrer_email: emails[c.referrer_user_id] ?? "—",
        referred_email: emails[c.referred_user_id] ?? "—",
      })),
      payouts: payouts.data ?? [],
      flags: flags.data ?? [],
      audit: audit.data ?? [],
      webhook,
    };
  });

export const updateReferralProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        commission_type: z.enum(["percentage", "fixed"]),
        commission_percent: z.number().min(0).max(100),
        commission_fixed_cents: z.number().int().min(0),
        recurring: z.boolean(),
        commission_duration_months: z.number().int().min(0).max(120),
        minimum_payout_cents: z.number().int().min(0),
        attribution_window_days: z.number().int().min(1).max(365),
        approval_mode: z.enum(["manual", "auto"]),
        approval_delay_days: z.number().int().min(0).max(180),
        payout_schedule: z.string().min(2).max(40),
        payout_methods: z.array(z.string().min(2).max(40)).min(1),
        payout_provider_configured: z.boolean(),
        eligibility: z.string().max(2000),
        terms: z.string().max(8000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("@/lib/referral.server");
    const { error } = await supabaseAdmin
      .from("referral_programs")
      .update({ ...data, updated_by: context.userId })
      .eq("singleton", true);
    if (error) throw new Error(error.message);
    await writeAudit({
      actorId: context.userId,
      actorRole: "admin",
      action: "program_updated",
      entityType: "referral_program",
      detail: "Referral program settings updated",
      metadata: data as never,
    });
    return { ok: true };
  });

export const reviewReferralCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; action: "approve" | "reject" | "reverse"; notes?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject", "reverse"]),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("@/lib/referral.server");
    const now = new Date().toISOString();
    const patch =
      data.action === "approve"
        ? { status: "approved", approved_at: now }
        : data.action === "reject"
          ? { status: "rejected", rejected_at: now }
          : { status: "reversed", reversed_at: now };
    const { data: row, error } = await supabaseAdmin
      .from("referral_commissions")
      .update({ ...patch, notes: data.notes ?? null })
      .eq("id", data.id)
      .select("id, referral_profile_id, referrer_user_id, commission_amount_cents, currency")
      .single();
    if (error) throw new Error(error.message);
    const { notifyReferrer } = await import("@/lib/referral-notify.server");
    await notifyReferrer({
      userId: row.referrer_user_id,
      kind:
        data.action === "approve"
          ? "commission_approved"
          : data.action === "reject"
            ? "commission_rejected"
            : "commission_reversed",
      amountCents: row.commission_amount_cents,
      currency: row.currency,
      detail: data.notes ?? null,
      entityType: "referral_commission",
      entityId: row.id,
    });
    await writeAudit({
      actorId: context.userId,
      actorRole: "admin",
      action: `commission_${data.action}d`,
      entityType: "referral_commission",
      entityId: row.id,
      referralProfileId: row.referral_profile_id,
      detail: data.notes ?? `Commission ${data.action}d by staff`,
    });
    return { ok: true };
  });

export const updateReferralPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string; reference?: string; notes?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["under_review", "approved", "processing", "paid", "rejected"]),
        reference: z.string().max(120).optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("@/lib/referral.server");
    const now = new Date().toISOString();
    const { data: payout, error } = await supabaseAdmin
      .from("referral_payouts")
      .update({
        status: data.status,
        reference: data.reference ?? null,
        admin_notes: data.notes ?? null,
        decided_at: now,
        paid_at: data.status === "paid" ? now : null,
      })
      .eq("id", data.id)
      .select("id, referral_profile_id, amount_cents, currency, user_id")
      .single();
    if (error) throw new Error(error.message);

    if (data.status === "processing" || data.status === "paid" || data.status === "rejected") {
      const { notifyReferrer } = await import("@/lib/referral-notify.server");
      await notifyReferrer({
        userId: payout.user_id,
        kind: data.status === "paid" ? "payout_paid" : data.status === "processing" ? "payout_processing" : "payout_rejected",
        amountCents: payout.amount_cents,
        currency: payout.currency ?? "usd",
        detail: data.notes ?? null,
        entityType: "referral_payout",
        entityId: payout.id,
      });
    }

    if (data.status === "paid") {
      await supabaseAdmin
        .from("referral_commissions")
        .update({ status: "paid", paid_at: now, payout_id: payout.id })
        .eq("referral_profile_id", payout.referral_profile_id)
        .eq("status", "approved");
    }

    await writeAudit({
      actorId: context.userId,
      actorRole: "admin",
      action: `payout_${data.status}`,
      entityType: "referral_payout",
      entityId: payout.id,
      referralProfileId: payout.referral_profile_id,
      detail: data.notes ?? `Payout marked ${data.status}`,
      metadata: { amount_cents: payout.amount_cents, reference: data.reference ?? null },
    });
    return { ok: true };
  });

export const setReferrerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "active" | "suspended"; reason?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "suspended"]),
        reason: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("@/lib/referral.server");
    const { error } = await supabaseAdmin
      .from("referral_profiles")
      .update({ status: data.status, suspended_reason: data.reason ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit({
      actorId: context.userId,
      actorRole: "admin",
      action: `referrer_${data.status}`,
      entityType: "referral_profile",
      entityId: data.id,
      referralProfileId: data.id,
      detail: data.reason ?? `Referrer set to ${data.status}`,
    });
    return { ok: true };
  });

export const resolveFraudFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "reviewed" | "dismissed" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["reviewed", "dismissed"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("referral_fraud_flags")
      .update({ status: data.status, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
