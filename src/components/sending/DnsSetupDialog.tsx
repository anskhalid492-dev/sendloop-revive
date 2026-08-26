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
import { DomainReadinessPanel } from "@/components/sending/DomainReadinessPanel";
import { getDomainDnsRecords, verifySendingDomain } from "@/lib/domains.functions";
import {
  DNS_STATUS_LABEL,
  DNS_STATUS_STYLE,
  DOMAIN_STAGE_LABEL,
  DOMAIN_STAGE_STYLE,
  type DnsRecordView,
  type DomainStage,
} from "@/lib/domains-model";
import { dnsRecordPurposeLabel } from "@/lib/dns-record-purpose";
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
        <span className="text-sm font-semibold">{dnsRecordPurposeLabel(record)}</span>
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
function SetupSteps({
  records,
  stage,
  dnsVerified,
  readyToSend,
}: {
  records: DnsRecordView[];
  stage: DomainStage;
  dnsVerified: boolean;
  readyToSend: boolean;
}) {
  const kind = (k: DnsRecordView["kind"]) => records.filter((record) => record.kind === k);
  const ok = (k: DnsRecordView["kind"]) => {
    const group = kind(k);
    return group.length > 0 && group.every((record) => record.status === "verified");
  };

  const steps = [
    { label: "Add your domain", done: true },
    { label: "Publish DNS records", done: records.length > 0 },
    { label: "SPF", done: ok("spf") || kind("spf").length === 0 },
    { label: "DKIM", done: ok("dkim") },
    { label: "DNS verified", done: dnsVerified },
    { label: "Domain verification", done: readyToSend },
    { label: "Ready to send", done: readyToSend },
  ];
  const complete = steps.filter((step) => step.done).length;

  return (
    <div className="rounded-lg border border-border/70 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Your domain setup</p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-[11px]", DOMAIN_STAGE_STYLE[stage])}>
            {DOMAIN_STAGE_LABEL[stage]}
          </Badge>
          <p className="text-xs text-muted-foreground">
            {complete}/{steps.length} complete
          </p>
        </div>
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
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
        <p>DNS setup: {dnsVerified ? "✓ Complete" : "⏳ In progress"}</p>
        <p>Domain verification: {readyToSend ? "✓ Complete" : stage === "provider_verification" ? "⏳ Checking" : "—"}</p>
        <p>Sending: {readyToSend ? "✓ Ready" : "Not yet"}</p>
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
  const [live, setLive] = useState<{
    records: DnsRecordView[];
    stage: DomainStage;
    dnsVerified: boolean;
    readyToSend: boolean;
  } | null>(null);

  const recordsQuery = useQuery({
    queryKey: ["domain-dns", domainId],
    queryFn: () => fetchRecords({ data: { id: domainId as string } }),
    enabled: Boolean(domainId),
    // Background rechecks while the domain is not ready yet.
    refetchInterval: (query) => (query.state.data?.readyToSend ? false : 30_000),
  });

  const verifyMutation = useMutation({
    mutationFn: () => verify({ data: { id: domainId as string } }),
    onSuccess: async (result) => {
      setLive({
        records: result.records,
        stage: result.stage,
        dnsVerified: result.dnsVerified,
        readyToSend: result.readyToSend,
      });
      if (result.readyToSend)
        toast.success("Domain verified and ready to send — you can now connect an email account.");
      else if (result.dnsVerified)
        toast.message("DNS is live. We are finishing verification automatically — check again shortly.");
      else
        toast.error("DNS changes are still propagating. Add the missing records and check again.");
      await queryClient.invalidateQueries({ queryKey: ["sending-domains"] });
      await queryClient.invalidateQueries({ queryKey: ["domain-dns", domainId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const view = live ?? recordsQuery.data ?? null;
  const records = view?.records ?? [];
  const stage: DomainStage = view?.stage ?? "pending_dns";
  const dnsVerified = view?.dnsVerified ?? false;
  const readyToSend = view?.readyToSend ?? false;

  return (
    <Dialog
      open={Boolean(domainId)}
      onOpenChange={(open) => {
        if (!open) setLive(null);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Domain setup — {recordsQuery.data?.domain ?? "domain"}</DialogTitle>
          <DialogDescription>
            Add these records at your DNS host, then click Verify domain. MunchReach checks DNS and
            completes verification with MunchReach Email Infrastructure automatically — nothing is
            marked verified until it really is.
          </DialogDescription>
        </DialogHeader>

        {domainId ? <DomainReadinessPanel domainId={domainId} /> : null}

        <SetupSteps
          records={records}
          stage={stage}
          dnsVerified={dnsVerified}
          readyToSend={readyToSend}
        />

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
            records.map((record) => <RecordRow key={record.id ?? record.kind} record={record} />)
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
            <li>DNS changes are still propagating? Leave this open — we recheck automatically.</li>
            <li>Still stuck? Contact MunchReach support and we will review the domain with you.</li>
          </ul>
        </div>

        <DialogFooter className="sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Required records are marked below. DMARC, MX and tracking records are recommended but
            optional.
          </p>
          <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
            <RefreshCw className={cn("size-4", verifyMutation.isPending && "animate-spin")} />
            {verifyMutation.isPending
              ? "Verifying domain…"
              : readyToSend
                ? "Check again"
                : "Verify domain"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
