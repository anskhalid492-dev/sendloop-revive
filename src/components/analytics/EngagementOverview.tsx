/**
 * Instantly-style engagement overview: a compact stat strip (contacted /
 * opened / replied / clicked with rates) above a stacked area chart of daily
 * activity. Every number comes from the same real analytics aggregation the
 * Analytics page uses — no client-side estimates.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Handshake, Mail, MailOpen, UserX } from "lucide-react";
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

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCount,
  formatPct,
  openRate,
  replyRate,
  unsubRate,
} from "@/lib/analytics-model";
import {
  getAnalyticsOverview,
  getAnalyticsTimeseries,
} from "@/lib/analytics.functions";

const RANGES = [
  { id: 7, label: "7d" },
  { id: 14, label: "14d" },
  { id: 30, label: "30d" },
  { id: 90, label: "90d" },
] as const;

const SERIES = [
  { key: "sent", label: "Sent", color: "hsl(var(--primary))" },
  { key: "opens", label: "Opens", color: "hsl(var(--chart-4, 43 74% 49%))" },
  { key: "clicks", label: "Clicks", color: "hsl(var(--chart-3, 197 37% 44%))" },
  { key: "replies", label: "Replies", color: "hsl(var(--chart-2, 173 58% 39%))" },
] as const;

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function EngagementOverview({ workspaceId }: { workspaceId: string | null }) {
  const [days, setDays] = useState<number>(30);

  const range = useMemo(() => {
    const to = new Date();
    const from = startOfDay(new Date(to.getTime() - (days - 1) * 86_400_000));
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  const fetchOverview = useServerFn(getAnalyticsOverview);
  const fetchSeries = useServerFn(getAnalyticsTimeseries);
  const enabled = !!workspaceId;
  const input = { workspaceId: workspaceId ?? "", ...range };

  const overview = useQuery({
    queryKey: ["analytics", "overview", workspaceId, range.from, range.to],
    queryFn: () => fetchOverview({ data: input }),
    enabled,
  });
  const series = useQuery({
    queryKey: ["analytics", "series", workspaceId, range.from, range.to, "day"],
    queryFn: () => fetchSeries({ data: { ...input, bucket: "day" as const } }),
    enabled,
  });

  const current = overview.data?.current ?? null;

  const stats = [
    {
      label: "Contacted",
      icon: Mail,
      value: formatCount(current?.sent ?? 0),
      rate: null as string | null,
    },
    {
      label: "Opened",
      icon: MailOpen,
      value: formatCount(current?.opens ?? 0),
      rate: current ? formatPct(openRate(current)) : null,
    },
    {
      label: "Replied",
      icon: Handshake,
      value: formatCount(current?.replies ?? 0),
      rate: current ? formatPct(replyRate(current)) : null,
    },
    {
      label: "Clicked",
      icon: MousePointerClick,
      value: formatCount(current?.clicks ?? 0),
      rate: current ? formatPct(clickRate(current)) : null,
    },
  ];

  const chartData = (series.data ?? []).map((p) => ({
    ...p,
    label: new Date(p.bucket).toLocaleDateString([], { day: "2-digit", month: "short" }),
  }));

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3">
        <h3 className="text-sm font-semibold">Engagement overview</h3>
        <div className="flex gap-1 rounded-lg border border-border/60 bg-background/60 p-0.5">
          {RANGES.map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant={days === r.id ? "secondary" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setDays(r.id)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-border/60 border-b border-border/60 sm:grid-cols-4 sm:divide-x">
        {stats.map((s) => (
          <div key={s.label} className="px-5 py-4 text-center">
            <s.icon className="mx-auto size-4 text-muted-foreground" />
            {overview.isLoading ? (
              <Skeleton className="mx-auto mt-3 h-6 w-16" />
            ) : (
              <div className="mt-2 flex items-baseline justify-center gap-1.5">
                <span className="text-2xl font-semibold text-primary">{s.value}</span>
                {s.rate ? (
                  <>
                    <span className="text-muted-foreground/50">|</span>
                    <span className="text-sm font-medium text-muted-foreground">{s.rate}</span>
                  </>
                ) : null}
              </div>
            )}
            <p className="mt-1 text-xs font-medium text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="h-[16rem] px-3 py-4">
        {series.isLoading ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No activity in this range yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: -18, right: 8, top: 8 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`eo-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} minTickGap={16} />
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
              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stackId="1"
                  stroke={s.color}
                  fill={`url(#eo-${s.key})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
