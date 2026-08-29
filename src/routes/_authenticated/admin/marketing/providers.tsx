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
  deleteMarketingProvider,
  listMarketingProvidersFn,
  saveMarketingProvider,
  testMarketingProviderFn,
} from "@/lib/marketing.functions";
import { MARKETING_PROVIDER_TYPES } from "@/lib/marketing/provider-types";

export const Route = createFileRoute("/_authenticated/admin/marketing/providers")({
  head: () => ({
    meta: [
      { title: "Marketing Providers — MunchReach Admin" },
      {
        name: "description",
        content:
          "Connect Amazon SES, Resend, SendGrid, Mailgun or SMTP for internal MunchReach marketing sending, with credential testing and health.",
      },
      { property: "og:title", content: "Marketing Providers — MunchReach Admin" },
      {
        property: "og:description",
        content: "Manage marketing email providers used by the MunchReach marketing engine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProvidersPage,
});

function ProvidersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMarketingProvidersFn);
  const save = useServerFn(saveMarketingProvider);
  const test = useServerFn(testMarketingProviderFn);
  const remove = useServerFn(deleteMarketingProvider);

  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState("ses");
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["admin", "marketing", "providers"],
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "marketing"] });
  const fields = MARKETING_PROVIDER_TYPES.find((p) => p.id === providerType)?.fields ?? [];

  const saveMutation = useMutation({
    mutationFn: () =>
      save({ data: { name, providerType, status: "active", credentials } }),
    onSuccess: () => {
      toast.success("Provider saved");
      setName("");
      setCredentials({});
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Provider removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <MarketingPanel
        title="Connected providers"
        description="Marketing providers are isolated from customer sending accounts. Credentials are encrypted and write-only — they are never returned to the browser."
      >
        {query.isLoading ? (
          <MarketingLoading label="Loading providers" />
        ) : (query.data ?? []).length === 0 ? (
          <MarketingEmpty title="No marketing providers connected yet" />
        ) : (
          <div className="divide-y">
            {(query.data ?? []).map((provider) => (
              <div
                key={provider.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {provider.providerType} · {provider.hasCredentials ? "credentials set" : "no credentials"}
                    {provider.lastTestMessage ? ` · ${provider.lastTestMessage}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={provider.connectionStatus === "verified" ? "default" : "outline"}
                  >
                    {provider.connectionStatus}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testMutation.mutate(provider.id)}
                    disabled={testMutation.isPending}
                  >
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(provider.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </MarketingPanel>

      <MarketingPanel title="Add provider" description="Credentials go in once and cannot be read back.">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={providerType}
              onValueChange={(value) => {
                setProviderType(value);
                setCredentials({});
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKETING_PROVIDER_TYPES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fields.map((field) => (
            <div key={field} className="space-y-1">
              <Label>{field.replace(/_/g, " ")}</Label>
              <Input
                type={/key|password|secret/.test(field) ? "password" : "text"}
                value={credentials[field] ?? ""}
                onChange={(event) =>
                  setCredentials({ ...credentials, [field]: event.target.value })
                }
              />
            </div>
          ))}
        </div>
        <Button
          className="mt-3"
          onClick={() => saveMutation.mutate()}
          disabled={!name.trim() || saveMutation.isPending}
        >
          Save provider
        </Button>
      </MarketingPanel>
    </div>
  );
}
