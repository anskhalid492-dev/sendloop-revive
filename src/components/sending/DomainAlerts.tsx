import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { verifySendingDomain } from "@/lib/domains.functions";
import { dismissDomainAlert, listDomainAlerts } from "@/lib/warmup.functions";

/** Remediation steps shown for each failing authentication record. */
const REMEDIATION: Record<string, string[]> = {
  spf: [
    "Open your DNS provider and locate the TXT record for the root domain.",
    "Confirm a single SPF record exists and still includes your sending provider.",
    "Remove duplicate SPF records — more than one makes SPF fail entirely.",
  ],
  dkim: [
    "Check the DKIM CNAME/TXT record for your selector is still published.",
    "Re-copy the value from DNS records — providers rotate keys on reconnect.",
    "Wait for the TTL to expire after fixing, then re-verify.",
  ],
  dmarc: [
    "Confirm the _dmarc TXT record exists and starts with v=DMARC1.",
    "Keep a valid policy (p=none, quarantine or reject) and a reporting address.",
    "Avoid multiple _dmarc records on the same host.",
  ],
};

export function DomainAlerts() {
  const queryClient = useQueryClient();
  const fetchAlerts = useServerFn(listDomainAlerts);
  const dismissFn = useServerFn(dismissDomainAlert);
  const verifyFn = useServerFn(verifySendingDomain);

  const alertsQuery = useQuery({
    queryKey: ["domain-alerts"],
    queryFn: () => fetchAlerts(),
    refetchInterval: 60_000,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["domain-alerts"] });
    await queryClient.invalidateQueries({ queryKey: ["sending-domains"] });
  };

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => verifyFn({ data: { id } }),
    onSuccess: async (result) => {
      if (result.dnsStatus === "verified") toast.success("DNS is healthy again.");
      else toast.error("The records are still failing.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const alerts = alertsQuery.data?.alerts ?? [];
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const records = alert.records ?? [];
        const steps = records.flatMap((record) => REMEDIATION[record] ?? []);
        return (
          <div
            key={alert.id}
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-destructive">{alert.title}</p>
                {alert.detail ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{alert.detail}</p>
                ) : null}
                {steps.length > 0 ? (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={verifyMutation.isPending}
                    onClick={() => verifyMutation.mutate(alert.domain_id)}
                  >
                    <RefreshCw className="size-4" /> Re-verify DNS
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => dismissMutation.mutate(alert.id)}
                  >
                    <X className="size-4" /> Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
