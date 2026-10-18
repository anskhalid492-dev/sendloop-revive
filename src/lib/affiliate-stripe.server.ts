import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { stripeCall, type VerifiedWebhook } from '@/lib/billing/providers.server';
import { eligiblePaidAmount } from '@/lib/affiliate-rules';

const identity = (value: any): string | null => typeof value === 'string' ? value : value?.id ?? null;
async function submit(event: VerifiedWebhook, input: Record<string, unknown>) {
  const { error } = await supabaseAdmin.rpc('process_affiliate_payment', {
    _input: { eventKey: `stripe:${event.environment}:${event.eventId}`, environment: event.environment, ...input } as never,
  });
  if (error) throw new Error(`Affiliate processing failed: ${error.message}`);
}
/** Only invoked AFTER the native billing endpoint verifies the Stripe signature. */
export async function processStripeAffiliateEvent(event: VerifiedWebhook) {
  if (!event.ok) throw new Error('Verified Stripe event required');
  if (!['invoice.paid', 'invoice.payment_succeeded', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed', 'checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.eventType)) return;
  // Old production databases remain inactive; ordinary billing must continue until activation.
  const { data: program, error } = await supabaseAdmin.from('referral_programs').select('operational_verified_at, enabled').eq('singleton', true).maybeSingle();
  if (error) {
    if (['42703', 'PGRST204', 'PGRST205'].includes(error.code)) return;
    throw new Error('Affiliate readiness could not be read; retry payment processing');
  }
  if (event.environment === 'live' && !program?.operational_verified_at) return;
  const obj = event.payload?.data?.object;
  if (!obj) return;
  const paymentKey = (id: string) => `stripe:${event.environment}:${id}`;
  if (['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'].includes(event.eventType)) {
    const chargeId = event.eventType === 'charge.refunded' ? obj.id : identity(obj.charge);
    if (!chargeId) throw new Error('Missing disputed charge');
    const charge = await stripeCall(event.environment, `charges/${encodeURIComponent(chargeId)}`, undefined, 'GET');
    const pi = identity(charge.payment_intent);
    if (!pi) return;
    // Query current charge dispute state, not delivery order, so stale events cannot reopen a won dispute.
    let disputed = Boolean(charge.disputed);
    if (disputed) {
      const disputes = await stripeCall(event.environment, `disputes?charge=${encodeURIComponent(chargeId)}&limit=100`, undefined, 'GET');
      disputed = (disputes.data ?? []).some((d: any) => !['won', 'warning_closed'].includes(d.status));
    }
    await submit(event, { action: 'adjust', paymentKey: paymentKey(pi), paymentId: pi, refundedCents: charge.amount_refunded ?? 0, disputed });
    return;
  }
  // invoice.paid and invoice.payment_succeeded deduplicate on PaymentIntent, not webhook ID.
  if (!['invoice.paid', 'invoice.payment_succeeded'].includes(event.eventType)) return;
  const invoice = await stripeCall(event.environment, `invoices/${encodeURIComponent(obj.id)}?expand[]=payment_intent&expand[]=subscription`, undefined, 'GET');
  if (invoice.status !== 'paid' || invoice.paid !== true || invoice.amount_paid <= 0) return;
  const pi = identity(invoice.payment_intent);
  if (!pi || invoice.payment_intent?.status !== 'succeeded') return; // Manual/out-of-band invoices are not eligible.
  const sub = typeof invoice.subscription === 'object' ? invoice.subscription : null;
  const lines: any[] = [...(invoice.lines?.data ?? [])];
  let more = Boolean(invoice.lines?.has_more);
  while (more) {
    const last = lines.at(-1)?.id;
    if (!last) throw new Error('Incomplete invoice lines');
    const next = await stripeCall(event.environment, `invoices/${encodeURIComponent(invoice.id)}/lines?limit=100&starting_after=${encodeURIComponent(last)}`, undefined, 'GET');
    lines.push(...next.data); more = next.has_more;
  }
  const recurring = lines.filter((l) => l.price?.recurring);
  const intervals = new Set(recurring.map((l) => l.price.recurring.interval));
  if (intervals.size > 1 || recurring.some((l) => l.price.recurring.interval_count !== 1)) return;
  const kind = sub ? intervals.has('month') ? 'monthly' : intervals.has('year') ? 'annual' : null : 'lifetime';
  if (!kind) return;
  const workspaceId = sub?.metadata?.workspace_id ?? invoice.metadata?.workspace_id ?? invoice.payment_intent?.metadata?.workspace_id;
  if (!workspaceId) return;
  // Require saved MunchReach plan mapping; arbitrary invoice items/credits are never affiliate revenue.
  const planId = sub?.metadata?.plan_id ?? invoice.metadata?.plan_id ?? invoice.payment_intent?.metadata?.plan_id;
  const { data: plan } = await supabaseAdmin.from('plans').select('id,name,billing_type').eq('id', planId ?? '').maybeSingle();
  if (!plan || (kind === 'lifetime' && plan.billing_type !== 'lifetime')) return;
  const { data: mappings } = await supabaseAdmin.from('billing_plan_prices').select('external_price_id').eq('plan_id', plan.id).eq('provider', 'stripe').eq('environment', event.environment);
  const priceIds = new Set((mappings ?? []).map((p) => p.external_price_id));
  const eligible = lines.filter((l) => priceIds.has(l.price?.id));
  if (!eligible.length) return;
  const subtotal = eligible.reduce((sum, l) => sum + (l.amount_excluding_tax ?? ((l.amount ?? 0) - (l.tax_amounts ?? []).filter((t: any) => t.inclusive).reduce((s: number, t: any) => s + t.amount, 0))) - (l.discount_amounts ?? []).reduce((s: number, d: any) => s + d.amount, 0), 0);
  const tax = (invoice.total_tax_amounts ?? []).reduce((s: number, t: any) => s + t.amount, 0);
  const net = eligiblePaidAmount(invoice.amount_paid, invoice.total, tax, subtotal);
  const normalLine = recurring.find((l) => !(l.proration ?? l.parent?.subscription_item_details?.proration));
  // Proration-only upgrades use their existing billing period, never consume an extra paid month.
  const period = normalLine?.period ?? (sub ? { start: sub.current_period_start, end: sub.current_period_end } : eligible[0]?.period);
  await submit(event, {
    action: 'payment', paymentKey: paymentKey(pi), paymentId: pi, invoiceId: invoice.id,
    customerId: identity(invoice.customer), workspaceId, subscriptionId: identity(invoice.subscription),
    kind, periodKey: `${period?.start ?? invoice.period_start}:${period?.end ?? invoice.period_end}`,
    paidCents: invoice.amount_paid, eligibleCents: net, currency: invoice.currency,
    planName: plan.name, paidAt: invoice.status_transitions?.paid_at ?? invoice.created,
  });
}