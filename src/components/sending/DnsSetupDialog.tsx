import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CircleDot, Copy, HelpCircle, RefreshCw } from "lucide-react";
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

/** Customer-facing setup journey for a sending domain. */
function SetupSteps({ records }: { records: DnsRecordView[] }) {
  const status = (kind: DnsRecordView["kind"]) =>
    records.find((record) => record.kind === kind)?.status ?? "pending";
  const hasRecords = records.length > 0;
  const spf = status("spf") === "verified";
  const dkim = status("dkim") === "verified";
  const dmarc = status("dmarc") === "verified";
  const sendingReady = spf && dkim && dmarc;

  const steps = [
    { label: "Add your domain", done: true },
    { label: "Verify ownership", done: hasRecords },
    { label: "Configure DNS records", done: hasRecords },
    { label: "Verify SPF", done: spf },
    { label: "Verify DKIM", done: dkim },
    { label: "Verify DMARC", done: dmarc },
    { label: "Enable sending", done: sendingReady },
    { label: "Connect email accounts", done: false },
  ];
  const complete = steps.filter((step) => step.done).length;

  return (
    <div className="rounded-lg border border-border/70 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Your domain setup</p>
        <p className="text-xs text-muted-foreground">{complete}/8 complete</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {steps.map((step, index) => (
          <span
            key={step.label}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              step.done
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            {step.done ? <Check className="size-3" /> : <CircleDot className="size-3" />}
            {index + 1}. {step.label}
          </span>
        ))}
      </div>
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
      if (result.dnsStatus === "verified")
        toast.success("Domain verified — you can now connect an email account.");
      else
        toast.error(
          "Some required records are not live yet. DNS changes can take a few hours to propagate.",
        );
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
          <DialogTitle>Domain setup — {recordsQuery.data?.domain ?? "domain"}</DialogTitle>
          <DialogDescription>
            Add these records in your domain's DNS settings, then run the check. MunchReach performs
            a real DNS lookup — nothing is marked verified until the records are actually live.
          </DialogDescription>
        </DialogHeader>

        <SetupSteps records={records} />

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

        <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <HelpCircle className="size-3.5" /> Troubleshooting
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            <li>Keep exactly one SPF record on the root domain — duplicates make SPF fail.</li>
            <li>Paste values exactly as shown; some DNS hosts add a trailing dot automatically.</li>
            <li>DNS changes can take up to a few hours to propagate. Check again after the TTL.</li>
            <li>Still stuck? Contact MunchReach support and we will review the domain with you.</li>
          </ul>
        </div>

        <DialogFooter className="sm:justify-between">
          <p className="text-xs text-muted-foreground">
            SPF, DKIM and DMARC are required. MX and the tracking record are optional.
          </p>
          <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
            <RefreshCw className={cn("size-4", verifyMutation.isPending && "animate-spin")} />
            {verifyMutation.isPending ? "Checking domain…" : "Check DNS again"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
