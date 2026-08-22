import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AdminPageHeader,
  EmptyState,
  FilterBar,
  FilterSelect,
  LoadingRows,
  Pill,
  StatCard,
  num,
  pct,
} from "@/components/app/admin/OutreachUI";
import { adminAnalytics, adminAnalyticsFilters } from "@/lib/admin-phase5.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Platform Analytics — MunchReach Admin" },
      {
        name: "description",
        content:
          "Real email, campaign, customer, revenue and system-health analytics across every MunchReach workspace, computed from source tables.",
      },
      { property: "og:title", content: "Platform Analytics — MunchReach Admin" },
      {
        property: "og:description",
        content: "Cross-workspace analytics with deduplicated engagement metrics and no estimates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAnalyticsPage,
});

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
  }).format((cents ?? 0) / 100);
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function AdminAnalyticsPage() {
  const loadAnalytics = useServerFn(adminAnalytics);
  const loadOptions = useServerFn(adminAnalyticsFilters);

  const [range, setRange] = useState("30");
  const [customFrom, setCustomFrom] = useState(isoDay(new Date(Date.now() - 30 * 864e5)));
  const [customTo, setCustomTo] = useState(isoDay(new Date()));
  const [workspace, setWorkspace] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [account, setAccount] = useState("all");
  const [plan, setPlan] = useState("all");

  const options = useQuery({
    queryKey: ["admin", "analytics", "filters"],
    queryFn: () => loadOptions(),
  });

  const { from, to } = useMemo(() => {
    if (range === "custom") {
      return {
        from: new Date(`${customFrom}T00:00:00.000Z`).toISOString(),
        to: new Date(`${customTo}T23:59:59.999Z`).toISOString(),
      };
    }
    const days = Number(range);
    return {
      from: new Date(Date.now() - days * 864e5).toISOString(),
      to: new Date().toISOString(),
    };
  }, [range, customFrom, customTo]);

  const filters = {
    from,
    to,
    workspaceId: workspace === "all" ? null : workspace,
    campaignId: campaign === "all" ? null : campaign,
    sendingAccountId: account === "all" ? null : account,
    planId: plan === "all" ? null : plan,
  };

  const q = useQuery({
    queryKey: ["admin", "analytics", filters],
    queryFn: () => loadAnalytics({ data: filters }),
  });

  const scopedCampaigns = (options.data?.campaigns ?? []).filter(
    (c: any) => workspace === "all" || c.workspaceId === workspace,
  );
  const scopedAccounts = (options.data?.sendingAccounts ?? []).filter(
    (a: any) => workspace === "all" || a.workspaceId === workspace,
  );

  const d = q.data;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Platform analytics"
        description="Every number here is computed from the same tables the customer dashboards read. Opens and clicks are deduplicated per message, so totals never inflate."
        actions={
          <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
            Refresh
          </Button>
        }
      />

      <FilterBar>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {range === "custom" ? (
          <>
            <Input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-40"
            />
          </>
        ) : null}
        <FilterSelect
          value={workspace}
          onChange={(v) => {
            setWorkspace(v);
            setCampaign("all");
            setAccount("all");
          }}
          allLabel="All workspaces"
          options={(options.data?.workspaces ?? []).map((w: any) => ({
            value: w.id,
            label: w.name,
          }))}
        />
        <FilterSelect
          value={campaign}
          onChange={setCampaign}
          allLabel="All campaigns"
          width="w-56"
          options={scopedCampaigns.map((c: any) => ({ value: c.id, label: c.name }))}
        />
        <FilterSelect
          value={account}
          onChange={setAccount}
          allLabel="All sending accounts"
          width="w-56"
          options={scopedAccounts.map((a: any) => ({ value: a.id, label: a.email }))}
        />
        <FilterSelect
          value={plan}
          onChange={setPlan}
          allLabel="All plans"
          options={(options.data?.plans ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
        />
      </FilterBar>

      {q.isLoading ? (
        <LoadingRows rows={8} />
      ) : q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : !d ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {d.truncated ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              This range exceeds the safe query window, so totals are capped. Narrow the date range
              or filter by workspace for exact figures.
            </p>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Email performance</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Sent" value={num(d.email.sent)} />
              <StatCard label="Delivered" value={num(d.email.delivered)} />
              <StatCard
                label="Unique opens"
                value={num(d.email.opens)}
                hint={`${pct(d.email.opens, d.email.sent)} of sent · ${num(d.email.openEvents)} events`}
              />
              <StatCard
                label="Unique clicks"
                value={num(d.email.clicks)}
                hint={`${pct(d.email.clicks, d.email.sent)} of sent · ${num(d.email.clickEvents)} events`}
              />
              <StatCard
                label="Replies"
                value={num(d.email.replies)}
                hint={`${pct(d.email.replies, d.email.sent)} reply rate`}
              />
              <StatCard
                label="Bounces"
                value={num(d.email.bounces)}
                hint={pct(d.email.bounces, d.email.sent)}
              />
              <StatCard label="Unsubscribes" value={num(d.email.unsubscribes)} />
              <StatCard label="Complaints" value={num(d.email.complaints)} />
              <StatCard label="Failed sends" value={num(d.email.failedSends)} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Campaigns</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Active" value={num(d.campaigns.active)} />
              <StatCard label="Paused" value={num(d.campaigns.paused)} />
              <StatCard label="Completed" value={num(d.campaigns.completed)} />
              <StatCard label="Draft" value={num(d.campaigns.draft)} />
              <StatCard label="Created in range" value={num(d.campaigns.createdInRange)} />
            </div>
            <div className="rounded-xl border bg-card">
              {d.topCampaigns.length === 0 ? (
                <EmptyState message="No sends in this range" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Top campaigns</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Replies</TableHead>
                      <TableHead className="text-right">Reply rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.topCampaigns.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Pill>{c.status}</Pill>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{num(c.sent)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(c.replies)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(c.replies, c.sent)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Customers</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Workspaces" value={num(d.customers.totalWorkspaces)} />
              <StatCard label="New workspaces" value={num(d.customers.newWorkspaces)} />
              <StatCard
                label="Sending workspaces"
                value={num(d.customers.activeWorkspaces)}
                hint="Sent at least one email in range"
              />
              <StatCard label="Users" value={num(d.customers.totalUsers)} />
              <StatCard label="New users" value={num(d.customers.newUsers)} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Revenue</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <StatCard
                label="Net revenue"
                value={money(d.revenue.revenueCents, d.revenue.currency)}
                hint={`Collected ${money(d.revenue.collectedCents, d.revenue.currency)} · recognised ${money(
                  d.revenue.recognizedCents,
                  d.revenue.currency,
                )} · refunds ${money(d.revenue.refundCents, d.revenue.currency)}`}
              />
              <StatCard
                label="MRR"
                value={money(d.revenue.mrrCents, d.revenue.currency)}
                hint={`ARR ${money(d.revenue.arrCents, d.revenue.currency)}`}
              />
              <StatCard label="Active subscriptions" value={num(d.revenue.activeSubscriptions)} />
              <StatCard label="New subscriptions" value={num(d.revenue.newSubscriptions)} />
              <StatCard label="Cancellations" value={num(d.revenue.cancellations)} />
              <StatCard label="Transactions" value={num(d.revenue.transactions)} />
              <StatCard label="Failed payments" value={num(d.revenue.failedPayments)} />
              <StatCard label="Past due" value={num(d.revenue.pastDue)} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">System health</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Failed sends" value={num(d.system.failedSends)} />
              <StatCard label="Unprocessed webhooks" value={num(d.system.failedWebhooks)} />
              <StatCard label="Automation failures" value={num(d.system.automationFailures)} />
              <StatCard label="Accounts with errors" value={num(d.system.providerErrors)} />
              <StatCard label="Inbound failures" value={num(d.system.inboundFailures)} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
