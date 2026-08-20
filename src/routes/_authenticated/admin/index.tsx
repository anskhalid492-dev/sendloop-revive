import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  Building2,
  CreditCard,
  Inbox,
  LifeBuoy,
  Mailbox,
  RefreshCcw,
  Send,
  UserCheck,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminDashboard } from "@/lib/admin-dashboard.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Sendloop" },
      {
        name: "description",
        content:
          "Platform-wide Sendloop metrics: users, workspaces, subscriptions, sending volume, activity and system alerts.",
      },
      { property: "og:title", content: "Admin Dashboard — Sendloop" },
      {
        property: "og:description",
        content: "Real-time platform health, revenue and activity for Sendloop staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOverviewPage,
});

const METRIC_ICON: Record<string, typeof Users> = {
  users: Users,
  "active-users": UserCheck,
  workspaces: Building2,
  subscriptions: CreditCard,
  emails: Send,
  campaigns: Activity,
  accounts: Mailbox,
  tickets: LifeBuoy,
};

function money(cents: number | null) {
  if (cents === null) return "No data";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function relative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="surface-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Empty({ label = "No data" }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{label}</p>;
}

function AdminOverviewPage() {
  const fetchDashboard = useServerFn(getAdminDashboard);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => fetchDashboard(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="surface-card h-28 animate-pulse bg-muted/40" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="surface-card h-72 animate-pulse bg-muted/40" />
          <div className="surface-card h-72 animate-pulse bg-muted/40" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="surface-card mx-auto max-w-lg p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Couldn’t load platform metrics</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Unexpected error."}
        </p>
        <Button className="mt-6" onClick={() => void refetch()}>
          <RefreshCcw className="size-4" />
          Try again
        </Button>
      </div>
    );
  }

  const hasRevenue = data.revenue.length > 0;
  const growthTotal = data.userGrowth.reduce((n, d) => n + d.count, 0);
  const emailTotal = data.emailActivity.reduce((n, d) => n + d.sent + d.failed, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Live platform data · updated {relative(data.generatedAt)}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCcw className={isFetching ? "size-4 animate-spin" : "size-4"} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.metrics.map((metric) => {
          const Icon = METRIC_ICON[metric.key] ?? Activity;
          return (
            <div key={metric.key} className="surface-card p-5">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Icon className="size-4 text-primary" />
                {metric.label}
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                {metric.value === null ? (
                  <span className="text-base font-normal text-muted-foreground">No data</span>
                ) : (
                  metric.value.toLocaleString()
                )}
              </p>
              {metric.hint ? (
                <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Revenue overview"
          description={`Successful payments · last 180 days · ${money(data.revenueTotalCents)} total · MRR ${money(data.mrrCents)}`}
        >
          {!hasRevenue ? (
            <Empty label="No payments recorded yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.revenue}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(v: number) => `${Math.round(v / 100)}`}
                />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="cents" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Subscription overview" description="Live subscription states across all workspaces">
          {data.subscriptions.length === 0 ? (
            <Empty label="No subscriptions yet" />
          ) : (
            <ul className="space-y-3">
              {data.subscriptions.map((s) => (
                <li key={s.status} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{s.status.replace(/_/g, " ")}</span>
                  <span className="font-semibold tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="User growth" description={`${growthTotal} new sign-ups in the last 30 days`}>
          {growthTotal === 0 ? (
            <Empty label="No sign-ups in this window" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.userGrowth}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                <Tooltip labelFormatter={(v: string) => shortDate(v)} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Email activity" description={`Campaign sends · last 14 days · ${emailTotal} messages`}>
          {emailTotal === 0 ? (
            <Empty label="No sending activity in this window" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.emailActivity}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                <Tooltip labelFormatter={(v: string) => shortDate(v)} />
                <Line type="monotone" dataKey="sent" stroke="hsl(var(--primary))" dot={false} />
                <Line type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="System alerts" description="Provider, mailbox, webhook and job failures">
          {data.alerts.length === 0 ? (
            <Empty label="No active alerts" />
          ) : (
            <ul className="space-y-3">
              {data.alerts.map((alert) => (
                <li key={alert.id} className="flex gap-3 rounded-lg border border-border/60 p-3">
                  <AlertTriangle
                    className={
                      alert.severity === "critical"
                        ? "mt-0.5 size-4 shrink-0 text-destructive"
                        : "mt-0.5 size-4 shrink-0 text-amber-500"
                    }
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{alert.title}</p>
                      <Badge variant="secondary">{alert.source}</Badge>
                    </div>
                    {alert.detail ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{alert.detail}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground/80">{relative(alert.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity" description="Sign-ups, workspaces, subscriptions, sends and tickets">
          {data.activity.length === 0 ? (
            <Empty label="No recorded activity yet" />
          ) : (
            <ul className="space-y-3">
              {data.activity.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Inbox className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm">{item.title}</p>
                    {item.detail ? (
                      <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                    ) : null}
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {relative(item.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
