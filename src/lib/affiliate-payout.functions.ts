import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { CRYPTO_NETWORKS, validWallet, validatePayoutProof, MAX_PAYOUT_PROOF_BYTES, type AffiliateWallet, type PayoutProof } from '@/lib/affiliate-payout-model';

type Context = { userId: string; supabase: any };
async function admin(context: Context) {
  const { data, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (error || data !== true) throw new Error('Administrator access required.');
}
export const getAffiliateWallet = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<AffiliateWallet | null> => {
  const { data, error } = await (context.supabase as any).from('affiliate_wallets').select('network,address,updated_at').eq('user_id', context.userId).maybeSingle();
  if (error) throw new Error('Wallet setup is unavailable. The payout database update is required.');
  return data;
});
export const saveAffiliateWallet = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ network: z.enum(CRYPTO_NETWORKS), address: z.string().trim().max(100), verified: z.literal(true) }).parse(input))
  .handler(async ({ context, data }) => {
    if (!validWallet(data.network, data.address)) throw new Error('Verify the wallet address and selected network. The address checksum is invalid.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await (supabaseAdmin as any).rpc('save_affiliate_crypto_wallet', { _user: context.userId, _network: data.network, _address: data.address });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const requestCryptoPayout = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ amountCents: z.number().int().min(10000).max(100000000), requestKey: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: wallet, error: walletError } = await (context.supabase as any).from('affiliate_wallets').select('network,address').eq('user_id', context.userId).maybeSingle();
    if (walletError || !wallet || !validWallet(wallet.network, wallet.address)) throw new Error('Save a valid crypto wallet first.');
    const { data: payout, error } = await (context.supabase as any).rpc('request_affiliate_crypto_payout', { _amount: data.amountCents, _request_key: data.requestKey });
    if (error) throw new Error(error.message);
    return { id: payout.id as string };
  });
export const reviewCryptoPayout = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), status: z.enum(['approved','processing','paid','rejected']), actualPaidCents: z.number().int().nonnegative().max(100000000), reference: z.string().trim().max(120), notes: z.string().trim().max(2000) }).parse(input))
  .handler(async ({ context, data }) => {
    await admin(context);
    const { error } = await (context.supabase as any).rpc('review_affiliate_crypto_payout', { _id: data.id, _status: data.status, _actual: data.actualPaidCents, _reference: data.reference, _notes: data.notes });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const adjustAffiliateBalance = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ profileId: z.string().uuid(), deltaCents: z.number().int().min(-100000000).max(100000000).refine(value => value !== 0), reason: z.string().trim().min(3).max(2000), requestKey: z.string().uuid(), environment: z.enum(['live','test']) }).parse(input))
  .handler(async ({ context, data }) => {
    await admin(context);
    const { data: id, error } = await (context.supabase as any).rpc('adjust_affiliate_balance', { _profile: data.profileId, _delta: data.deltaCents, _reason: data.reason, _request_key: data.requestKey, _environment: data.environment });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });
export const getAdminPayoutSummary = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ environment: z.enum(['live','test']) }).parse(input))
  .handler(async ({ context, data }) => {
    await admin(context);
    const [{ data: summary, error }, { data: adjustments, error: adjustmentError }] = await Promise.all([
      (context.supabase as any).rpc('affiliate_admin_earnings', { _environment: data.environment }),
      (context.supabase as any).from('affiliate_balance_adjustments').select('*').eq('environment', data.environment).order('created_at', { ascending: false }).limit(100),
    ]);
    if (error || adjustmentError) throw new Error('Payout overview is unavailable. The payout database update is required.');
    return { summary: summary as { commission_count: number; commission_cents: number; pending_cents: number; approved_cents: number; paid_commission_cents: number; pending_payout_count: number; completed_payout_count: number; liability_cents: number }, adjustments: adjustments as { id: string; referral_profile_id: string; delta_cents: number; before_cents: number; after_cents: number; reason: string; actor_id: string; created_at: string; environment: string }[] };
  });
async function payoutAccess(context: Context, id: string, requireAdmin = false) {
  if (requireAdmin) await admin(context);
  const { data, error } = await context.supabase.from('referral_payouts').select('id,user_id').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('Payment proof is unavailable.');
  // RLS is the first boundary; explicit owner/admin validation is the second.
  if (data.user_id !== context.userId && !requireAdmin) await admin(context);
  return data;
}
export const listPayoutProofs = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ payoutId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<PayoutProof[]> => {
    await payoutAccess(context, data.payoutId);
    const { data: rows, error } = await (context.supabase as any).from('affiliate_payout_proofs').select('id,payout_id,file_name,mime_type,size,created_at').eq('payout_id', data.payoutId).order('created_at', { ascending: false });
    if (error) throw new Error('Payment proofs are unavailable.');
    return rows ?? [];
  });
// Small, validated proof uploads use existing R2 signed PUT helpers. The dedicated
// namespace is NOT accepted by generic file download endpoints or public media.
export const attachPayoutProof = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ payoutId: z.string().uuid(), fileName: z.string().trim().min(1).max(200), mimeType: z.string().max(100), content: z.string().max(Math.ceil(MAX_PAYOUT_PROOF_BYTES * 4 / 3) + 4) }).parse(input))
  .handler(async ({ context, data }) => {
    await payoutAccess(context, data.payoutId, true);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: rate, error: rateError } = await (supabaseAdmin as any).rpc('admin_rate_limit_hit', { _bucket: `payout-proof:${context.userId}`, _limit: 10, _window_seconds: 60 });
    if (rateError || rate?.allowed === false) throw new Error('Payment proof upload is temporarily unavailable. Please try again later.');
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(data.content), char => char.charCodeAt(0)); } catch { throw new Error('Invalid payment proof.'); }
    validatePayoutProof(bytes, data.mimeType);
    const { r2Configured, putR2Object } = await import('@/lib/r2.server');
    if (!r2Configured()) throw new Error('Private payment proof storage is not configured.');
    const { safeFileName } = await import('@/lib/files-model');
    const id = crypto.randomUUID();
    const key = `affiliate-proofs/${data.payoutId}/${id}`;
    // The transactional metadata RPC rechecks admin identity and locks the payout.
    await putR2Object(key, bytes, data.mimeType);
    const { error } = await (context.supabase as any).rpc('record_affiliate_payout_proof', { _id: id, _payout: data.payoutId, _key: key, _name: safeFileName(data.fileName), _mime: data.mimeType, _size: bytes.length });
    if (error) throw new Error('The file uploaded, but proof registration failed. Retry attaching the proof.');
    return { id };
  });
export const downloadPayoutProof = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await (context.supabase as any).from('affiliate_payout_proofs').select('payout_id,object_key').eq('id', data.id).maybeSingle();
    if (error || !row) throw new Error('Payment proof is unavailable.');
    await payoutAccess(context, row.payout_id);
    if (!row.object_key.startsWith(`affiliate-proofs/${row.payout_id}/`) || row.object_key.includes('..')) throw new Error('Invalid proof reference.');
    const { presignR2Url } = await import('@/lib/r2.server');
    return { url: await presignR2Url({ key: row.object_key, method: 'GET', expiresInSeconds: 300 }) };
  });