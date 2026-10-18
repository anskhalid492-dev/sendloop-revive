/**
 * Referral engine (server only).
 *
 * Everything that creates money-relevant records lives here: click tracking,
 * signup attribution, commission creation from *verified* billing events,
 * reversals on refunds/cancellations and the audit trail. Commissions are
 * never created from client input — only from a signed provider webhook.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeCode, type ReferralProgram } from "@/lib/referral-model";
import { notifyReferrer } from "@/lib/referral-notify.server";

type Json = Record<string, unknown>;

export async function hashIp(ip: string | null, salt = process.env["REFERRAL_HASH_SALT"] ?? "sendloop"): Promise<string | null> {
  if (!ip || salt === "sendloop") return null;
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}

export function clientIp(request: Request): string | null {
  const header =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
  if (!header) return null;
  return header.split(",")[0]?.trim() || null;
}

export async function getProgram(): Promise<ReferralProgram & { id: string }> {
  const { data, error } = await supabaseAdmin
    .from("referral_programs")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Referral program is not configured");
  return data as unknown as ReferralProgram & { id: string };
}

export async function writeAudit(entry: {
  actorId?: string | null;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  referralProfileId?: string | null;
  workspaceId?: string | null;
  detail?: string;
  metadata?: Json;
}): Promise<void> {
  await supabaseAdmin.from("referral_audit_logs").insert({
    actor_id: entry.actorId ?? null,
    actor_role: entry.actorRole ?? "system",
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    referral_profile_id: entry.referralProfileId ?? null,
    workspace_id: entry.workspaceId ?? null,
    detail: entry.detail ?? null,
    metadata: (entry.metadata ?? {}) as never,
  });
}

async function flagFraud(entry: {
  referralProfileId?: string | null;
  attributionId?: string | null;
  reason: string;
  severity?: "info" | "warning" | "critical";
  detail?: string;
}): Promise<void> {
  await supabaseAdmin.from("referral_fraud_flags").insert({
    referral_profile_id: entry.referralProfileId ?? null,
    attribution_id: entry.attributionId ?? null,
    reason: entry.reason,
    severity: entry.severity ?? "warning",
    detail: entry.detail ?? null,
  });
}

/** Records a referral link visit. Repeat visits from the same fingerprint within an hour are ignored. */
export async function recordClick(input: {
  code: string;
  ipHash: string | null;
  userAgent: string | null;
  referer: string | null;
  landingPath: string | null;
}): Promise<{ ok: boolean }> {
  const code = normalizeCode(input.code);
  if (!code) return { ok: false };

  const { data: profile } = await supabaseAdmin
    .from("referral_profiles")
    .select("id, status")
    .eq("code", code)
    .maybeSingle();
  if (!profile || profile.status !== "active") return { ok: false };

  if (input.ipHash) {
    const { data: recent } = await supabaseAdmin
      .from("referral_clicks")
      .select("id")
      .eq("referral_profile_id", profile.id)
      .eq("ip_hash", input.ipHash)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .limit(1);
    if (recent && recent.length > 0) return { ok: true };
  }

  await supabaseAdmin.from("referral_clicks").insert({
    referral_profile_id: profile.id,
    code,
    ip_hash: input.ipHash,
    user_agent: input.userAgent?.slice(0, 300) ?? null,
    referer: input.referer?.slice(0, 500) ?? null,
    landing_path: input.landingPath?.slice(0, 300) ?? null,
  });
  return { ok: true };
}

export type ClaimResult = { attributed: boolean; reason?: string };

/**
 * Attributes a freshly signed-up user to a referrer. Self-referrals, unknown
 * codes, suspended referrers and users that are already attributed are
 * rejected. Attribution can never be changed afterwards.
 */
export async function claimAttribution(input: {
  code: string;
  userId: string;
  userEmail: string | null;
  workspaceId?: string | null;
  ipHash?: string | null;
  signedUpAt?: string | null;
}): Promise<ClaimResult> {
  const code = normalizeCode(input.code);
  if (!code) return { attributed: false, reason: "invalid_code" };

  const program = await getProgram();
  if (!program.enabled) return { attributed: false, reason: "program_disabled" };

  const { data: existing } = await supabaseAdmin
    .from("referral_attributions")
    .select("id")
    .eq("referred_user_id", input.userId)
    .maybeSingle();
  if (existing) return { attributed: false, reason: "already_attributed" };

  const { data: profile } = await supabaseAdmin
    .from("referral_profiles")
    .select("id, user_id, status, code")
    .eq("code", code)
    .maybeSingle();
  if (!profile) return { attributed: false, reason: "unknown_code" };
  if (profile.status !== "active") return { attributed: false, reason: "referrer_suspended" };
  if (profile.user_id === input.userId) {
    await flagFraud({
      referralProfileId: profile.id,
      reason: "self_referral_attempt",
      severity: "critical",
      detail: "A user tried to sign up with their own referral code.",
    });
    return { attributed: false, reason: "self_referral" };
  }

  // Account age guard: attribution only applies to genuinely new accounts.
  const signedUpAt = input.signedUpAt ? new Date(input.signedUpAt) : new Date();
  if (Date.now() - signedUpAt.getTime() > 1000 * 60 * 60 * 24 * 2) {
    return { attributed: false, reason: "account_too_old" };
  }

  const { data: attribution, error } = await supabaseAdmin
    .from("referral_attributions")
    .insert({
      referral_profile_id: profile.id,
      referrer_user_id: profile.user_id,
      referred_user_id: input.userId,
      referred_workspace_id: input.workspaceId ?? null,
      code,
      status: "pending",
      signed_up_at: signedUpAt.toISOString(),
      expires_at: new Date(signedUpAt.getTime() + program.attribution_window_days * 86400000).toISOString(),
      program_snapshot: {
        monthly_commission_percent: program.monthly_commission_percent,
        monthly_paid_periods: program.monthly_paid_periods,
        lifetime_commission_percent: program.lifetime_commission_percent,
        annual_commission_percent: program.annual_commission_percent,
        commission_type: program.commission_type,
        commission_percent: program.commission_percent,
        commission_fixed_cents: program.commission_fixed_cents,
        recurring: program.recurring,
        commission_duration_months: program.commission_duration_months,
        approval_mode: program.approval_mode,
        approval_delay_days: program.approval_delay_days,
      } as never,
    })
    .select("id")
    .single();
  if (error) return { attributed: false, reason: error.message };

  if (input.ipHash) {
    const { data: sameDevice } = await supabaseAdmin
      .from("referral_clicks")
      .select("id")
      .eq("ip_hash", input.ipHash)
      .neq("referral_profile_id", profile.id)
      .limit(1);
    const { data: siblings } = await supabaseAdmin
      .from("referral_clicks")
      .select("id")
      .eq("referral_profile_id", profile.id)
      .eq("ip_hash", input.ipHash)
      .limit(6);
    if ((siblings?.length ?? 0) >= 5 || (sameDevice?.length ?? 0) > 0) {
      await flagFraud({
        referralProfileId: profile.id,
        attributionId: attribution.id,
        reason: "repeated_device_fingerprint",
        detail: "Multiple referral signups share the same network fingerprint.",
      });
    }
  }

  if (input.userEmail) {
    const { data: referrerProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", profile.user_id)
      .maybeSingle();
    const domain = (email?: string | null) => email?.split("@")[1]?.toLowerCase() ?? "";
    if (domain(referrerProfile?.email) && domain(referrerProfile?.email) === domain(input.userEmail)) {
      await flagFraud({
        referralProfileId: profile.id,
        attributionId: attribution.id,
        reason: "same_email_domain",
        detail: "Referrer and referred account share an email domain.",
      });
    }
  }

  await writeAudit({
    action: "attribution_created",
    entityType: "referral_attribution",
    entityId: attribution.id,
    referralProfileId: profile.id,
    detail: `Signup attributed to referral code ${code}`,
    metadata: { referred_user_id: input.userId },
  });

  await notifyReferrer({
    userId: profile.user_id,
    kind: "referral_attributed",
    entityType: "referral_attribution",
    entityId: attribution.id,
  });

  return { attributed: true };
}

export type BillingEventInput = {
  provider: string;
  eventId: string;
  eventType: string;
  userId?: string | null;
  email?: string | null;
  workspaceId?: string | null;
  amountCents?: number;
  currency?: string;
  subscriptionId?: string | null;
  paymentId?: string | null;
  planName?: string | null;
  raw?: Json;
};

async function resolveUserId(input: BillingEventInput): Promise<string | null> {
  if (input.userId) return input.userId;
  if (input.email) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", input.email)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (input.workspaceId) {
    const { data } = await supabaseAdmin
      .from("workspaces")
      .select("owner_id")
      .eq("id", input.workspaceId)
      .maybeSingle();
    if (data?.owner_id) return data.owner_id;
  }
  return null;
}

function commissionFor(program: ReferralProgram, snapshot: Json | null, amountCents: number) {
  const type = ((snapshot?.["commission_type"] as string) ?? program.commission_type) as "percentage" | "fixed";
  const percent = Number(snapshot?.["commission_percent"] ?? program.commission_percent);
  const fixed = Number(snapshot?.["commission_fixed_cents"] ?? program.commission_fixed_cents);
  const amount = type === "percentage" ? Math.round((amountCents * percent) / 100) : fixed;
  return { type, rate: type === "percentage" ? percent : 0, amount: Math.max(amount, 0) };
}

/**
 * Turns one verified billing event into a commission (or a reversal).
 * Idempotent: the same provider event id is only ever processed once.
 */
export async function processBillingEvent(input: BillingEventInput): Promise<{ status: string; detail?: string }> {
  const { data: seen } = await supabaseAdmin
    .from("referral_billing_events")
    .select("id, result")
    .eq("provider", input.provider)
    .eq("event_id", input.eventId)
    .maybeSingle();
  if (seen) return seen.result ? { status: "duplicate", detail: seen.result } : { status: "duplicate" };

  const finish = async (result: string, detail?: string) => {
    await supabaseAdmin.from("referral_billing_events").insert({
      provider: input.provider,
      event_id: input.eventId,
      event_type: input.eventType,
      payload: (input.raw ?? {}) as never,
      result,
      error: detail ?? null,
    });
    return { status: result, ...(detail ? { detail } : {}) };
  };

  const program = await getProgram();
  if (!program.enabled) return finish("ignored", "Referral program disabled");

  const userId = await resolveUserId(input);
  if (!userId) return finish("ignored", "No matching MunchReach account");

  const { data: attribution } = await supabaseAdmin
    .from("referral_attributions")
    .select("id, referral_profile_id, referrer_user_id, referred_user_id, status, program_snapshot, signed_up_at, converted_at")
    .eq("referred_user_id", userId)
    .maybeSingle();
  if (!attribution) return finish("ignored", "Customer was not referred");

  const { data: referrer } = await supabaseAdmin
    .from("referral_profiles")
    .select("id, status")
    .eq("id", attribution.referral_profile_id)
    .maybeSingle();
  if (!referrer || referrer.status !== "active") return finish("ignored", "Referrer is not active");

  const refundish = /refund|chargeback|dispute|canceled|cancelled|payment_failed|subscription\.deleted/i.test(input.eventType);

  if (refundish) {
    const { data: original } = await supabaseAdmin
      .from("referral_commissions")
      .select("id, commission_amount_cents, status, currency, subscription_id")
      .eq("attribution_id", attribution.id)
      .in("status", ["pending", "approved", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!original) return finish("ignored", "No commission to reverse");

    await supabaseAdmin
      .from("referral_commissions")
      .update({ status: "reversed", reversed_at: new Date().toISOString(), notes: `Reversed by ${input.eventType}` })
      .eq("id", original.id);

    await writeAudit({
      action: "commission_reversed",
      entityType: "referral_commission",
      entityId: original.id,
      referralProfileId: attribution.referral_profile_id,
      detail: `Commission reversed after ${input.eventType}`,
      metadata: { provider: input.provider, event_id: input.eventId },
    });
    return finish("reversed");
  }

  const amountCents = Math.max(Math.round(input.amountCents ?? 0), 0);
  if (amountCents <= 0) return finish("ignored", "Event has no payable amount");

  // Recurring window enforcement.
  if (!program.recurring) {
    const { data: prior } = await supabaseAdmin
      .from("referral_commissions")
      .select("id")
      .eq("attribution_id", attribution.id)
      .neq("status", "reversed")
      .limit(1);
    if (prior && prior.length > 0) return finish("ignored", "One-time commission already paid");
  } else if (program.commission_duration_months > 0) {
    const start = new Date(attribution.converted_at ?? attribution.signed_up_at).getTime();
    const limit = start + program.commission_duration_months * 30 * 86400000;
    if (Date.now() > limit) return finish("ignored", "Commission duration elapsed");
  }

  const snapshot = (attribution.program_snapshot ?? null) as Json | null;
  const { type, rate, amount } = commissionFor(program, snapshot, amountCents);
  if (amount <= 0) return finish("ignored", "Commission resolves to zero");

  const autoApprove = ((snapshot?.["approval_mode"] as string) ?? program.approval_mode) === "auto";

  const { data: commission, error } = await supabaseAdmin
    .from("referral_commissions")
    .insert({
      attribution_id: attribution.id,
      referral_profile_id: attribution.referral_profile_id,
      referrer_user_id: attribution.referrer_user_id,
      referred_user_id: userId,
      referred_workspace_id: input.workspaceId ?? null,
      provider: input.provider,
      provider_event_id: input.eventId,
      subscription_id: input.subscriptionId ?? null,
      payment_id: input.paymentId ?? null,
      plan_name: input.planName ?? null,
      amount_cents: amountCents,
      currency: (input.currency ?? "usd").toLowerCase(),
      commission_type: type,
      commission_rate: rate,
      commission_amount_cents: amount,
      status: autoApprove ? "approved" : "pending",
      approved_at: autoApprove ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) return finish("error", error.message);

  if (attribution.status !== "converted") {
    await supabaseAdmin
      .from("referral_attributions")
      .update({ status: "converted", converted_at: new Date().toISOString() })
      .eq("id", attribution.id);
  }

  // Auto-approved commissions are immediately spendable, so tell the referrer.
  await notifyReferrer({
    userId: attribution.referrer_user_id,
    kind: autoApprove ? "commission_approved" : "referral_attributed",
    amountCents: amount,
    currency: input.currency ?? "usd",
    detail: autoApprove ? null : "A referred customer started paying. The commission is pending review.",
    entityType: "referral_commission",
    entityId: commission.id,
  });

  await writeAudit({
    action: "commission_created",
    entityType: "referral_commission",
    entityId: commission.id,
    referralProfileId: attribution.referral_profile_id,
    detail: `Commission recorded from ${input.provider} ${input.eventType}`,
    metadata: { amount_cents: amount, payment_cents: amountCents, auto_approved: autoApprove },
  });

  return finish("commission_created");
}
