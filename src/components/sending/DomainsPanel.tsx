import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Globe, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { removeSendingDomain, verifySendingDomain } from "@/lib/domains.functions";
import {
  DNS_STATUS_STYLE,
  DOMAIN_STAGE_LABEL,
  DOMAIN_STAGE_STYLE,
  type SendingDomain,
} from "@/lib/domains-model";
import { cn } from "@/lib/utils";

export function DomainsPanel({
  domains,
  isLoading,
  onAddDomain,
  onOpenDns,
  onConnectMailbox,
}: {
  domains: SendingDomain[];
  isLoading: boolean;
  onAddDomain: () => void;
  onOpenDns: (domainId: string) => void;
  onConnectMailbox: (domainId: string) => void;
}) {
  const queryClient = useQueryClient();
  const verify = useServerFn(verifySendingDomain);
  const remove = useServerFn(removeSendingDomain);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sending-domains"] });
    await queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
  };

  const verifyMutation = useMutation({
    mutationFn: (id: string) => verify({ data: { id } }),
    onMutate: (id: string) => setBusyId(id),
    onSuccess: async (result) => {
      if (result.readyToSend) toast.success("Domain verified — it is ready to send.");
      else if (result.dnsVerified)
        toast.message("DNS looks good. We are finishing verification — this can take a few minutes.");
      else toast.error("DNS changes are still propagating. We will keep checking.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setBusyId(null),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Domain removed.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 p-3">
        <Globe className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Your domains ({domains.length})</h2>
        <Button size="sm" variant="outline" className="ml-auto" onClick={onAddDomain}>
          <Plus className="size-4" /> Add domain
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <div className="space-y-3 p-8 text-center">
          <h3 className="text-base font-semibold">Add a domain you own</h3>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            You bring your own domain and mailboxes. Add the domain, publish the DNS records, verify,
            then connect your own email account.
          </p>
          <Button onClick={onAddDomain}>
            <Plus className="size-4" /> Add domain
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {domains.map((domain) => (
            <li key={domain.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <div className="min-w-52 flex-1">
                <p className="font-medium">{domain.domain}</p>
                <p className="text-xs text-muted-foreground">
                  {domain.mailboxCount} mailbox{domain.mailboxCount === 1 ? "" : "es"} ·{" "}
                  {domain.activeMailboxes} active
                  {domain.registrar ? ` · ${domain.registrar}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["SPF", domain.spf_status],
                    ["DKIM", domain.dkim_status],
                    ["DMARC", domain.dmarc_status],
                  ] as const
                ).map(([label, status]) => (
                  <Badge
                    key={label}
                    variant="outline"
                    className={cn("text-[11px]", DNS_STATUS_STYLE[status])}
                  >
                    {label}
                  </Badge>
                ))}
              </div>

              <Badge variant="outline" className={cn("font-medium", DOMAIN_STAGE_STYLE[domain.stage])}>
                {DOMAIN_STAGE_LABEL[domain.stage]}
              </Badge>

              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === domain.id}
                  onClick={() => verifyMutation.mutate(domain.id)}
                >
                  <RefreshCw className={cn("size-4", busyId === domain.id && "animate-spin")} />
                  {domain.readyToSend ? "Re-check" : "Verify domain"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onOpenDns(domain.id)}>
                  <Settings2 className="size-4" /> DNS records
                </Button>
                <Button
                  size="sm"
                  disabled={!domain.readyToSend}
                  onClick={() => onConnectMailbox(domain.id)}
                >
                  Connect mailbox
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={`Remove ${domain.domain}`}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(domain.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {!domain.readyToSend && domain.stage !== "pending_dns" ? (
                <p className="w-full text-xs text-muted-foreground">
                  {domain.stage === "provider_verification"
                    ? "Finishing verification with MunchReach Email Infrastructure — this can take a few minutes."
                    : domain.stage === "provider_error"
                      ? "Your sending domain could not be verified yet. We will keep checking automatically."
                      : "DNS changes are still propagating. Open DNS records to see what is missing."}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
