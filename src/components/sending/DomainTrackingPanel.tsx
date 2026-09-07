import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DNS_STATUS_LABEL,
  DNS_STATUS_STYLE,
} from "@/lib/domains-model";
import {
  NOT_SUPPORTED_MESSAGE,
  TRACKING_STATUS_LABEL,
  TRACKING_STATUS_STYLE,
  type TrackingConfig,
} from "@/lib/domain-tracking";
import { getDomainTracking, verifyDomainTracking } from "@/lib/domain-tracking.functions";
import { cn } from "@/lib/utils";

function Copyable({ value, label }: { value: string; label: string }) {
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

/**
 * TRACKING section of the domain setup dialog.
 *
 * Everything shown here comes from the provider currently routing the domain,
 * so switching provider automatically replaces these records and resets the
 * status. Tracking readiness never affects sending readiness.
 */
export function DomainTrackingPanel({ domainId }: { domainId: string }) {
  const queryClient = useQueryClient();
  const fetchTracking = useServerFn(getDomainTracking);
  const verify = useServerFn(verifyDomainTracking);
  const [live, setLive] = useState<TrackingConfig | null>(null);

  const query = useQuery({
    queryKey: ["domain-tracking", domainId],
    queryFn: () => fetchTracking({ data: { id: domainId } }),
  });

  const mutation = useMutation({
    mutationFn: () => verify({ data: { id: domainId } }),
    onSuccess: async (result) => {
      setLive(result);
      if (result.status === "verified") toast.success("Tracking configuration verified.");
      else if (result.status === "not_supported") toast.message(NOT_SUPPORTED_MESSAGE);
      else toast.error(result.lastError || "Tracking DNS is not resolving yet — check again shortly.");
      await queryClient.invalidateQueries({ queryKey: ["domain-tracking", domainId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const config = live ?? query.data ?? null;

  return (
    <div className="rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide">Tracking</p>
        {config ? (
          <Badge variant="outline" className={cn("text-[11px]", TRACKING_STATUS_STYLE[config.status])}>
            {TRACKING_STATUS_LABEL[config.status]}
          </Badge>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={mutation.isPending || !config}
          onClick={() => mutation.mutate()}
        >
          <RefreshCw className={cn("mr-1.5 size-3.5", mutation.isPending && "animate-spin")} />
          Verify DNS
        </Button>
      </div>

      {query.isLoading || !config ? (
        <div className="mt-2 h-14 animate-pulse rounded bg-muted" />
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Open and click tracking follows the sending configuration assigned to this domain
            {config.providerRegion ? ` (region ${config.providerRegion})` : ""}. Sending is never
            blocked while tracking is pending.
          </p>

          {config.instructions.map((line) => (
            <p key={line} className="text-xs text-muted-foreground">
              {line}
            </p>
          ))}

          {config.records.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border/70">
              {config.records.map((record) => (
                <div key={record.id} className="space-y-2 border-b border-border/60 p-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {record.type}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn("ml-auto text-[11px]", DNS_STATUS_STYLE[record.status])}
                    >
                      {DNS_STATUS_LABEL[record.status]}
                    </Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                    <div className="rounded-md border border-border/70 bg-muted/40 p-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Host / name
                      </p>
                      <div className="flex items-start gap-1">
                        <code className="min-w-0 break-all text-xs">{record.host}</code>
                        <Copyable value={record.host} label="tracking host" />
                      </div>
                    </div>
                    <div className="rounded-md border border-border/70 bg-muted/40 p-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Value</p>
                      <div className="flex items-start gap-1">
                        <code className="min-w-0 break-all text-xs">{record.value}</code>
                        <Copyable value={record.value} label="tracking value" />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{record.purpose}</p>
                  {record.message && record.status !== "verified" ? (
                    <p className="text-xs text-destructive">{record.message}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {config.lastError && config.status !== "verified" ? (
            <p className="text-xs text-destructive">{config.lastError}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
