import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send } from "lucide-react";

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
  listMarketingCampaigns,
  listMarketingDomains,
  listMarketingProvidersFn,
  listMarketingSegments,
  listMarketingTemplates,
  runMarketingCampaign,
  saveMarketingCampaign,
  sendMarketingTest,
  setMarketingCampaignStatus,
} from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/admin/marketing/campaigns")({
  head: () => ({
    meta: [
      { title: "Marketing Campaigns — MunchReach Admin" },
      {
        name: "description",
        content:
          "Create, schedule and send internal marketing campaigns and newsletters to MunchReach subscribers.",
      },
      { property: "og:title", content: "Marketing Campaigns — MunchReach Admin" },
      {
        property: "og:description",
        content: "Admin-only marketing campaign management for MunchReach.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignsPage,
});

const NONE = "__none__";

function CampaignsPage() {
  const qc = useQueryClient();
  const listCampaigns = useServerFn(listMarketingCampaigns);
  const listTemplates = useServerFn(listMarketingTemplates);
  const listSegments = useServerFn(listMarketingSegments);
  const listProviders = useServerFn(listMarketingProvidersFn);
  const listDomains = useServerFn(listMarketingDomains);
  const save = useServerFn(saveMarketingCampaign);
  const run = useServerFn(runMarketingCampaign);
  const setStatus = useServerFn(setMarketingCampaignStatus);
  const sendTest = useServerFn(sendMarketingTest);

  const campaigns = useQuery({
    queryKey: ["admin", "marketing", "campaigns"],
    queryFn: () => listCampaigns(),
  });
  const templates = useQuery({
    queryKey: ["admin", "marketing", "templates"],
    queryFn: () => listTemplates(),
  });
  const segments = useQuery({
    queryKey: ["admin", "marketing", "segments"],
    queryFn: () => listSegments(),
  });
  const providers = useQuery({
    queryKey: ["admin", "marketing", "providers"],
    queryFn: () => listProviders(),
  });
  const domains = useQuery({
    queryKey: ["admin", "marketing", "domains"],
    queryFn: () => listDomains(),
  });

  const [name, setName] = useState("");
  const [campaignType, setCampaignType] = useState("announcement");
  const [template, setTemplate] = useState("");
  const [segment, setSegment] = useState("");
  const [providerId, setProviderId] = useState(NONE);
  const [domainId, setDomainId] = useState(NONE);
  const [fromName, setFromName] = useState("MunchReach");
  const [fromEmail, setFromEmail] = useState("");
  const [testTo, setTestTo] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "marketing"] });

  const templateParts = (value: string) =>
    value.startsWith("builtin:")
      ? { builtinTemplateKey: value.slice("builtin:".length), templateId: null }
      : { builtinTemplateKey: null, templateId: value || null };

  const segmentParts = (value: string) =>
    value.startsWith("builtin:")
      ? { segmentKey: value.slice("builtin:".length), segmentId: null }
      : { segmentKey: null, segmentId: value || null };

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          name,
          campaignType,
          ...templateParts(template),
          ...segmentParts(segment),
          providerId: providerId === NONE ? null : providerId,
          sendingDomainId: domainId === NONE ? null : domainId,
          fromName,
          fromEmail,
        },
      }),
    onSuccess: () => {
      toast.success("Campaign saved as draft");
      setName("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => run({ data: { id } }),
    onSuccess: (result) => {
      toast.success(`Processed ${result.processed} · sent ${result.sent} · skipped ${result.skipped}`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: "draft" | "scheduled" | "paused" | "cancelled" }) =>
      setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Campaign updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      sendTest({
        data: {
          to: testTo,
          ...templateParts(template),
          fromName,
          fromEmail,
          providerId: providerId === NONE ? "" : providerId,
        },
      }),
    onSuccess: () => toast.success("Test email sent"),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <MarketingPanel
        title="New campaign"
        description="Marketing campaigns never touch the customer cold-email engine, mailboxes or warmup pool."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={campaignType} onValueChange={setCampaignType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["announcement", "newsletter", "product_update", "onboarding", "reengagement"].map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Template</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {(templates.data?.custom ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
                {(templates.data?.builtIn ?? []).map((item) => (
                  <SelectItem key={item.id} value={`builtin:${item.key}`}>
                    {item.name} (built-in)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Audience</Label>
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger>
                <SelectValue placeholder="Select segment" />
              </SelectTrigger>
              <SelectContent>
                {(segments.data?.builtIn ?? []).map((item) => (
                  <SelectItem key={item.key} value={`builtin:${item.key}`}>
                    {item.name}
                  </SelectItem>
                ))}
                {(segments.data?.custom ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="Default provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Use default</SelectItem>
                {(providers.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Sending domain</Label>
            <Select value={domainId} onValueChange={setDomainId}>
              <SelectTrigger>
                <SelectValue placeholder="Default domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Use default</SelectItem>
                {(domains.data ?? []).map((item) => (
                  <SelectItem key={String(item.id)} value={String(item.id)}>
                    {String(item.domain)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>From name</Label>
            <Input value={fromName} onChange={(event) => setFromName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>From email</Label>
            <Input
              value={fromEmail}
              placeholder="news@news.munchreach.com"
              onChange={(event) => setFromEmail(event.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || !fromEmail.includes("@") || saveMutation.isPending}
            >
              Save draft
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
          <div className="space-y-1">
            <Label>Send a test</Label>
            <Input
              value={testTo}
              placeholder="you@munchreach.com"
              onChange={(event) => setTestTo(event.target.value)}
              className="w-64"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={
              !testTo.includes("@") || !template || providerId === NONE || testMutation.isPending
            }
          >
            <Send className="mr-2 h-4 w-4" /> Send test
          </Button>
        </div>
      </MarketingPanel>

      <MarketingPanel title="Campaigns" description="Sending processes in batches with frequency caps and suppression applied to every recipient.">
        {campaigns.isLoading ? (
          <MarketingLoading label="Loading campaigns" />
        ) : (campaigns.data ?? []).length === 0 ? (
          <MarketingEmpty title="No campaigns yet" />
        ) : (
          <div className="divide-y">
            {(campaigns.data ?? []).map((campaign) => {
              const stats = (campaign.stats ?? {}) as Record<string, number>;
              const id = String(campaign.id);
              return (
                <div key={id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{String(campaign.name)}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(campaign.campaign_type)} · {stats["sent"] ?? 0} sent ·{" "}
                      {stats["failed"] ?? 0} failed · {stats["skipped"] ?? 0} skipped
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{String(campaign.status)}</Badge>
                    <Button
                      size="sm"
                      onClick={() => runMutation.mutate(id)}
                      disabled={runMutation.isPending}
                    >
                      Send batch
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => statusMutation.mutate({ id, status: "paused" })}
                    >
                      Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => statusMutation.mutate({ id, status: "cancelled" })}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </MarketingPanel>
    </div>
  );
}
