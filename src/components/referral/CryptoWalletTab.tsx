import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Wallet, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAffiliateWallet, saveAffiliateWallet } from '@/lib/affiliate-payout.functions';
import { CRYPTO_LABELS, CRYPTO_NETWORKS, validWallet, type CryptoNetwork } from '@/lib/affiliate-payout-model';

export function CryptoWalletTab() {
  const client = useQueryClient();
  const fetchWallet = useServerFn(getAffiliateWallet);
  const saveWallet = useServerFn(saveAffiliateWallet);
  const wallet = useQuery({ queryKey: ['referrals','wallet'], queryFn: () => fetchWallet() });
  const [network, setNetwork] = useState<CryptoNetwork>('usdc_ethereum');
  const [address, setAddress] = useState('');
  const [verified, setVerified] = useState(false);
  const mutation = useMutation({ mutationFn: () => saveWallet({ data: { network, address, verified: true } }), onSuccess: () => { toast.success('Wallet address saved'); setVerified(false); void client.invalidateQueries({ queryKey: ['referrals','wallet'] }); }, onError: (error: Error) => toast.error(error.message) });
  return <div className="max-w-2xl space-y-6 py-6">
    <h2 className="flex items-center gap-2 text-xl font-semibold"><Wallet className="size-5 text-primary" />Add Wallet Address</h2>
    {wallet.isPending ? <Loader2 className="size-5 animate-spin" /> : wallet.error ? <p role="alert" className="text-destructive">{wallet.error.message}</p> : wallet.data ? <div className="space-y-2 border-b border-border pb-5"><p className="text-sm text-muted-foreground">Saved wallet · {CRYPTO_LABELS[wallet.data.network]}</p><p className="break-all font-mono text-sm">{wallet.data.address}</p><p className="text-xs text-muted-foreground">Updated {new Date(wallet.data.updated_at).toLocaleString()}</p><Button variant="outline" onClick={() => { if (wallet.data) { setAddress(wallet.data.address); setNetwork(wallet.data.network); setVerified(false); } }}>Update wallet</Button></div> : null}
    <div className="space-y-2"><Label htmlFor="crypto-network">Cryptocurrency / network</Label><Select value={network} onValueChange={value => { setNetwork(value as CryptoNetwork); setVerified(false); }}><SelectTrigger id="crypto-network"><SelectValue /></SelectTrigger><SelectContent>{CRYPTO_NETWORKS.map(value => <SelectItem key={value} value={value}>{CRYPTO_LABELS[value]}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-2"><Label htmlFor="crypto-wallet">Wallet address</Label><Input id="crypto-wallet" value={address} onChange={event => { setAddress(event.target.value); setVerified(false); }} placeholder={network === 'usdc_ethereum' ? '0x…' : 'T…'} className="font-mono" />{address && !validWallet(network, address) ? <p className="text-sm text-destructive">The address is not valid for this network.</p> : null}</div>
    <div className="flex gap-3 border-l-2 border-primary pl-4 text-sm"><ShieldAlert className="size-5 shrink-0 text-primary" /><p>Verify the address and network carefully. Transfers to an incorrect address or network may be irreversible. Updating your wallet does not change pending payout destinations.</p></div>
    <Label className="flex items-start gap-3"><Checkbox checked={verified} onCheckedChange={value => setVerified(value === true)} />I have verified the wallet address and selected network.</Label>
    <Button disabled={mutation.isPending || !verified || !validWallet(network,address) || Boolean(wallet.error)} onClick={() => mutation.mutate()}>{mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Save wallet address</Button>
  </div>;
}