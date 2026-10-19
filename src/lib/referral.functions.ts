import { SUPABASE_URL as PINNED_URL, SUPABASE_PUBLISHABLE_KEY as PINNED_ANON } from "@/integrations/supabase/config";
/**
 * Referral program server functions.
 *
 * Thin wrappers only: every runtime helper lives in `referral.server.ts`.
 * Customer functions are scoped by RLS to the signed-in referrer; admin
 * functions re-check the platform `admin` role before doing anything.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";


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
  const client = createClient(PINNED_URL, PINNED_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc("affiliate_program_public");
  if (error || !data) return null;
  return data as unknown as ReferralProgram;
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
      (await import("@/integrations/supabase/client.server")).supabaseAdmin.rpc("affiliate_program_public"),
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
      (await import("@/integrations/supabase/client.server")).supabaseAdmin.rpc("affiliate_private_summary", { _user_id: context.userId }),
      supabase
        .from("referral_commissions")
        .select("id, provider, plan_name, currency, commission_amount_cents, commission_rate, commission_type, status, created_at, approved_at, paid_at, reversed_at, reversed_cents, settled_cents, payable_at")
        .or("affiliate_environment.is.null,affiliate_environment.eq.live")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("referral_payouts").select("id,amount_cents,currency,status,method,destination_hint,reference,requested_at,paid_at,crypto_network,wallet_address,actual_paid_cents,processing_due_at,payout_environment").or("payout_environment.is.null,payout_environment.eq.live").order("created_at", { ascending: false }).limit(50),
      supabase
        .from("referral_attributions")
        .select("id, status, signed_up_at, converted_at")
        .order("signed_up_at", { ascending: false })
        .limit(100),
      supabase
        .from("referral_audit_logs")
        .select("id, action, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const statsRow = (Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data) as ReferralStats | null;
    for (const result of [statsRes, commissionsRes, payoutsRes, referralsRes, activityRes]) {
      if (result.error) throw new Error("Affiliate data is unavailable. Production setup may still be required.");
    }

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
        .select("id, referral_profile_id, referrer_user_id, referred_user_id, provider, plan_name, amount_cents, currency, commission_amount_cents, reversed_cents, settled_cents, affiliate_environment, status, created_at")
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
      configured: Boolean(program.data?.operational_verified_at),
      endpoint: "/api/public/billing/stripe",
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
      payouts: (payouts.data ?? []).map(p => ({ ...p, affiliate_name: emails[p.user_id] ?? p.user_id })),
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
        monthly_commission_percent: z.number().min(0).max(100),
        monthly_paid_periods: z.number().int().min(1).max(120),
        lifetime_commission_percent: z.number().min(0).max(100),
        annual_commission_percent: z.number().min(0).max(100),
        cookie_duration_days: z.number().int().min(1).max(365),
        affiliate_approval_required: z.boolean(),
        commission_type: z.enum(["percentage", "fixed"]),
        commission_percent: z.number().min(0).max(100),
        commission_fixed_cents: z.number().int().min(0),
        recurring: z.boolean(),
        commission_duration_months: z.number().int().min(0).max(120),
        minimum_payout_cents: z.literal(10000),
        attribution_window_days: z.number().int().min(1).max(365),
        approval_mode: z.enum(["manual", "auto"]),
        approval_delay_days: z.number().int().min(0).max(180),
        payout_schedule: z.literal("within 60 days"),
        payout_methods: z.tuple([z.literal("crypto")]),
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
    const { data: readiness } = await supabaseAdmin.from("referral_programs").select("operational_verified_at").eq("singleton", true).maybeSingle();
    if (data.enabled && !readiness?.operational_verified_at) throw new Error("Activation requires a verified test-account payment, attribution and completed payout review first.");
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
    const { error } = await context.supabase.rpc("review_affiliate_commission", { _id: data.id, _action: data.action, _notes: data.notes ?? "" });
    if (error) throw new Error(error.message);
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
    const { error } = await context.supabase.rpc("review_affiliate_payout", { _id: data.id, _status: data.status, _reference: data.reference ?? "", _notes: data.notes ?? "" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setReferrerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "pending" | "active" | "suspended" | "rejected"; reason?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "active", "suspended", "rejected"]),
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

export const saveAffiliatePayoutDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ method: z.string().min(2).max(40), details: z.string().min(3).max(160) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("affiliate_private_preferences", { _user_id: context.userId, _method: data.method, _details: data.details });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
