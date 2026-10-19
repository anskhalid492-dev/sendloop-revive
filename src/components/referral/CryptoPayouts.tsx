import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getAffiliateWallet, requestCryptoPayout } from '@/lib/affiliate-payout.functions';
import { canRequestCryptoPayout, CRYPTO_LABELS, type CryptoNetwork } from '@/lib/affiliate-payout-model';
import { formatMoney, PAYOUT_STATUS_LABELS, type ReferralPayout, type ReferralStats } from '@/lib/referral-model';
import { PayoutProofs } from './PayoutProofs';

export function CryptoPayouts({ stats, payouts, eligible }: { stats: ReferralStats; payouts: ReferralPayout[]; eligible: boolean }) {
  const client = useQueryClient();
  const fetchWallet = useServerFn(getAffiliateWallet);
  const request = useServerFn(requestCryptoPayout);
  const wallet = useQuery({ queryKey: ['referrals','wallet'], queryFn: () => fetchWallet() });
  const [amount,setAmount] = useState('');
  const key = useRef<string | null>(null);
  const mutation = useMutation({ mutationFn: () => { key.current ??= crypto.randomUUID(); return request({ data: { amountCents: Math.round(Number(amount)*100), requestKey: key.current } }); }, onSuccess: () => { toast.success('Payout requested. Eligible requests are manually processed within 60 days.'); key.current = null; setAmount(''); void client.invalidateQueries({ queryKey: ['referrals','overview'] }); }, onError: (error: Error) => toast.error(error.message) });
  return <div className="space-y-6 py-5">
    <div className="grid gap-5 sm:grid-cols-3">{[['Available balance',stats.available_cents],['Pending payouts',stats.requested_cents],['Total paid',stats.total_payout_paid_cents ?? stats.paid_cents]].map(([label,value]) => <div key={label} className="border-b border-border pb-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{formatMoney(Number(value))}</p></div>)}</div>
    <div className="max-w-2xl space-y-4"><h2 className="flex items-center gap-2 text-lg font-semibold"><Wallet className="size-5 text-primary" />Request a crypto payout</h2><p className="text-sm text-muted-foreground">Minimum payout: $100 USD. MunchReach manually processes eligible requests with a valid wallet within 60 days. No automatic transfers.</p>
      {wallet.error ? <p className="text-destructive" role="alert">{wallet.error.message}</p> : wallet.data ? <div className="space-y-1"><p className="text-sm font-medium">{CRYPTO_LABELS[wallet.data.network]}</p><p className="break-all font-mono text-sm text-muted-foreground">{wallet.data.address}</p></div> : <p className="text-sm text-muted-foreground">Save a wallet in Add Wallet Address before requesting a payout.</p>}
      <div className="max-w-xs space-y-2"><Label htmlFor="payout-amount">Amount (USD)</Label><Input id="payout-amount" inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); key.current=null; }} placeholder="100.00" /></div>
      <Button disabled={mutation.isPending || !eligible || stats.requested_cents>0 || !canRequestCryptoPayout(stats.available_cents, Math.round(Number(amount)*100),wallet.data ?? null)} onClick={() => mutation.mutate()}>{mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Request payout</Button>
      {stats.requested_cents>0 ? <p className="text-sm text-muted-foreground">A payout is already pending. Your requested balance stays reserved until it is paid or rejected.</p> : null}
    </div>
    <h3 className="text-lg font-semibold">Payout history</h3>
    {!payouts.length ? <p className="text-sm text-muted-foreground">No payout requests yet.</p> : payouts.map(payout => <article key={payout.id} className="space-y-3 rounded-lg border border-border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{formatMoney(payout.amount_cents,payout.currency)} requested</p><p className="mt-1 text-xs text-muted-foreground">{new Date(payout.requested_at).toLocaleString()}{payout.processing_due_at ? ` · Processing due ${new Date(payout.processing_due_at).toLocaleDateString()}` : ''}</p></div><Badge variant="secondary">{PAYOUT_STATUS_LABELS[payout.status] ?? payout.status}</Badge></div><p className="text-sm text-muted-foreground">{payout.crypto_network ? CRYPTO_LABELS[payout.crypto_network as CryptoNetwork] ?? payout.crypto_network : 'Historical payout'}{payout.wallet_address ? ` · ${payout.wallet_address}` : ''}</p>{payout.status==='paid' ? <div className="space-y-1"><p className="text-sm font-medium">Paid {formatMoney(payout.actual_paid_cents ?? payout.amount_cents,payout.currency)} · {payout.paid_at ? new Date(payout.paid_at).toLocaleString() : 'Historical payment'}</p><p className="break-all font-mono text-xs">Transaction ID: {payout.reference ?? 'Not recorded'}</p></div> : null}<PayoutProofs payoutId={payout.id} /></article>)}
    <p className="text-xs text-muted-foreground">Latest 50 payout requests. Balances are USD; payout token and network follow your saved wallet.</p>
  </div>;
}