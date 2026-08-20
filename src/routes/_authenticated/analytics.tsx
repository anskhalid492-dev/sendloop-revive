import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, BarChart3, Minus } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app/AppShell";
import { CampaignDetailDialog } from "@/components/analytics/CampaignDetailDialog";
import { ConversionFunnel, type FunnelStepKey } from "@/components/analytics/ConversionFunnel";
import { FunnelDrilldownDialog } from "@/components/analytics/FunnelDrilldownDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAnalyticsRealtime } from "@/hooks/useAnalyticsRealtime";
import {
  getAnalyticsByAccount,
  getAnalyticsByCampaign,
  getAnalyticsOverview,
  getAnalyticsTimeseries,
} from "@/lib/analytics.functions";
import {
  bounceRate,
  clickRate,
  formatCount,
  formatPct,
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
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "custom", label: "Custom", days: 0 },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

const SERIES = [
  { key: "sent", label: "Sent", color: "hsl(var(--primary))" },
  { key: "delivered", label: "Delivered", color: "hsl(var(--chart-2, 173 58% 39%))" },
  { key: "opens", label: "Opens", color: "hsl(var(--chart-3, 197 37% 44%))" },
  { key: "clicks", label: "Clicks", color: "hsl(var(--chart-4, 43 74% 49%))" },
  { key: "replies", label: "Replies", color: "hsl(var(--chart-5, 27 87% 55%))" },
  { key: "bounced", label: "Bounced", color: "hsl(var(--destructive))" },
] as const;

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
  const [visible, setVisible] = useState<string[]>(["sent", "opens", "replies"]);
  const [campaignDetail, setCampaignDetail] = useState<AnalyticsCampaignRow | null>(null);
  const [funnelStep, setFunnelStep] = useState<FunnelStepKey | null>(null);

  const { from, to, bucket } = useMemo(() => {
    if (rangeId === "custom") {
      const f = startOfDay(new Date(customFrom));
      const t = new Date(startOfDay(new Date(customTo)).getTime() + 86_400_000);
      const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86_400_000));
      return { from: f, to: t, bucket: days <= 2 ? ("hour" as const) : ("day" as const) };
    }
    const days = RANGES.find((r) => r.id === rangeId)?.days ?? 30;
    const t = new Date();
    const f = days === 1 ? startOfDay(t) : startOfDay(new Date(t.getTime() - (days - 1) * 86_400_000));
    return { from: f, to: t, bucket: days === 1 ? ("hour" as const) : ("day" as const) };
  }, [rangeId, customFrom, customTo]);

  const range = {
    workspaceId: workspaceId ?? "",
    from: from.toISOString(),
    to: to.toISOString(),
  };
  const keyBase = [workspaceId, range.from, range.to] as const;
  const enabled = !!workspaceId;

  const fetchOverview = useServerFn(getAnalyticsOverview);
  const fetchSeries = useServerFn(getAnalyticsTimeseries);
  const fetchCampaigns = useServerFn(getAnalyticsByCampaign);
  const fetchAccounts = useServerFn(getAnalyticsByAccount);

  const overview = useQuery({
    queryKey: ["analytics", "overview", ...keyBase],
    queryFn: () => fetchOverview({ data: range }),
    enabled,
  });
  const series = useQuery({
    queryKey: ["analytics", "series", ...keyBase, bucket],
    queryFn: () => fetchSeries({ data: { ...range, bucket } }),
    enabled,
  });
  const campaigns = useQuery({
    queryKey: ["analytics", "campaigns", ...keyBase],
    queryFn: () => fetchCampaigns({ data: range }),
    enabled,
  });
  const accounts = useQuery({
    queryKey: ["analytics", "accounts", ...keyBase],
    queryFn: () => fetchAccounts({ data: range }),
    enabled,
  });

  const current = overview.data?.current;
  const previous = overview.data?.previous;

  const cards = current
    ? [
        {
          label: "Emails sent",
          value: formatCount(current.sent),
          delta: deltaCount(current.sent, previous?.sent ?? 0),
          sub: `${formatCount(current.delivered)} delivered`,
        },
        {
          label: "Open rate",
          value: formatPct(openRate(current)),
          delta: deltaRate(openRate(current), previous ? openRate(previous) : 0),
          sub: `${formatCount(current.opens)} unique opens`,
        },
        {
          label: "Reply rate",
          value: formatPct(replyRate(current)),
          delta: deltaRate(replyRate(current), previous ? replyRate(previous) : 0),
          sub: `${formatCount(current.replies)} replies`,
        },
        {
          label: "Click rate",
          value: formatPct(clickRate(current)),
          delta: deltaRate(clickRate(current), previous ? clickRate(previous) : 0),
          sub: `${formatCount(current.clicks)} unique clicks`,
        },
        {
          label: "Bounce rate",
          value: formatPct(bounceRate(current)),
          delta: deltaRate(bounceRate(current), previous ? bounceRate(previous) : 0, true),
          sub: `${formatCount(current.bounced)} bounced`,
        },
        {
          label: "Unsubscribe rate",
          value: formatPct(unsubRate(current)),
          delta: deltaRate(unsubRate(current), previous ? unsubRate(previous) : 0, true),
          sub: `${formatCount(current.unsubscribed)} unsubscribed`,
        },
      ]
    : [];

  const chartData = (series.data ?? []).map((p) => ({
    ...p,
    label:
      bucket === "hour"
        ? new Date(p.bucket).toLocaleTimeString([], { hour: "2-digit" })
        : new Date(p.bucket).toLocaleDateString([], { month: "short", day: "numeric" }),
  }));

  const hasActivity = !!current && (current.sent > 0 || current.delivered > 0 || current.replies > 0);

  return (
    <AppShell title="Analytics">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* range filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
            {RANGES.map((r) => (
              <Button
                key={r.id}
                size="sm"
                variant={rangeId === r.id ? "default" : "ghost"}
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
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                className="h-9 w-[9.5rem]"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          ) : null}
          <Badge variant="secondary" className="ml-auto">
            Live
          </Badge>
        </div>

        {/* KPI cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overview.isLoading || !current
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[6.5rem] rounded-xl" />
              ))
            : cards.map((card) => (
                <div key={card.label} className="surface-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold">{card.value}</span>
                    <DeltaBadge delta={card.delta} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
                </div>
              ))}
        </div>

        {/* time series */}
        <div className="surface-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Performance over time</h2>
            <div className="flex flex-wrap gap-1">
              {SERIES.map((s) => (
                <Button
                  key={s.key}
                  size="sm"
                  variant={visible.includes(s.key) ? "secondary" : "ghost"}
                  onClick={() =>
                    setVisible((prev) =>
                      prev.includes(s.key) ? prev.filter((k) => k !== s.key) : [...prev, s.key],
                    )
                  }
                >
                  <span
                    className="mr-2 inline-block size-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-4 h-[18rem]">
            {series.isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : chartData.length === 0 ? (
              <EmptyState label="No activity in this range yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs>
                    {SERIES.map((s) => (
                      <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                  <ChartTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {SERIES.filter((s) => visible.includes(s.key)).map((s) => (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={s.color}
                      fill={`url(#g-${s.key})`}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <ConversionFunnel
          data={{
            sent: current?.sent ?? 0,
            delivered: current?.delivered ?? 0,
            opens: current?.opens ?? 0,
            replies: current?.replies ?? 0,
          }}
          onStepClick={workspaceId ? (step) => setFunnelStep(step) : undefined}
        />

        {workspaceId ? (
          <FunnelDrilldownDialog
            step={funnelStep}
            workspaceId={workspaceId}
            from={range.from}
            to={range.to}
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
                    <th className="py-2 pr-3">Delivered</th>
                    <th className="py-2 pr-3">Open</th>
                    <th className="py-2 pr-3">Click</th>
                    <th className="py-2 pr-3">Reply</th>
                    <th className="py-2 pr-3">Bounce</th>
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
                      <td className="py-2 pr-3">{formatPct(openRate(row))}</td>
                      <td className="py-2 pr-3">{formatPct(clickRate(row))}</td>
                      <td className="py-2 pr-3">{formatPct(replyRate(row))}</td>
                      <td className="py-2 pr-3">{formatPct(bounceRate(row))}</td>
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
                    <th className="py-2 pr-3">Delivered</th>
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

        {!overview.isLoading && !hasActivity ? (
          <p className="text-center text-xs text-muted-foreground">
            Metrics appear as soon as your campaigns start sending and delivery is reported
            events.
          </p>
        ) : null}
      </div>

      <CampaignDetailDialog
        row={campaignDetail}
        onOpenChange={() => setCampaignDetail(null)}
        workspaceId={workspaceId}
        from={range.from}
        to={range.to}
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
  if (!delta || !Number.isFinite(delta.value)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" /> no prior data
      </span>
    );
  }
  const positive = delta.inverse ? delta.value < 0 : delta.value > 0;
  const Icon = delta.value === 0 ? Minus : delta.value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        delta.value === 0 ? "text-muted-foreground" : positive ? "text-emerald-500" : "text-destructive"
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
