import { describe, it, expect } from 'vitest';
import { DEFAULT_AFFILIATE_RULES as rules, affiliateEarnings, eligiblePaidAmount, commissionAdjustment } from '@/lib/affiliate-rules';
describe('affiliate payment rules — isolated affiliate-test fixtures', () => {
  it('pays 30% monthly', () => expect(affiliateEarnings('monthly', 4900, 0, rules)).toBe(1470));
  it('pays the twelfth successful monthly period', () => expect(affiliateEarnings('monthly', 4900, 11, rules)).toBe(1470));
  it('stops after 12 successful monthly periods', () => expect(affiliateEarnings('monthly', 4900, 12, rules)).toBe(0));
  it('pays 20% lifetime', () => expect(affiliateEarnings('lifetime', 2900, 0, rules)).toBe(580));
  it('pays 30% first annual invoice', () => expect(affiliateEarnings('annual', 49000, 0, rules)).toBe(14700));
  it('does not pay annual renewals', () => expect(affiliateEarnings('annual', 49000, 1, rules)).toBe(0));
  it('excludes tax', () => expect(eligiblePaidAmount(12000, 12000, 2000, 10000)).toBe(10000));
  it('prorates credits and partial cash payments', () => expect(eligiblePaidAmount(6000, 12000, 2000, 10000)).toBe(5000));
  it('excludes unpaid amounts', () => expect(eligiblePaidAmount(0, 12000, 2000, 10000)).toBe(0));
  it('reverses partial refunds proportionally', () => expect(commissionAdjustment(3000, 6000, 12000, false)).toBe(1500));
  it('holds all earnings during chargeback', () => expect(commissionAdjustment(3000, 0, 12000, true)).toBe(3000));
  it('restores won dispute net of refunds', () => expect(commissionAdjustment(3000, 0, 12000, false)).toBe(0));
});