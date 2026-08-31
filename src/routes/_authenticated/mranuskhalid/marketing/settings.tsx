import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
  getMarketingSettings,
  listMarketingDomains,
  listMarketingProvidersFn,
  listMarketingSuppression,
  saveMarketingSettings,
  updateMarketingSuppression,
} from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/marketing/settings")({
  head: () => ({
    meta: [
      { title: "Marketing Settings — MunchReach Admin" },
      {
        name: "description",
        content:
          "Global marketing defaults for MunchReach: default provider, sending domain, frequency caps and the marketing suppression list.",
      },
      { property: "og:title", content: "Marketing Settings — MunchReach Admin" },
      {
        property: "og:description",
        content: "Frequency caps, defaults and suppression for the MunchReach marketing engine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const NONE = "__none__";

function SettingsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getMarketingSettings);
  const save = useServerFn(saveMarketingSettings);
  const listProviders = useServerFn(listMarketingProvidersFn);
  const listDomains = useServerFn(listMarketingDomains);
  const listSuppression = useServerFn(listMarketingSuppression);
  const updateSuppression = useServerFn(updateMarketingSuppression);

  const settings = useQuery({
    queryKey: ["admin", "marketing", "settings"],
    queryFn: () => load(),
  });
  const providers = useQuery({
    queryKey: ["admin", "marketing", "providers"],
    queryFn: () => listProviders(),
  });
  const domains = useQuery({
    queryKey: ["admin", "marketing", "domains"],
    queryFn: () => listDomains(),
  });
  const suppression = useQuery({
    queryKey: ["admin", "marketing", "suppression"],
    queryFn: () => listSuppression(),
  });

  const [providerId, setProviderId] = useState(NONE);
  const [domainId, setDomainId] = useState(NONE);
  const [perDay, setPerDay] = useState(1);
  const [perWeek, setPerWeek] = useState(3);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    setProviderId(settings.data.defaultProviderId ?? NONE);
    setDomainId(settings.data.defaultSendingDomainId ?? NONE);
    setPerDay(settings.data.maxEmailsPerDay);
    setPerWeek(settings.data.maxEmailsPerWeek);
  }, [settings.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "marketing"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          defaultProviderId: providerId === NONE ? null : providerId,
          defaultSendingDomainId: domainId === NONE ? null : domainId,
          maxEmailsPerDay: perDay,
          maxEmailsPerWeek: perWeek,
        },
      }),
    onSuccess: () => {
      toast.success("Marketing settings saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const suppressionMutation = useMutation({
    mutationFn: (vars: { email: string; action: "add" | "remove" }) =>
      updateSuppression({ data: vars }),
    onSuccess: () => {
      toast.success("Suppression list updated");
      setEmail("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (settings.isLoading) return <MarketingLoading label="Loading settings" />;

  return (
    <div className="space-y-6">
      <MarketingPanel
        title="Defaults and frequency caps"
        description="Caps apply per subscriber across every marketing campaign and automation — transactional and product email are never affected."
      >
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>Default provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {(providers.data ?? []).map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Default sending domain</Label>
            <Select value={domainId} onValueChange={setDomainId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {(domains.data ?? []).map((row) => (
                  <SelectItem key={String(row.id)} value={String(row.id)}>
                    {String(row.domain)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Max emails per day</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={perDay}
              onChange={(event) => setPerDay(Number(event.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Max emails per week</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={perWeek}
              onChange={(event) => setPerWeek(Number(event.target.value))}
            />
          </div>
        </div>
        <Button className="mt-3" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          Save settings
        </Button>
      </MarketingPanel>

      <MarketingPanel
        title="Marketing suppression"
        description="Suppressed addresses can never receive marketing email, regardless of segment membership."
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-72"
              placeholder="person@example.com"
            />
          </div>
          <Button
            variant="outline"
            disabled={!email.includes("@")}
            onClick={() => suppressionMutation.mutate({ email, action: "add" })}
          >
            Suppress
          </Button>
        </div>

        <div className="mt-4">
          {suppression.isLoading ? (
            <MarketingLoading label="Loading suppression list" />
          ) : (suppression.data ?? []).length === 0 ? (
            <MarketingEmpty title="Suppression list is empty" />
          ) : (
            <div className="divide-y">
              {(suppression.data ?? []).map((row) => (
                <div
                  key={String(row.email)}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="text-sm">{String(row.email)}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(row.reason)} · {String(row.source ?? "system")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      suppressionMutation.mutate({ email: String(row.email), action: "remove" })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </MarketingPanel>
    </div>
  );
}
