import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import {
  MarketingEmpty,
  MarketingLoading,
  MarketingPanel,
  MarketingStat,
} from "@/components/admin/marketing/MarketingUI";
import { marketingAnalytics } from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/marketing/analytics")({
  head: () => ({
    meta: [
      { title: "Marketing Analytics — MunchReach Admin" },
      {
        name: "description",
        content:
          "Marketing performance for MunchReach: sends, opens, clicks, bounces, unsubscribes and subscriber growth over time.",
      },
      { property: "og:title", content: "Marketing Analytics — MunchReach Admin" },
      {
        property: "og:description",
        content: "Deliverability and engagement analytics for MunchReach marketing email.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

const RANGES = [7, 30, 90];

function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const fetchAnalytics = useServerFn(marketingAnalytics);

  const query = useQuery({
    queryKey: ["admin", "marketing", "analytics", days],
    queryFn: () => fetchAnalytics({ data: { days } }),
  });

  if (query.isLoading) return <MarketingLoading label="Loading analytics" />;
  const data = query.data!;
  const totals = data.totals;
  const sent = totals["marketing_email_sent"] ?? 0;
  const rate = (value: number) => (sent ? `${Math.round((value / sent) * 1000) / 10}%` : "—");

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {RANGES.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={days === value ? "default" : "outline"}
            onClick={() => setDays(value)}
          >
            {value}d
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MarketingStat label="Sent" value={sent} />
        <MarketingStat
          label="Opens"
          value={totals["marketing_email_opened"] ?? 0}
          hint={rate(totals["marketing_email_opened"] ?? 0)}
          tone="positive"
        />
        <MarketingStat
          label="Replies"
          value={totals["marketing_email_replied"] ?? 0}
          hint={rate(totals["marketing_email_replied"] ?? 0)}
          tone="positive"
        />
        <MarketingStat
          label="Machine opens"
          value={totals["marketing_email_opened_machine"] ?? 0}
          hint="Apple privacy prefetch, not counted as opens"
        />
        <MarketingStat
          label="Clicks"
          value={totals["marketing_email_clicked"] ?? 0}
          hint={rate(totals["marketing_email_clicked"] ?? 0)}
          tone="positive"
        />
        <MarketingStat
          label="Bounces"
          value={totals["marketing_email_bounced"] ?? 0}
          hint={rate(totals["marketing_email_bounced"] ?? 0)}
          tone={(totals["marketing_email_bounced"] ?? 0) > 0 ? "warning" : "default"}
        />
        <MarketingStat
          label="Unsubscribes"
          value={totals["marketing_email_unsubscribed"] ?? 0}
          tone="warning"
        />
        <MarketingStat
          label="Complaints"
          value={totals["marketing_email_complained"] ?? 0}
          tone="danger"
        />
        <MarketingStat label="Suppressed sends" value={totals["marketing_email_suppressed"] ?? 0} />
        <MarketingStat label="New subscribers" value={data.growth} />
      </div>

      <PerformanceTable
        title="By template"
        description="Which templates earn opens and replies. Only emails sent since tracking was added are attributed."
        rows={data.byTemplate}
      />
      <PerformanceTable
        title="By subject line"
        description="Replies come from mailboxes you've connected and set as the reply-to address."
        rows={data.bySubject}
      />

      <MarketingPanel title="Daily activity" description={`Marketing email events over the last ${data.days} days.`}>
        {data.timeline.length === 0 ? (
          <MarketingEmpty title="No marketing activity in this window" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Day</th>
                  <th className="py-2">Sent</th>
                  <th className="py-2">Opened</th>
                  <th className="py-2">Clicked</th>
                  <th className="py-2">Bounced</th>
                  <th className="py-2">Unsub</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.timeline.map((row) => (
                  <tr key={row.day}>
                    <td className="py-2">{row.day}</td>
                    <td className="py-2 tabular-nums">{row.counts["marketing_email_sent"] ?? 0}</td>
                    <td className="py-2 tabular-nums">{row.counts["marketing_email_opened"] ?? 0}</td>
                    <td className="py-2 tabular-nums">{row.counts["marketing_email_clicked"] ?? 0}</td>
                    <td className="py-2 tabular-nums">{row.counts["marketing_email_bounced"] ?? 0}</td>
                    <td className="py-2 tabular-nums">
                      {row.counts["marketing_email_unsubscribed"] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MarketingPanel>

      <MarketingPanel title="Campaign performance">
        {data.campaigns.length === 0 ? (
          <MarketingEmpty title="No campaigns yet" />
        ) : (
          <div className="divide-y">
            {data.campaigns.map((campaign) => {
              const stats = (campaign.stats ?? {}) as Record<string, number>;
              return (
                <div
                  key={String(campaign.id)}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <p className="text-sm font-medium">{String(campaign.name)}</p>
                  <p className="text-xs text-muted-foreground">
                    {stats["sent"] ?? 0} sent · {stats["opened"] ?? 0} opened ·{" "}
                    {stats["clicked"] ?? 0} clicked · {stats["unsubscribed"] ?? 0} unsub
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </MarketingPanel>
    </div>
  );
}

type PerfRow = { key: string; sent: number; opened: number; replied: number };

function PerformanceTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: PerfRow[];
}) {
  const pct = (value: number, sent: number) =>
    sent ? `${Math.round((value / sent) * 1000) / 10}%` : "—";
  return (
    <MarketingPanel title={title} description={description}>
      {rows.length === 0 ? (
        <MarketingEmpty title="No tracked sends in this window" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">{title.replace("By ", "")}</th>
                <th className="py-2">Sent</th>
                <th className="py-2">Opens</th>
                <th className="py-2">Open rate</th>
                <th className="py-2">Replies</th>
                <th className="py-2">Reply rate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="max-w-xs truncate py-2 pr-4" title={row.key}>{row.key}</td>
                  <td className="py-2 tabular-nums">{row.sent}</td>
                  <td className="py-2 tabular-nums">{row.opened}</td>
                  <td className="py-2 tabular-nums">{pct(row.opened, row.sent)}</td>
                  <td className="py-2 tabular-nums">{row.replied}</td>
                  <td className="py-2 tabular-nums">{pct(row.replied, row.sent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </MarketingPanel>
  );
}
