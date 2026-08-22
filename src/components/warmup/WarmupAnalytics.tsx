import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getWarmupAnalytics } from "@/lib/warmup.functions";
import { PLACEMENT_LABEL, type WarmupPlacement } from "@/lib/warmup-model";
import { cn } from "@/lib/utils";

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const PLACEMENT_COLORS: Record<string, string> = {
  inbox: "hsl(152 60% 42%)",
  spam: "hsl(38 92% 50%)",
  received_unknown: "hsl(199 70% 52%)",
  pending: "hsl(220 9% 62%)",
  not_received: "hsl(260 40% 60%)",
  not_delivered: "hsl(0 72% 55%)",
};

function fmtDay(day: string) {
  const [, m, d] = day.split("-");
  return `${m}/${d}`;
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  tone?: string | undefined;
}) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-2xl font-semibold tabular-nums", tone)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function WarmupAnalytics() {
  const fetchAnalytics = useServerFn(getWarmupAnalytics);
  const [days, setDays] = useState("30");
  const [mailbox, setMailbox] = useState("all");

  const query = useQuery({
    queryKey: ["warmup-analytics", days, mailbox],
    queryFn: () =>
      fetchAnalytics({
        data: {
          days: Number(days),
          ...(mailbox === "all" ? {} : { accountIds: [mailbox] }),
        },
      }),
  });

  const data = query.data;
  const series = data?.series ?? [];
  const hasData = series.some((point) => point.sent > 0);
  const pct = (value: number | null | undefined) =>
    value === null || value === undefined ? "Not available" : `${value}%`;
  const current = data?.current;
  const relative = (iso: string | null | undefined) => {
    if (!iso) return "Not available";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  };

  const placement = useMemo(
    () =>
      (data?.placement ?? []).map((p) => ({
        ...p,
        label: PLACEMENT_LABEL[p.placement as WarmupPlacement] ?? p.placement,
        color: PLACEMENT_COLORS[p.placement] ?? "hsl(220 9% 62%)",
      })),
    [data?.placement],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Warmup analytics</h2>
          <p className="text-xs text-muted-foreground">
            Computed from recorded warmup sends and placement results only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={mailbox} onValueChange={setMailbox}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All mailboxes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All mailboxes</SelectItem>
              {(data?.mailboxes ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.from_email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-40">
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
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {query.isLoading ? null : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Warmup volume today"
            value={String(current?.sentToday ?? 0)}
            hint={
              current?.targetToday !== null && current?.targetToday !== undefined
                ? `target ${current.targetToday}`
                : "Target not available"
            }
          />
          <Metric
            label="Warmup daily limit"
            value={
              current?.dailyLimit !== null && current?.dailyLimit !== undefined
                ? String(current.dailyLimit)
                : "Not available"
            }
            hint={`${current?.enabledMailboxes ?? 0} mailbox(es) warming`}
          />
          <Metric
            label="Warmup stage"
            value={current?.stage ? current.stage : "Not available"}
            hint={
              current?.stageDay
                ? `day ${current.stageDay}${current.rampDays ? ` of ${current.rampDays}` : ""}`
                : undefined
            }
          />
          <Metric
            label="Warmup health"
            value={
              current?.healthScore !== null && current?.healthScore !== undefined
                ? String(current.healthScore)
                : "Not available"
            }
          />
          <Metric label="Last warmup activity" value={relative(current?.lastActivityAt)} />
        </div>
      )}

      {query.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : !hasData ? (
        <div className="surface-card p-10 text-center">
          <h3 className="text-sm font-semibold">No warmup activity recorded yet</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Charts fill in automatically once warmup emails have been sent and their placement is
            detected for the selected mailboxes and range.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Warmup sent"
              value={String(data?.totals.sent ?? 0)}
              hint={`${data?.totals.delivered ?? 0} delivered`}
            />
            <Metric
              label="Inbox rate"
              value={pct(data?.rates.inbox)}
              hint={`${data?.totals.inbox ?? 0} inbox · ${data?.totals.spam ?? 0} spam`}
              tone="text-emerald-600"
            />
            <Metric
              label="Spam rate"
              value={pct(data?.rates.spam)}
              tone={(data?.rates.spam ?? 0) > 5 ? "text-amber-600" : undefined}
            />
            <Metric label="Reply rate" value={pct(data?.rates.reply)} hint={`${data?.totals.replied ?? 0} replies`} />
            <Metric
              label="Delivery rate"
              value={pct(data?.rates.delivered)}
              hint={`${data?.totals.failed ?? 0} failed`}
            />
            <Metric
              label="Bounce rate"
              value={pct(data?.rates.bounce)}
              tone={(data?.rates.bounce ?? 0) > 3 ? "text-destructive" : undefined}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Volume & placement" subtitle="Daily warmup sends split by folder">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={fmtDay} fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip labelFormatter={(v) => String(v)} />
                  <Area
                    type="monotone"
                    dataKey="inbox"
                    stackId="1"
                    stroke={PLACEMENT_COLORS["inbox"]}
                    fill={PLACEMENT_COLORS["inbox"]}
                    fillOpacity={0.25}
                    name="Inbox"
                  />
                  <Area
                    type="monotone"
                    dataKey="spam"
                    stackId="1"
                    stroke={PLACEMENT_COLORS["spam"]}
                    fill={PLACEMENT_COLORS["spam"]}
                    fillOpacity={0.25}
                    name="Spam"
                  />
                  <Area
                    type="monotone"
                    dataKey="not_received"
                    stackId="1"
                    stroke={PLACEMENT_COLORS["not_received"]}
                    fill={PLACEMENT_COLORS["not_received"]}
                    fillOpacity={0.2}
                    name="Not confirmed"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Inbox rate & health" subtitle="Placement quality against mailbox health score">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={fmtDay} fontSize={11} tickLine={false} />
                  <YAxis domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="inbox_rate"
                    stroke="hsl(152 60% 42%)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="Inbox rate %"
                  />
                  <Line
                    type="monotone"
                    dataKey="health_score"
                    stroke="hsl(199 70% 52%)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="Health score"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Placement breakdown" subtitle="Every warmup message in the selected range">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Tooltip />
                  <Pie data={placement} dataKey="count" nameKey="label" innerRadius={55} outerRadius={90}>
                    {placement.map((entry) => (
                      <Cell key={entry.placement} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap gap-2">
                {placement.map((entry) => (
                  <Badge key={entry.placement} variant="outline" className="gap-1.5 text-xs">
                    <span className="size-2 rounded-full" style={{ background: entry.color }} />
                    {entry.label} · {entry.count}
                  </Badge>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Replies & bounces" subtitle="Engagement and failure signals per day">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={fmtDay} fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="replied" fill="hsl(199 70% 52%)" radius={[3, 3, 0, 0]} name="Replies" />
                  <Bar dataKey="bounced" fill="hsl(0 72% 55%)" radius={[3, 3, 0, 0]} name="Bounces" />
                  <Bar dataKey="rejected" fill="hsl(38 92% 50%)" radius={[3, 3, 0, 0]} name="Rejected" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="surface-card overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Mailbox</th>
                  <th className="px-3 py-2.5 text-right font-medium">Sent</th>
                  <th className="px-3 py-2.5 text-right font-medium">Inbox rate</th>
                  <th className="px-3 py-2.5 text-right font-medium">Spam</th>
                  <th className="px-3 py-2.5 text-right font-medium">Reply rate</th>
                  <th className="px-3 py-2.5 text-right font-medium">Bounce rate</th>
                  <th className="px-3 py-2.5 text-right font-medium">Health</th>
                </tr>
              </thead>
              <tbody>
                {(data?.perMailbox ?? []).map((m) => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-muted/40">
                    <td className="px-3 py-2.5 font-medium">{m.from_email}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.sent}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">
                      {pct(m.inbox_rate)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.spam}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pct(m.reply_rate)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pct(m.bounce_rate)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.health_score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
