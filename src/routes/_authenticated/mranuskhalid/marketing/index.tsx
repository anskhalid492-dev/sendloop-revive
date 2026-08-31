import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MarketingEmpty,
  MarketingLoading,
  MarketingPanel,
  MarketingStat,
} from "@/components/admin/marketing/MarketingUI";
import { marketingOverview } from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/marketing/")({
  head: () => ({
    meta: [
      { title: "Marketing Engine — MunchReach Admin" },
      {
        name: "description",
        content:
          "Internal marketing command centre: subscribers, campaigns, automations and deliverability for MunchReach product announcements.",
      },
      { property: "og:title", content: "Marketing Engine — MunchReach Admin" },
      {
        property: "og:description",
        content: "Admin-only marketing overview for MunchReach customer engagement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketingOverviewPage,
});

function MarketingOverviewPage() {
  const fetchOverview = useServerFn(marketingOverview);
  const query = useQuery({
    queryKey: ["admin", "marketing", "overview"],
    queryFn: () => fetchOverview(),
  });

  if (query.isLoading) return <MarketingLoading label="Loading marketing overview" />;
  if (query.error) {
    return <MarketingEmpty title="Unable to load marketing data" hint={String(query.error)} />;
  }
  const data = query.data!;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MarketingStat
          label="Active subscribers"
          value={data.subscribers.active}
          hint={`${data.subscribers.total} total profiles`}
        />
        <MarketingStat
          label="Sent (30d)"
          value={data.last30.sent}
          hint={`${data.last30.opened} opens · ${data.last30.clicked} clicks`}
        />
        <MarketingStat
          label="Open rate (30d)"
          value={`${data.last30.openRate}%`}
          tone="positive"
          hint={`Click rate ${data.last30.clickRate}%`}
        />
        <MarketingStat
          label="Suppressed"
          value={data.suppressionCount}
          tone={data.suppressionCount > 0 ? "warning" : "default"}
          hint={`${data.last30.bounced} bounces · ${data.last30.unsubscribed} unsubs (30d)`}
        />
      </div>

      <MarketingPanel
        title="Recent campaigns"
        description="Marketing campaigns are stored and sent completely separately from customer cold email campaigns."
        actions={
          <Button asChild size="sm">
            <Link to="/mranuskhalid/marketing/campaigns">Manage campaigns</Link>
          </Button>
        }
      >
        {data.campaigns.length === 0 ? (
          <MarketingEmpty
            title="No marketing campaigns yet"
            hint="Create one from a built-in template to announce a product update."
          />
        ) : (
          <div className="divide-y">
            {data.campaigns.map((campaign) => {
              const stats = (campaign.stats ?? {}) as Record<string, number>;
              return (
                <div
                  key={String(campaign.id)}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{String(campaign.name)}</p>
                    <p className="text-xs text-muted-foreground">
                      {stats["sent"] ?? 0} sent · {stats["opened"] ?? 0} opened ·{" "}
                      {stats["clicked"] ?? 0} clicked
                    </p>
                  </div>
                  <Badge variant="outline">{String(campaign.status)}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </MarketingPanel>

      <MarketingPanel
        title="Automations"
        description="Lifecycle journeys triggered by real product events."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/mranuskhalid/marketing/automations">Manage automations</Link>
          </Button>
        }
      >
        {data.automations.length === 0 ? (
          <MarketingEmpty
            title="No automations configured"
            hint="Start from a blueprint such as Welcome, Trial nurture or Win-back."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.automations.map((automation) => (
              <div
                key={String(automation.id)}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{String(automation.name)}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(automation.trigger_event)}
                  </p>
                </div>
                <Badge variant={automation.status === "active" ? "default" : "outline"}>
                  {String(automation.status)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </MarketingPanel>
    </div>
  );
}
