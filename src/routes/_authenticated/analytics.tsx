import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, BarChart3, Minus, Mail, Send, MailOpen, MessageSquare, ThumbsUp, ThumbsDown, UserX, TriangleAlert, CircleX, CalendarCheck } from "lucide-react";


import { AppShell } from "@/components/app/AppShell";
import { ActivityFeed } from "@/components/analytics/ActivityFeed";
import { CampaignDetailDialog } from "@/components/analytics/CampaignDetailDialog";
import { ConversionFunnel, type FunnelStepKey } from "@/components/analytics/ConversionFunnel";
import { DeliverabilityPanel } from "@/components/analytics/DeliverabilityPanel";
import { EngagementOverview } from "@/components/analytics/EngagementOverview";
import { FunnelDrilldownDialog } from "@/components/analytics/FunnelDrilldownDialog";
import { ReplyIntelligence } from "@/components/analytics/ReplyIntelligence";
import { SequencePerformance } from "@/components/analytics/SequencePerformance";
import { SubjectLinePerformance } from "@/components/analytics/SubjectLinePerformance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAnalyticsRealtime } from "@/hooks/useAnalyticsRealtime";
import { analyticsKeys, liveQueryOptions } from "@/lib/analytics-query";
import {
  getAnalyticsByAccount,
  getAnalyticsByCampaign,
  getAnalyticsAudience,
  getAnalyticsFilterOptions,
  getAnalyticsOverview,
  getAnalyticsTimeseries,
} from "@/lib/analytics.functions";
import type { AnalyticsFilters } from "@/lib/analytics-filters";
import {
  bounceRate,
  rate,
  formatCount,
  deliveryPresentation,
  formatPct,
  formatOpenRate,
  openRate,
  replyRate,
  unsubRate,
  type AnalyticsCampaignRow,
  type AnalyticsSummary,
} from "@/lib/analytics-model";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Cold Email Analytics — MunchReach" },
      {
        name: "description",
        content:
          "Live deliverability and engagement analytics for every campaign and mailbox in your MunchReach workspace.",
      },
      { property: "og:title", content: "Cold Email Analytics — MunchReach" },
      {
        property: "og:description",
        content: "Track sends, opens, clicks, replies, bounces and unsubscribes in real time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

const RANGES = [
  
  { id: "7d", label: "7d", days: 7 },
  { id: "14d", label: "14d", days: 14 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "custom", label: "Custom", days: 0 },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function AnalyticsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? null;
  useAnalyticsRealtime(workspaceId);

  const [rangeId, setRangeId] = useState<RangeId>("30d");
  const [customFrom, setCustomFrom] = useState(
    startOfDay(new Date(Date.now() - 13 * 86_400_000)).toISOString().slice(0, 10),
  );
  const [customTo, setCustomTo] = useState(new Date().toISOString().slice(0, 10));
  const [campaignDetail, setCampaignDetail] = useState<AnalyticsCampaignRow | null>(null);
  const [funnelStep, setFunnelStep] = useState<FunnelStepKey | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const { from, to, bucket } = useMemo(() => {
    if (rangeId === "custom") {
      const f = startOfDay(new Date(`${customFrom}T00:00:00`));
      const t = new Date(startOfDay(new Date(`${customTo}T00:00:00`)).getTime() + 86_400_000);
      if (!Number.isFinite(+f) || !Number.isFinite(+t) || t <= f) return { from: startOfDay(new Date()), to: new Date(), bucket: "day" as const };
      const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86_400_000));
      return { from: f, to: t, bucket: days <= 2 ? ("hour" as const) : ("day" as const) };
    }
    const days = RANGES.find((r) => r.id === rangeId)?.days ?? 30;
    const t = new Date();
    const f = startOfDay(new Date(t.getTime() - (days - 1) * 86_400_000));
    return { from: f, to: t, bucket: "day" as const };
  }, [rangeId, customFrom, customTo]);

  const campaignId = campaignFilter === "all" ? null : campaignFilter;
  const accountId = accountFilter === "all" ? null : accountFilter;

  const range = {
    workspaceId: workspaceId ?? "",
    from: from.toISOString(),
    to: to.toISOString(),
    campaignId,
    accountId,
  };
  const filters: AnalyticsFilters = {
    workspaceId,
    from: range.from,
    to: range.to,
    campaignId,
    accountId,
  };
  const keyBase = [workspaceId, range.from, range.to] as const;
  const keyFilters = [campaignId, accountId] as const;
  const enabled = !!workspaceId;

  const fetchOverview = useServerFn(getAnalyticsOverview);
  const fetchSeries = useServerFn(getAnalyticsTimeseries);
  const fetchCampaigns = useServerFn(getAnalyticsByCampaign);
  const fetchAccounts = useServerFn(getAnalyticsByAccount);
  const fetchFilterOptions = useServerFn(getAnalyticsFilterOptions);
  const fetchAudience = useServerFn(getAnalyticsAudience);

  const audience = useQuery({
    queryKey: [...analyticsKeys.root, "audience", workspaceId, campaignId] as const,
    queryFn: () => fetchAudience({ data: { workspaceId: workspaceId ?? "", campaignId } }),
    enabled,
    staleTime: 60_000,
  });

  const filterOptions = useQuery({
    queryKey: analyticsKeys.filterOptions(workspaceId),
    queryFn: () => fetchFilterOptions({ data: { workspaceId: workspaceId ?? "" } }),
    enabled,
    staleTime: 60_000,
  });

  const overview = useQuery({
    queryKey: analyticsKeys.overview(...keyBase, ...keyFilters),
    queryFn: () => fetchOverview({ data: range }),
    enabled,
    ...liveQueryOptions(),
  });
  const series = useQuery({
    queryKey: analyticsKeys.series(...keyBase, bucket, ...keyFilters),
    queryFn: () => fetchSeries({ data: { ...range, bucket } }),
    enabled,
    ...liveQueryOptions(),
  });
  const campaigns = useQuery({
    queryKey: analyticsKeys.campaigns(...keyBase, ...keyFilters),
    queryFn: () => fetchCampaigns({ data: range }),
    enabled,
    ...liveQueryOptions(),
  });
  const accounts = useQuery({
    queryKey: analyticsKeys.accounts(...keyBase, ...keyFilters),
    queryFn: () => fetchAccounts({ data: range }),
    enabled,
    ...liveQueryOptions(),
  });

  /** Download the current campaign breakdown as CSV, filters included. */
  function exportReport() {
    const rows = campaigns.data ?? [];
    const header = [
      "Campaign",
      "Status",
      "Sent (accepted by mail server)",
      "Accepted (no receipt or bounce yet)",
      "Confirmed delivered",
      "Opens",
      "Clicks",
      "Replies",
      "Positive replies",
      "Bounced",
      "Unsubscribed",
      "Definitively failed",
      "Held for review (current inventory)",
      "Distinct attempted (current inventory)",
    ];
    const body = rows.map((r) => [
      r.name,
      r.status,
      r.sent,
      r.accepted ?? 0,
      r.delivered,
      r.opens,
      r.clicks,
      r.replies,
      r.positiveReplies,
      r.bounced,
      r.unsubscribed,
      r.failed,
      r.held ?? 0,
      r.attempted ?? 0,
    ]);
    const csv = [header, ...body]
      .map((line) =>
        line.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `munchreach-analytics-${range.from.slice(0, 10)}-to-${range.to.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const current = overview.data?.current;
  const previous = overview.data?.previous;

  const cards = current
    ? [
        {
          label: "Emails Sent", icon: Mail, tone: "bg-primary/10 text-primary",
          value: formatCount(current.sent),
          delta: deltaCount(current.sent, previous?.sent ?? 0),
          sub: `Accepted by mail server · ${formatCount(current.accepted ?? 0)} awaiting receipt`,
        },
        {
          // Confirmed delivered = explicit per-message receipts only; never acceptance.
          label: "Confirmed Delivered", icon: Send, tone: "bg-chart-2/15 text-chart-2",
          value: deliveryPresentation(current).value,
          delta: previous
            ? deltaCount(
                current.delivered,
                previous.delivered,
              )
            : null,
          sub: "Delivery receipts only",
        },
        {
          label: "Open Rate", icon: MailOpen, tone: "bg-chart-1/10 text-chart-1",
          value: formatPct(openRate(current)),
          delta: deltaRate(openRate(current), previous ? openRate(previous) : 0),
          sub: `${formatCount(current.opens)} opens`,
        },
        {
          label: "Reply Rate", icon: MessageSquare, tone: "bg-chart-5/10 text-chart-5",
          value: formatPct(replyRate(current)),
          delta: deltaRate(replyRate(current), previous ? replyRate(previous) : 0),
          sub: `${formatCount(current.replies)} replies`,
        },
        {
          label: "Positive Replies", icon: ThumbsUp, tone: "bg-success/10 text-success",
          value: formatCount(current.positiveReplies),
          delta: deltaCount(current.positiveReplies, previous?.positiveReplies ?? 0),
          sub: `${formatPct(rate(current.positiveReplies, current.replies))} of replies`,
        },
        {
          label: "Negative Replies", icon: ThumbsDown, tone: "bg-destructive/10 text-destructive",
          value: current.negativeReplies == null ? "—" : formatCount(current.negativeReplies), delta: null,
          sub: current.negativeReplies == null ? null : `${formatPct(rate(current.negativeReplies, current.replies))} of replies`,
        },
        {
          label: "Bounce Rate", icon: TriangleAlert, tone: "bg-warning/15 text-warning",
          value: formatPct(bounceRate(current)),
          delta: deltaRate(bounceRate(current), previous ? bounceRate(previous) : 0, true),
          sub: `${formatCount(current.bounced)} bounced`,
        },
        {
          label: "Unsubscribe Rate", icon: UserX, tone: "bg-muted text-muted-foreground",
          value: formatPct(unsubRate(current)),
          delta: deltaRate(unsubRate(current), previous ? unsubRate(previous) : 0, true),
          sub: `${formatCount(current.unsubscribed)} unsubscribed`,
        },
        {
          label: "Held for Review", icon: CircleX, tone: "bg-warning/15 text-warning",
          value: formatCount(current.held ?? 0), delta: null, sub: "Current unresolved messages · not failed",
        },
        {
          label: "Failed Sends", icon: CircleX, tone: "bg-destructive/10 text-destructive",
          // Only failures dated inside the selected window; undated history is noted, never added.
          value: formatCount(current.failed),
          delta: deltaCount(current.failed, previous?.failed ?? 0),
          sub: current.undatedFailed ? `Plus ${formatCount(current.undatedFailed)} older failures without a date` : null,
        },
        {
          label: "Meetings Booked", icon: CalendarCheck, tone: "bg-chart-3/10 text-chart-3",
          value: overview.data?.meetings == null ? "—" : formatCount(overview.data.meetings),
          delta: null,
          sub: null,
        },
      ]
    : [];

  const hasActivity = !!current && (current.sent > 0 || current.delivered > 0 || current.replies > 0);

  return (
    <AppShell title="Analytics">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* campaign / mailbox filters + export */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="h-9 w-[15rem]">
              <SelectValue placeholder="All campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {(filterOptions.data?.campaigns ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="h-9 w-[15rem]">
              <SelectValue placeholder="All mailboxes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All mailboxes</SelectItem>
              {(filterOptions.data?.accounts ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.fromEmail}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {campaignFilter !== "all" || accountFilter !== "all" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCampaignFilter("all");
                setAccountFilter("all");
              }}
            >
              Reset filters
            </Button>
          ) : null}

          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={exportReport}
            disabled={(campaigns.data ?? []).length === 0}
          >
            Export report
          </Button>
        </div>

        <EngagementOverview current={current} points={series.data ?? []} bucket={bucket} loading={overview.isLoading || series.isLoading || !workspaceId} error={overview.isError || series.isError} onRetry={() => { void overview.refetch(); void series.refetch(); }} controls={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-full border border-border/50 p-1">
            {RANGES.map((r) => (
              <Button
                key={r.id}
                size="sm"
                variant={rangeId === r.id ? "secondary" : "ghost"}
                className="h-8 rounded-full px-3"
                onClick={() => setRangeId(r.id)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          {rangeId === "custom" ? (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="h-9 w-[9.5rem]"
                aria-label="Start date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                className="h-9 w-[9.5rem]"
                aria-label="End date"
                min={customFrom}
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        } />



        <SequencePerformance filters={filters} />

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {overview.isLoading || !workspaceId
            ? Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))
            : cards.map((card) => (
                <div key={card.label} className="flex h-36 min-w-0 flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${card.tone}`}>
                      <card.icon className="size-4" />
                    </span>
                    <p className="truncate text-sm font-medium text-muted-foreground">{card.label}</p>
                  </div>
                  <div className="mt-auto flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight tabular-nums">{card.value}</span>
                    <DeltaBadge delta={card.delta} />
                  </div>
                  <p className="mt-1 h-4 truncate text-xs text-muted-foreground">{card.sub ?? ""}</p>
                </div>
              ))}
        </div>

        {overview.isError ? <div role="alert" className="flex items-center justify-between gap-3 text-sm"><p>Metrics could not be loaded.</p><Button variant="outline" onClick={() => void overview.refetch()}>Retry</Button></div> : null}

        <ReplyIntelligence filters={filters} />

        <ConversionFunnel
          data={{
            leads: audience.data ?? null,
            sent: current?.sent ?? 0,
            delivered: current && deliveryPresentation(current).value !== "—" ? current.delivered : null,
            opens: current?.opens ?? 0,
            replies: current?.replies ?? 0,
            positiveReplies: current?.positiveReplies ?? 0,
            meetings: overview.data?.meetings ?? null,
          }}
          onStepClick={workspaceId ? (step) => setFunnelStep(step) : undefined}
        />

        {workspaceId ? (
          <FunnelDrilldownDialog
            step={funnelStep}
            workspaceId={workspaceId}
            from={range.from}
            to={range.to}
            campaignId={campaignId}
            accountId={accountId}
            onOpenChange={(open) => {
              if (!open) setFunnelStep(null);
            }}
          />
        ) : null}

        {/* campaign table */}
        <div className="surface-card p-4">
          <h2 className="text-sm font-semibold">Campaign performance</h2>
          <div className="mt-3 overflow-x-auto">
            {campaigns.isLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (campaigns.data ?? []).length === 0 ? (
              <EmptyState label="No campaigns yet. Create one to see performance here." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Campaign</th>
                    <th className="py-2 pr-3">Sent</th>
                    <th className="py-2 pr-3" title="Accepted sends minus bounced contacts; not confirmed delivery">Accepted − bounced</th>
                    <th className="py-2 pr-3">Open</th>
                    <th className="py-2 pr-3">Reply</th>
                    <th className="py-2 pr-3">Positive replies</th>
                    <th className="py-2 pr-3">Bounce</th>
                    <th className="py-2 pr-3">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {(campaigns.data ?? []).map((row) => (
                    <tr
                      key={row.campaignId}
                      className="cursor-pointer border-t border-border/50 hover:bg-muted/40"
                      onClick={() => setCampaignDetail(row)}
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.status}</div>
                      </td>
                      <td className="py-2 pr-3">{formatCount(row.sent)}</td>
                      <td className="py-2 pr-3">{formatCount(row.delivered)}</td>
                      <td className="py-2 pr-3">{formatOpenRate(row)}</td>
                      <td className="py-2 pr-3">{formatPct(replyRate(row))}</td>
                      <td className="py-2 pr-3">{formatCount(row.positiveReplies)}</td>
                      <td className="py-2 pr-3">{formatPct(bounceRate(row))}</td>
                      <td className="py-2 pr-3">{formatCount(row.failed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* mailbox table */}
        <div className="surface-card p-4">
          <h2 className="text-sm font-semibold">Email account performance</h2>
          <div className="mt-3 overflow-x-auto">
            {accounts.isLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (accounts.data ?? []).length === 0 ? (
              <EmptyState label="Connect a mailbox to see per-account deliverability." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Mailbox</th>
                    <th className="py-2 pr-3">Sent</th>
                    <th className="py-2 pr-3" title="Accepted sends minus bounced contacts; not confirmed delivery">Accepted − bounced</th>
                    <th className="py-2 pr-3">Open</th>
                    <th className="py-2 pr-3">Reply</th>
                    <th className="py-2 pr-3">Bounce</th>
                    <th className="py-2 pr-3">Unsub</th>
                  </tr>
                </thead>
                <tbody>
                  {(accounts.data ?? []).map((row) => (
                    <tr key={row.accountId} className="border-t border-border/50">
                      <td className="py-2 pr-3 font-medium">{row.fromEmail}</td>
                      <td className="py-2 pr-3">{formatCount(row.sent)}</td>
                      <td className="py-2 pr-3">{formatCount(row.delivered)}</td>
                      <td className="py-2 pr-3">{formatPct(openRate(row))}</td>
                      <td className="py-2 pr-3">{formatPct(replyRate(row))}</td>
                      <td className="py-2 pr-3">{formatPct(bounceRate(row))}</td>
                      <td className="py-2 pr-3">{formatPct(unsubRate(row))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <SubjectLinePerformance filters={filters} />

        <DeliverabilityPanel filters={filters} />

        <ActivityFeed filters={filters} />


        {!overview.isLoading && !hasActivity ? (
          <p className="text-center text-xs text-muted-foreground">
            No campaign activity recorded for these filters.
          </p>
        ) : null}
      </div>

      <CampaignDetailDialog
        row={campaignDetail}
        onOpenChange={() => setCampaignDetail(null)}
        workspaceId={workspaceId}
        from={range.from}
        to={range.to}
        accountId={accountId}
      />
    </AppShell>
  );
}

type Delta = { value: number; suffix: string; inverse?: boolean } | null;

function deltaCount(current: number, previous: number): Delta {
  if (!previous) return null;
  return { value: ((current - previous) / previous) * 100, suffix: "%" };
}

function deltaRate(current: number, previous: number, inverse = false): Delta {
  if (!previous) return null;
  return { value: current - previous, suffix: "pt", inverse };
}

function DeltaBadge({ delta }: { delta: Delta }) {
  if (!delta || !Number.isFinite(delta.value)) return null;
  const positive = delta.inverse ? delta.value < 0 : delta.value > 0;
  const Icon = delta.value === 0 ? Minus : delta.value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        delta.value === 0 ? "text-muted-foreground" : positive ? "text-success" : "text-destructive"
      }`}
    >
      <Icon className="size-3" />
      {Math.abs(delta.value).toFixed(1)}
      {delta.suffix}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <BarChart3 className="size-5" />
      {label}
    </div>
  );
}
