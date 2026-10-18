import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn(), stripe: vi.fn(), planType: 'subscription', ready: true }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  rpc: state.rpc,
  from: (table: string) => {
    const value = table === 'referral_programs' ? { data: { enabled: true, operational_verified_at: state.ready ? '2026-10-18' : null } } : table === 'plans' ? { data: { id: 'affiliate-test-plan', name: 'Test plan', billing_type: state.planType } } : { data: [{ external_price_id: 'price_affiliate_test' }] };
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => value, then: (resolve: any) => Promise.resolve(value).then(resolve) };
    return chain;
  },
} }));
vi.mock('@/lib/billing/providers.server', () => ({ stripeCall: state.stripe }));
import { processStripeAffiliateEvent } from '@/lib/affiliate-stripe.server';
const event = (type: string, environment: 'test' | 'live' = 'test') => ({ ok: true, environment, eventId: `affiliate-test-${type}`, eventType: type, payload: { data: { object: { id: 'in_affiliate_test' } } } });
function invoice(kind: 'month' | 'year' | 'lifetime' = 'month') {
  return { id: 'in_affiliate_test', paid: true, status: 'paid', amount_paid: 12000, total: 12000, currency: 'usd', created: 1792340000, total_tax_amounts: [{ amount: 2000 }],
    payment_intent: { id: 'pi_affiliate_test', status: 'succeeded', metadata: { plan_id: 'affiliate-test-plan', workspace_id: 'affiliate-test-workspace' } },
    subscription: kind === 'lifetime' ? null : { id: 'sub_affiliate_test', metadata: { plan_id: 'affiliate-test-plan', workspace_id: 'affiliate-test-workspace' }, current_period_start: 100, current_period_end: 200 },
    lines: { has_more: false, data: [{ id: 'line_affiliate_test', amount: 10000, price: { id: 'price_affiliate_test', ...(kind === 'lifetime' ? {} : { recurring: { interval: kind, interval_count: 1 } }) }, period: { start: 100, end: 200 } }] },
  };
}
beforeEach(() => { state.rpc.mockReset().mockResolvedValue({ error: null }); state.stripe.mockReset().mockResolvedValue(invoice()); state.planType = 'subscription'; state.ready = true; });
describe('native affiliate Stripe bridge — isolated affiliate-test account only', () => {
  it('rejects unverified event', async () => await expect(processStripeAffiliateEvent({ ...event('invoice.paid'), ok: false })).rejects.toThrow('Verified'));
  it('reads invoice and sends tax-exclusive net to transactional ledger', async () => { await processStripeAffiliateEvent(event('invoice.paid')); expect(state.rpc).toHaveBeenCalledWith('process_affiliate_payment', { _input: expect.objectContaining({ kind: 'monthly', eligibleCents: 10000, paymentKey: 'stripe:test:pi_affiliate_test' }) }); });
  it('both invoice event types use same canonical payment key', async () => { await processStripeAffiliateEvent(event('invoice.paid')); await processStripeAffiliateEvent(event('invoice.payment_succeeded')); expect(state.rpc.mock.calls.map((c) => c[1]._input.paymentKey)).toEqual(['stripe:test:pi_affiliate_test', 'stripe:test:pi_affiliate_test']); });
  it('checkout success never creates commission', async () => { await processStripeAffiliateEvent(event('checkout.session.completed')); expect(state.rpc).not.toHaveBeenCalled(); });
  it('failed payments never create or reverse commission', async () => { await processStripeAffiliateEvent(event('invoice.payment_failed')); expect(state.rpc).not.toHaveBeenCalled(); });
  it('cancellation never reverses previously paid earnings', async () => { await processStripeAffiliateEvent(event('customer.subscription.deleted')); expect(state.rpc).not.toHaveBeenCalled(); });
  it('supports annual invoice', async () => { state.stripe.mockResolvedValue(invoice('year')); await processStripeAffiliateEvent(event('invoice.paid')); expect(state.rpc.mock.calls[0][1]._input.kind).toBe('annual'); });
  it('supports invoice-backed lifetime checkout', async () => { state.planType='lifetime'; state.stripe.mockResolvedValue(invoice('lifetime')); await processStripeAffiliateEvent(event('invoice.paid')); expect(state.rpc.mock.calls[0][1]._input.kind).toBe('lifetime'); });
  it('requires actual successful payment intent', async () => { state.stripe.mockResolvedValue({ ...invoice(), payment_intent: { id:'pi_affiliate_test', status:'processing' } }); await processStripeAffiliateEvent(event('invoice.paid')); expect(state.rpc).not.toHaveBeenCalled(); });
  it('supports test verification before live activation', async () => { state.ready=false; await processStripeAffiliateEvent(event('invoice.paid')); expect(state.rpc).toHaveBeenCalled(); });
  it('blocks live earnings before verification', async () => { state.ready=false; await processStripeAffiliateEvent(event('invoice.paid','live')); expect(state.rpc).not.toHaveBeenCalled(); });
  it('uses subscription billing period for proration-only upgrade', async () => { const value = invoice(); value.lines.data[0] = { ...value.lines.data[0], period: {start:150,end:200}, proration:true } as any; state.stripe.mockResolvedValue(value); await processStripeAffiliateEvent(event('invoice.paid')); expect(state.rpc.mock.calls[0][1]._input.periodKey).toBe('100:200'); });
  it('does not count unrelated invoice items as eligible revenue', async () => { const value=invoice(); value.lines.data[0].amount=5000; state.stripe.mockResolvedValue(value); await processStripeAffiliateEvent(event('invoice.paid')); expect(state.rpc.mock.calls[0][1]._input.eligibleCents).toBe(5000); });
  it('excludes inclusive tax from eligible lines', async () => { const value=invoice(); value.lines.data[0] = { ...value.lines.data[0], amount:6000, tax_amounts:[{amount:1000,inclusive:true}] } as any; state.stripe.mockResolvedValue(value); await processStripeAffiliateEvent(event('invoice.paid')); expect(state.rpc.mock.calls[0][1]._input.eligibleCents).toBe(5000); });
  it('refund targets actual payment intent', async () => { state.stripe.mockResolvedValue({ payment_intent:'pi_affiliate_test', amount_refunded:6000, disputed:false }); await processStripeAffiliateEvent(event('charge.refunded')); expect(state.rpc.mock.calls[0][1]._input).toEqual(expect.objectContaining({action:'adjust',paymentKey:'stripe:test:pi_affiliate_test',refundedCents:6000,disputed:false})); });
  it('processing failures remain retryable', async () => { state.rpc.mockResolvedValue({ error:{message:'temporary error'} }); await expect(processStripeAffiliateEvent(event('invoice.paid'))).rejects.toThrow('Affiliate processing failed'); });
});describe('lifetime checkout without invoice — isolated affiliate-test account only', () => {
  const session = (overrides: Record<string, unknown> = {}) => ({ id: 'cs_affiliate_test', mode: 'payment', payment_status: 'paid', amount_total: 12000, currency: 'usd', created: 1792340000,
    total_details: { amount_tax: 2000 }, customer: 'cus_affiliate_test',
    metadata: { plan_id: 'affiliate-test-plan', workspace_id: 'affiliate-test-workspace' },
    payment_intent: { id: 'pi_affiliate_test', status: 'succeeded', metadata: { plan_id: 'affiliate-test-plan', workspace_id: 'affiliate-test-workspace' } },
    line_items: { data: [{ id: 'li_affiliate_test', amount_subtotal: 10000, amount_total: 10000, price: { id: 'price_affiliate_test' } }] }, ...overrides });
  const checkout = (type = 'checkout.session.completed', environment: 'test' | 'live' = 'test') => ({ ok: true, environment, eventId: `affiliate-test-${type}`, eventType: type, payload: { data: { object: { id: 'cs_affiliate_test', mode: 'payment' } } } });
  it('creates exactly one lifetime commission from the verified session', async () => { state.planType = 'lifetime'; state.stripe.mockResolvedValue(session()); await processStripeAffiliateEvent(checkout()); expect(state.rpc).toHaveBeenCalledTimes(1); expect(state.rpc.mock.calls[0][1]._input).toEqual(expect.objectContaining({ kind: 'lifetime', eligibleCents: 10000, paymentKey: 'stripe:test:pi_affiliate_test', periodKey: 'lifetime:cs_affiliate_test' })); });
  it('shares the invoice payment key so a late invoice event deduplicates', async () => { state.planType = 'lifetime'; state.stripe.mockResolvedValueOnce(session()).mockResolvedValueOnce(invoice('lifetime')); await processStripeAffiliateEvent(checkout()); await processStripeAffiliateEvent(event('invoice.paid')); expect(state.rpc.mock.calls.map((c) => c[1]._input.paymentKey)).toEqual(['stripe:test:pi_affiliate_test', 'stripe:test:pi_affiliate_test']); });
  it('ignores subscription-mode checkouts', async () => { state.stripe.mockResolvedValue(session({ mode: 'subscription' })); await processStripeAffiliateEvent({ ...checkout(), payload: { data: { object: { id: 'cs_affiliate_test', mode: 'subscription' } } } }); expect(state.rpc).not.toHaveBeenCalled(); });
  it('ignores unpaid or processing sessions', async () => { state.planType = 'lifetime'; state.stripe.mockResolvedValue(session({ payment_status: 'unpaid' })); await processStripeAffiliateEvent(checkout()); state.stripe.mockResolvedValue(session({ payment_intent: { id: 'pi_affiliate_test', status: 'processing' } })); await processStripeAffiliateEvent(checkout('checkout.session.async_payment_succeeded')); expect(state.rpc).not.toHaveBeenCalled(); });
  it('rejects non-lifetime plans and unmapped prices', async () => { state.stripe.mockResolvedValue(session()); await processStripeAffiliateEvent(checkout()); expect(state.rpc).not.toHaveBeenCalled(); state.planType = 'lifetime'; state.stripe.mockResolvedValue(session({ line_items: { data: [{ amount_subtotal: 10000, price: { id: 'price_unrelated' } }] } })); await processStripeAffiliateEvent(checkout()); expect(state.rpc).not.toHaveBeenCalled(); });
  it('keeps test/live isolation for checkout sessions', async () => { state.planType = 'lifetime'; state.ready = false; state.stripe.mockResolvedValue(session()); await processStripeAffiliateEvent(checkout()); expect(state.rpc).toHaveBeenCalled(); state.rpc.mockClear(); await processStripeAffiliateEvent(checkout('checkout.session.completed', 'live')); expect(state.rpc).not.toHaveBeenCalled(); });
  it('lifetime refund reverses via the same payment key', async () => { state.stripe.mockResolvedValue({ payment_intent: 'pi_affiliate_test', amount_refunded: 12000, disputed: false }); await processStripeAffiliateEvent(event('charge.refunded')); expect(state.rpc.mock.calls[0][1]._input).toEqual(expect.objectContaining({ action: 'adjust', paymentKey: 'stripe:test:pi_affiliate_test', refundedCents: 12000 })); });
});
