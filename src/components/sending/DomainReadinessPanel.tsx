import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Copy, MailCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { enableDomainReceiving, getDomainReadiness } from "@/lib/domain-readiness.functions";
import {
  MX_STATE_LABEL,
  PILLAR_STATE_LABEL,
  PILLAR_STATE_STYLE,
  READINESS_STATE_LABEL,
  buildPillars,
  hasDnsConflict,
  overallState,
  type CustomerDomainReadiness,
} from "@/lib/domain-readiness-view";
import { dnsRecordPurposeLabel } from "@/lib/dns-record-purpose";
import { cn } from "@/lib/utils";

function CopyValue({ value, label }: { value: string; label: string }) {
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

function StateBadge({ state, children }: { state: keyof typeof PILLAR_STATE_STYLE; children?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", PILLAR_STATE_STYLE[state])}>
      {children ?? PILLAR_STATE_LABEL[state]}
    </Badge>
  );
}

/**
 * Customer readiness experience for one domain: sending, receiving replies, DNS
 * and reply delivery, all read from the provider-neutral readiness engine. No
 * provider is named and no DNS record is invented here.
 */
export function DomainReadinessPanel({ domainId }: { domainId: string }) {
  const queryClient = useQueryClient();
  const fetchReadiness = useServerFn(getDomainReadiness);
  const enableReceiving = useServerFn(enableDomainReceiving);

  const query = useQuery({
    queryKey: ["domain-readiness", domainId],
    queryFn: () => fetchReadiness({ data: { id: domainId } }),
    // Manual refresh only — no aggressive polling loop.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const enable = useMutation({
    mutationFn: () => enableReceiving({ data: { id: domainId } }),
    onSuccess: async (result) => {
      if (result.ok) toast.success("Receiving is enabled for this domain.");
      else toast.message(result.detail);
      await queryClient.invalidateQueries({ queryKey: ["domain-readiness", domainId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="h-16 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm font-medium text-destructive">Unable to check domain status right now.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing is wrong with your domain settings — the check itself failed. Try again in a moment.
        </p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => query.refetch()}>
          <RefreshCw className="size-4" /> Try again
        </Button>
      </div>
    );
  }

  const readiness: CustomerDomainReadiness = query.data;
  const pillars = buildPillars(readiness);
  const overall = overallState(readiness);
  const conflict = hasDnsConflict(readiness);
  const checking = query.isFetching;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{readiness.domain}</p>
          <StateBadge state={overall}>{READINESS_STATE_LABEL[readiness.state]}</StateBadge>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={checking}
            onClick={() => query.refetch()}
          >
            <RefreshCw className={cn("size-4", checking && "animate-spin")} />
            {checking ? "Checking DNS..." : "Check DNS"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{readiness.providerLabel}</p>
        <p className="mt-2 text-sm text-muted-foreground">{readiness.message}</p>

        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <div key={pillar.id} className="rounded-md border border-border/60 bg-muted/30 p-2">
              <div className="flex items-center gap-2">
                <dt className="text-sm font-medium">{pillar.label}</dt>
                <span className="ml-auto">
                  <StateBadge state={pillar.state} />
                </span>
              </div>
              <dd className="mt-1 text-xs text-muted-foreground">{pillar.detail}</dd>
            </div>
          ))}
        </dl>

        {overall === "ok" ? (
          <p className="mt-3 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-2 text-sm text-emerald-700 dark:text-emerald-400">
            Your domain is ready to send campaigns and receive replies in Unified Inbox.
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            A verified sending domain does not by itself mean replies will arrive — receiving and DNS
            must be ready too.
          </p>
        )}
      </div>

      {conflict ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            <p className="text-sm font-semibold text-destructive">DNS conflict</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Incoming email for this domain is currently routed to another mail provider.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-border/70 bg-muted/40 p-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current MX</p>
              {readiness.dns.currentMx.length === 0 ? (
                <p className="text-xs text-muted-foreground">None published.</p>
              ) : (
                readiness.dns.currentMx.map((record) => (
                  <code key={record.host} className="block break-all text-xs">
                    {record.priority !== null ? `${record.priority} ` : ""}
                    {record.host}
                  </code>
                ))
              )}
            </div>
            <div className="rounded-md border border-border/70 bg-muted/40 p-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Required MX</p>
              {readiness.dns.requiredMx.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Available once receiving is enabled for this domain.
                </p>
              ) : (
                readiness.dns.requiredMx.map((record) => (
                  <code key={record.host} className="block break-all text-xs">
                    {record.priority !== null ? `${record.priority} ` : ""}
                    {record.host}
                  </code>
                ))
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Update your domain&apos;s DNS records, then click Check DNS.
          </p>
        </div>
      ) : null}

      {!readiness.receiving.supported ? (
        <p className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
          Inbound email receiving is not supported by this provider.
        </p>
      ) : !readiness.receiving.ready ? (
        <div className="rounded-md border border-border/70 bg-muted/30 p-3">
          <p className="text-sm font-medium">Receiving replies is not enabled yet</p>
          <p className="mt-1 text-sm text-muted-foreground">{readiness.receiving.detail}</p>
          {readiness.receiving.canAutoEnable ? (
            <Button
              size="sm"
              className="mt-2"
              disabled={enable.isPending}
              onClick={() => enable.mutate()}
            >
              <MailCheck className={cn("size-4", enable.isPending && "animate-pulse")} />
              {enable.isPending ? "Enabling..." : "Enable receiving"}
            </Button>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Once receiving is switched on for this domain, click Check DNS to confirm.
            </p>
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border/70">
        <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-3 py-2">
          <p className="text-sm font-semibold">Required DNS records</p>
          <Badge variant="outline" className="text-[11px]">
            MX: {MX_STATE_LABEL[readiness.dns.state]}
          </Badge>
        </div>
        <p className="border-b border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Add this MX record to the root of your domain (host <code>@</code>). Do not add it to your
          sending or tracking subdomain.
        </p>
        {readiness.dns.records.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No DNS records have been issued for this domain yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2">Record</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Host / name</th>
                  <th className="p-2">Value / target</th>
                  <th className="p-2">Priority</th>
                  <th className="p-2">TTL</th>
                  <th className="p-2">Purpose</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {readiness.dns.records.map((record, index) => (
                  <tr key={`${record.type}-${record.host}-${index}`}>
                    <td className="p-2 font-medium">{dnsRecordPurposeLabel(record)}</td>
                    <td className="p-2 font-mono">{record.type}</td>
                    <td className="p-2">
                      <span className="flex items-start gap-1">
                        <code className="min-w-0 break-all">{record.host}</code>
                        <CopyValue value={record.host} label="host" />
                      </span>
                    </td>
                    <td className="p-2">
                      <span className="flex items-start gap-1">
                        <code className="min-w-0 break-all">{record.value}</code>
                        <CopyValue value={record.value} label="value" />
                      </span>
                    </td>
                    <td className="p-2">{record.priority ?? "—"}</td>
                    <td className="p-2">{record.ttl}</td>
                    <td className="p-2 text-muted-foreground">{record.purpose}</td>
                    <td className="p-2">
                      <StateBadge state={record.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Last checked {new Date(readiness.checkedAt).toLocaleString()}. MunchReach never changes your
        DNS — you stay in control at your registrar.
      </p>
    </div>
  );
}
