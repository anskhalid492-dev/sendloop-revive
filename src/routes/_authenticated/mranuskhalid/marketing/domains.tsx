import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MarketingEmpty,
  MarketingLoading,
  MarketingPanel,
} from "@/components/admin/marketing/MarketingUI";
import {
  deleteMarketingDomain,
  listMarketingDomains,
  listMarketingProvidersFn,
  saveMarketingDomain,
  verifyMarketingDomain,
} from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/admin/marketing/domains")({
  head: () => ({
    meta: [
      { title: "Marketing Domains — MunchReach Admin" },
      {
        name: "description",
        content:
          "Dedicated marketing sending domains with SPF, DKIM and DMARC status — kept separate from customer cold outbound domains.",
      },
      { property: "og:title", content: "Marketing Domains — MunchReach Admin" },
      {
        property: "og:description",
        content: "Manage dedicated marketing sending domains for MunchReach.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DomainsPage,
});

const NONE = "__none__";

type DnsRecord = { type?: string; name?: string; value?: string; priority?: number };

function DomainsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMarketingDomains);
  const listProviders = useServerFn(listMarketingProvidersFn);
  const save = useServerFn(saveMarketingDomain);
  const verify = useServerFn(verifyMarketingDomain);
  const remove = useServerFn(deleteMarketingDomain);

  const [domain, setDomain] = useState("");
  const [providerId, setProviderId] = useState(NONE);

  const query = useQuery({
    queryKey: ["admin", "marketing", "domains"],
    queryFn: () => list(),
  });
  const providers = useQuery({
    queryKey: ["admin", "marketing", "providers"],
    queryFn: () => listProviders(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "marketing"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      save({ data: { domain, providerId: providerId === NONE ? null : providerId } }),
    onSuccess: () => {
      toast.success("Domain added");
      setDomain("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => verify({ data: { id } }),
    onSuccess: (result) => {
      toast.success(`Domain ${result.status}${result.detail ? ` — ${result.detail}` : ""}`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Domain removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <MarketingPanel
        title="Add a dedicated marketing domain"
        description="Marketing mail must never share a domain with customer cold outbound — a marketing complaint would otherwise damage outbound reputation."
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Domain</Label>
            <Input
              value={domain}
              placeholder="news.munchreach.com"
              onChange={(event) => setDomain(event.target.value)}
              className="w-72"
            />
          </div>
          <div className="space-y-1">
            <Label>Provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {(providers.data ?? []).map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!domain.includes(".") || saveMutation.isPending}
          >
            Add domain
          </Button>
        </div>
      </MarketingPanel>

      <MarketingPanel title="Sending domains" description="DNS records come from the provider; verification never marks a domain verified locally.">
        {query.isLoading ? (
          <MarketingLoading label="Loading domains" />
        ) : (query.data ?? []).length === 0 ? (
          <MarketingEmpty title="No marketing domains configured" />
        ) : (
          <div className="space-y-3">
            {(query.data ?? []).map((row) => {
              const id = String(row.id);
              const records = (Array.isArray(row.dns_records) ? row.dns_records : []) as DnsRecord[];
              return (
                <div key={id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{String(row.domain)}</p>
                      <p className="text-xs text-muted-foreground">
                        SPF {String(row.spf_status)} · DKIM {String(row.dkim_status)} · DMARC{" "}
                        {String(row.dmarc_status)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={row.verification_status === "verified" ? "default" : "outline"}
                      >
                        {String(row.verification_status)}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => verifyMutation.mutate(id)}
                        disabled={verifyMutation.isPending}
                      >
                        Check DNS
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                  {records.length > 0 ? (
                    <div className="mt-3 overflow-x-auto rounded border bg-muted/30 p-2">
                      <table className="w-full text-xs">
                        <thead className="text-left text-muted-foreground">
                          <tr>
                            <th className="py-1">Type</th>
                            <th className="py-1">Name</th>
                            <th className="py-1">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records.map((record, index) => (
                            <tr key={`${id}-${index}`} className="align-top">
                              <td className="py-1 pr-2">{record.type ?? "—"}</td>
                              <td className="py-1 pr-2 font-mono">{record.name ?? "—"}</td>
                              <td className="py-1 break-all font-mono">{record.value ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </MarketingPanel>
    </div>
  );
}
