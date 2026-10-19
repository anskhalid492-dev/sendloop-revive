import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Paperclip, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { attachPayoutProof, downloadPayoutProof, listPayoutProofs } from '@/lib/affiliate-payout.functions';
import { MAX_PAYOUT_PROOF_BYTES, PROOF_MIME_TYPES } from '@/lib/affiliate-payout-model';

export function PayoutProofs({ payoutId, admin = false }: { payoutId: string; admin?: boolean }) {
  const client = useQueryClient();
  const list = useServerFn(listPayoutProofs);
  const attach = useServerFn(attachPayoutProof);
  const download = useServerFn(downloadPayoutProof);
  const input = useRef<HTMLInputElement>(null);
  const query = useQuery({ queryKey: ['payout-proofs',payoutId], queryFn: () => list({ data: { payoutId } }) });
  const upload = useMutation({ mutationFn: async (file: File) => {
    if (!file.size || file.size > MAX_PAYOUT_PROOF_BYTES || !(PROOF_MIME_TYPES as readonly string[]).includes(file.type)) throw new Error('Use a PNG, JPEG, WebP or PDF up to 5 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let content = ''; for (let index = 0; index < bytes.length; index += 8192) content += String.fromCharCode(...bytes.subarray(index,index+8192));
    return attach({ data: { payoutId, fileName: file.name, mimeType: file.type, content: btoa(content) } });
  }, onSuccess: () => { toast.success('Private payment proof attached'); void client.invalidateQueries({ queryKey: ['payout-proofs',payoutId] }); }, onError: (error: Error) => toast.error(error.message) });
  const read = useMutation({ mutationFn: (id: string) => download({ data: { id } }), onSuccess: ({ url }) => { const anchor = document.createElement('a'); anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.click(); }, onError: (error: Error) => toast.error(error.message) });
  return <div className="space-y-2">
    {admin ? <><input ref={input} type="file" accept={PROOF_MIME_TYPES.join(',')} className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ''; }} /><Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>{upload.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Paperclip className="mr-2 size-4" />}Attach payment proof</Button><p className="text-xs text-muted-foreground">Private · PNG, JPEG, WebP or PDF · up to 5 MB</p></> : null}
    {query.error ? <p role="alert" className="text-xs text-destructive">{query.error.message}</p> : query.data?.map(proof => <Button key={proof.id} variant="ghost" size="sm" className="h-auto max-w-full justify-start whitespace-normal text-left" disabled={read.isPending} onClick={() => read.mutate(proof.id)}><Download className="mr-2 size-4 shrink-0" /><span className="break-all">{proof.file_name}</span></Button>)}
  </div>;
}