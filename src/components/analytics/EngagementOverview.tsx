import { useId, useState } from "react";
import { Handshake, Mail, MailOpen, UserX } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount, formatPct, openRate, replyRate, unsubRate, type AnalyticsSummary, type AnalyticsTimeseriesPoint } from "@/lib/analytics-model";
import { ENGAGEMENT_SERIES } from "@/lib/analytics-overview";

type Props = {
  current?: AnalyticsSummary | undefined;
  points: AnalyticsTimeseriesPoint[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  controls: React.ReactNode;
  bucket: "day" | "hour";
};

export function EngagementOverview({ current, points, loading, error, onRetry, controls, bucket }: Props) {
  const id = useId().replace(/:/g, "");
  const [visible, setVisible] = useState<string[]>(ENGAGEMENT_SERIES.map(s => s.key));
  const stats = [
    { label: "Contacted", icon: Mail, value: formatCount(current?.contacted ?? 0), sub: "Unique campaign contacts" },
    { label: "Opened", icon: MailOpen, value: formatCount(current?.opens ?? 0), sub: current ? `${formatPct(openRate(current))} · unique contacts` : "Unique contacts" },
    { label: "Replied", icon: Handshake, value: formatCount(current?.replies ?? 0), sub: current ? `${formatPct(replyRate(current))} · unique contacts` : "Unique contacts" },
    { label: "Unsubscribe Rate", icon: UserX, value: current ? formatPct(unsubRate(current)) : "—", sub: `${formatCount(current?.unsubscribed ?? 0)} opted out` },
  ];
  const active = points.some(p => p.sent || p.opens || p.clicks || p.replies);
  const data = points.map(p => ({ ...p, label: new Date(p.bucket).toLocaleString([], bucket === "hour" ? { hour: "numeric" } : { month: "short", day: "numeric" }) }));
  return (
    <section aria-label="Engagement Overview" className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-5">
        <h2 className="text-lg font-semibold">Engagement Overview</h2>
        {controls}
      </div>
      {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm"><p>Engagement data could not be loaded.</p><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button></div> : <>
        <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
          {stats.map(s => <div key={s.label} className="min-w-0 px-5 py-5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><s.icon className="size-4 shrink-0" />{s.label}</div>
            {loading ? <Skeleton className="my-3 h-8 w-20" /> : <p className="mt-3 text-3xl font-semibold tabular-nums">{s.value}</p>}
            <p className="mt-2 text-xs text-muted-foreground">{s.sub}</p>
          </div>)}
        </div>
        <div className="px-3 pt-6 sm:px-5">
          <div className="h-[20rem] sm:h-[23rem]">
            {loading ? <Skeleton className="h-full w-full rounded-lg" /> : !active ? <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><MailOpen className="size-6" /><p>No engagement recorded in this range.</p></div> :
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ left: -12, right: 12, top: 8, bottom: 8 }}>
                  <defs>{ENGAGEMENT_SERIES.map(s => <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={0.18} /><stop offset="100%" stopColor={s.color} stopOpacity={0.01} /></linearGradient>)}</defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} minTickGap={28} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={({ active: hover, payload }) => {
                    const point = payload?.[0]?.payload as AnalyticsTimeseriesPoint | undefined;
                    if (!hover || !point) return null;
                    return <div className="min-w-44 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-sm"><p className="mb-2 text-xs font-medium">{new Date(point.bucket).toLocaleString([], { dateStyle: "medium", ...(bucket === "hour" ? { timeStyle: "short" } : {}) })}</p>{ENGAGEMENT_SERIES.filter(s => visible.includes(s.key)).map(s => <div key={s.key} className="flex items-center justify-between gap-6 py-1 text-xs"><span className="flex items-center gap-2"><span className={`size-2 rounded-full ${s.dot}`} />{s.label}</span><strong className="tabular-nums">{formatCount(point[s.key])}</strong></div>)}</div>;
                  }} />
                  {ENGAGEMENT_SERIES.filter(s => visible.includes(s.key)).map(s => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={`url(#${id}-${s.key})`} strokeWidth={2} isAnimationActive={false} />)}
                </AreaChart>
              </ResponsiveContainer>}
          </div>
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 py-4">{ENGAGEMENT_SERIES.map(s => <Button key={s.key} variant="ghost" size="sm" aria-pressed={visible.includes(s.key)} className={`h-8 gap-2 text-xs ${visible.includes(s.key) ? "" : "opacity-40"}`} onClick={() => setVisible(prev => prev.includes(s.key) ? prev.length > 1 ? prev.filter(k => k !== s.key) : prev : [...prev, s.key])}><span className={`size-2 rounded-full ${s.dot}`} />{s.label}</Button>)}</div>
          <p className="pb-4 text-center text-xs text-muted-foreground">Sent counts emails; opens, clicks and replies count unique contacts per interval.</p>
        </div>
      </>}
    </section>
  );
}
