import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDomainDnsRecords, verifySendingDomain } from "@/lib/domains.functions";
import {
  DNS_STATUS_LABEL,
  DNS_STATUS_STYLE,
  RECORD_KIND_LABEL,
  type DnsRecordView,
} from "@/lib/domains-model";
import { cn } from "@/lib/utils";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          toast.error("Copying is blocked in this browser — select the value manually.");
        }
      }}
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

function RecordRow({ record }: { record: DnsRecordView }) {
  return (
    <div className="space-y-2 border-b border-border/60 p-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{RECORD_KIND_LABEL[record.kind]}</span>
        <Badge variant="outline" className="font-mono text-[11px]">
          {record.type}
        </Badge>
        {record.required ? null : (
          <Badge variant="outline" className="text-[11px]">
            Optional
          </Badge>
        )}
        <Badge variant="outline" className={cn("ml-auto text-[11px]", DNS_STATUS_STYLE[record.status])}>
          {DNS_STATUS_LABEL[record.status]}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{record.purpose}</p>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="rounded-md border border-border/70 bg-muted/40 p-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Host / name</p>
          <div className="flex items-start gap-1">
            <code className="min-w-0 break-all text-xs">{record.host}</code>
            <CopyButton value={record.host} label="host" />
          </div>
        </div>
        <div className="rounded-md border border-border/70 bg-muted/40 p-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Value {record.priority ? `(priority ${record.priority})` : ""}
          </p>
          <div className="flex items-start gap-1">
            <code className="min-w-0 break-all text-xs">{record.value}</code>
            <CopyButton value={record.value} label="value" />
          </div>
        </div>
      </div>

      {record.message && record.status !== "verified" ? (
        <p className="text-xs text-destructive">{record.message}</p>
      ) : null}
      {record.observed && record.status === "failed" ? (
        <p className="text-xs text-muted-foreground">
          Currently published: <code className="break-all">{record.observed}</code>
        </p>
      ) : null}
    </div>
  );
}

export function DnsSetupDialog({
  domainId,
  onOpenChange,
}: {
  domainId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fetchRecords = useServerFn(getDomainDnsRecords);
  const verify = useServerFn(verifySendingDomain);
  const [liveRecords, setLiveRecords] = useState<DnsRecordView[] | null>(null);

  const recordsQuery = useQuery({
    queryKey: ["domain-dns", domainId],
    queryFn: () => fetchRecords({ data: { id: domainId as string } }),
    enabled: Boolean(domainId),
  });

  const verifyMutation = useMutation({
    mutationFn: () => verify({ data: { id: domainId as string } }),
    onSuccess: async (result) => {
      setLiveRecords(result.records);
      if (result.dnsStatus === "verified") toast.success("DNS verified — you can connect a mailbox.");
      else toast.error("Some required records are not live yet. DNS changes can take a few hours.");
      await queryClient.invalidateQueries({ queryKey: ["sending-domains"] });
      await queryClient.invalidateQueries({ queryKey: ["domain-dns", domainId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const records = liveRecords ?? recordsQuery.data?.records ?? [];

  return (
    <Dialog
      open={Boolean(domainId)}
      onOpenChange={(open) => {
        if (!open) setLiveRecords(null);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>DNS setup — {recordsQuery.data?.domain ?? "domain"}</DialogTitle>
          <DialogDescription>
            Add these records at your DNS provider, then verify. Verification performs a real DNS
            lookup — nothing is marked verified until the records are actually live.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-border/70">
          {recordsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No records available for this domain.
            </p>
          ) : (
            records.map((record) => <RecordRow key={record.kind} record={record} />)
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <p className="text-xs text-muted-foreground">
            SPF, DKIM and DMARC are required. MX and the tracking CNAME are optional.
          </p>
          <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
            <RefreshCw className={cn("size-4", verifyMutation.isPending && "animate-spin")} />
            {verifyMutation.isPending ? "Checking DNS…" : "Verify DNS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
