/** Shared earning rules; all monetary inputs are integer minor units. */
export type AffiliateRules = {
  monthly_commission_percent: number;
  monthly_paid_periods: number;
  lifetime_commission_percent: number;
  annual_commission_percent: number;
  cookie_duration_days: number;
  affiliate_approval_required: boolean;
};
export const DEFAULT_AFFILIATE_RULES: AffiliateRules = {
  monthly_commission_percent: 30, monthly_paid_periods: 12,
  lifetime_commission_percent: 20, annual_commission_percent: 30,
  cookie_duration_days: 60, affiliate_approval_required: true,
};
export function affiliateRules(input?: Partial<AffiliateRules> | null): AffiliateRules {
  return { ...DEFAULT_AFFILIATE_RULES, ...input };
}
export function eligiblePaidAmount(paid: number, total: number, tax: number, eligibleSubtotal: number): number {
  if (![paid, total, tax, eligibleSubtotal].every(Number.isFinite) || paid <= 0 || total <= 0) return 0;
  // Credits/partial payments reduce both tax and eligible revenue proportionally.
  return Math.max(0, Math.floor(Math.min(paid, total) * Math.min(Math.max(total - tax, 0), Math.max(eligibleSubtotal, 0)) / total));
}
export function affiliateEarnings(kind: 'monthly' | 'annual' | 'lifetime', net: number, paidPeriods: number, rules: AffiliateRules): number {
  if (net <= 0 || (kind === 'monthly' ? paidPeriods >= rules.monthly_paid_periods : paidPeriods >= 1)) return 0;
  const rate = kind === 'monthly' ? rules.monthly_commission_percent : kind === 'annual' ? rules.annual_commission_percent : rules.lifetime_commission_percent;
  return Math.round(net * rate / 100);
}
export function commissionAdjustment(commission: number, refunded: number, gross: number, disputed: boolean): number {
  return disputed ? commission : Math.min(commission, Math.round(commission * Math.min(Math.max(refunded, 0), gross) / Math.max(gross, 1)));
}