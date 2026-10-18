/**
 * Shared referral-program types and helpers.
 *
 * This module is imported by both browser and server code, so it must stay
 * free of any Supabase or Node-only imports.
 */

export const REFERRAL_COOKIE = "sl_ref";
export const REFERRAL_STORAGE_KEY = "sendloop.referral.code";

export type ReferralProgram = {
  monthly_commission_percent?: number;
  monthly_paid_periods?: number;
  lifetime_commission_percent?: number;
  annual_commission_percent?: number;
  cookie_duration_days?: number;
  affiliate_approval_required?: boolean;
  enabled: boolean;
  commission_type: "percentage" | "fixed";
  commission_percent: number;
  commission_fixed_cents: number;
  recurring: boolean;
  commission_duration_months: number;
  minimum_payout_cents: number;
  attribution_window_days: number;
  approval_mode: "manual" | "auto";
  approval_delay_days: number;
  payout_schedule: string;
  payout_methods: string[];
  payout_provider_configured: boolean;
  eligibility: string;
  terms: string;
};

export type ReferralProfile = {
  id: string;
  user_id: string;
  code: string;
  status: "pending" | "active" | "suspended" | "rejected";
  payout_method: string | null;
  payout_destination_hint: string | null;
  created_at: string;
};

export type ReferralStats = {
  clicks: number;
  signups: number;
  customers: number;
  active_customers: number;
  pending_cents: number;
  approved_cents: number;
  paid_cents: number;
  reversed_cents: number;
  requested_cents: number;
  available_cents: number;
};

export type ReferralCommission = {
  reversed_cents?: number;
  settled_cents?: number;
  payable_at?: string | null;
  id: string;
  provider: string;
  plan_name: string | null;
  amount_cents: number;
  currency: string;
  commission_amount_cents: number;
  commission_rate: number;
  commission_type: string;
  status: "pending" | "approved" | "rejected" | "paid" | "reversed";
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
  reversed_at: string | null;
  notes: string | null;
};

export type ReferralPayout = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  method: string | null;
  destination_hint: string | null;
  reference: string | null;
  admin_notes: string | null;
  requested_at: string;
  paid_at: string | null;
};

export type ReferralAttributionRow = {
  id: string;
  status: string;
  signed_up_at: string;
  converted_at: string | null;
};

export const PAYOUT_METHOD_LABELS: Record<string, string> = {
  paypal: "PayPal",
  bank_transfer: "Bank transfer",
  wise: "Wise",
  stripe_connect: "Stripe Connect",
  credit: "MunchReach account credit",
};

export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  under_review: "Under review",
  approved: "Approved",
  processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
};

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format((cents ?? 0) / 100);
}

/** Human-readable summary of the commission rule, used on the public page. */
export function describeCommission(program: Pick<ReferralProgram, "commission_type" | "commission_percent" | "commission_fixed_cents" | "recurring" | "commission_duration_months">): string {
  const base =
    program.commission_type === "percentage"
      ? `${program.commission_percent}% of every payment`
      : `${formatMoney(program.commission_fixed_cents)} per paying customer`;
  if (!program.recurring) return `${base} (one-time)`;
  if (program.commission_duration_months <= 0) return `${base}, recurring for the lifetime of the subscription`;
  return `${base}, recurring for ${program.commission_duration_months} months`;
}

export function referralLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/r/${code}`;
}

/** Only codes we generate are ever accepted; keep validation strict. */
export function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6,16}$/.test(code) ? code : null;
}

export function conversionRate(signups: number, customers: number): number {
  if (!signups) return 0;
  return Math.round((customers / signups) * 1000) / 10;
}
