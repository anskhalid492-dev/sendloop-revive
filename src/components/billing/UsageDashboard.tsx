import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getWorkspaceUsage } from "@/lib/billing.functions";

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

/**
 * Customer-facing plan, usage and feature dashboard. Read-only mirror of the
 * server-side entitlement state — the UI never decides what is allowed.
 */
export function UsageDashboard({ workspaceId }: { workspaceId: string | null }) {
  const fetchUsage = useServerFn(getWorkspaceUsage);
  const usage = useQuery({
    queryKey: ["workspace-usage", workspaceId],
    queryFn: () => fetchUsage({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  if (!workspaceId || usage.isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  }
  const data = usage.data;
  if (!data) return null;

  const creditsPercent =
    data.credits.included > 0
      ? Math.min(100, Math.round((data.credits.balance / data.credits.included) * 100))
      : null;

  return (
    <div className="space-y-6">
      <div className="surface-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Current plan
            </p>
            <div className="mt-1 flex items-center gap-3">
              <h2 className="text-2xl font-bold">{data.plan.name}</h2>
              <Badge variant={data.plan.active ? "secondary" : "destructive"}>
                {data.plan.stateLabel}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Billing period {new Date(data.period.start).toLocaleDateString()} –{" "}
              {new Date(data.period.end).toLocaleDateString()}
            </p>
            {data.plan.inGrace && data.plan.accessUntil ? (
              <p className="mt-2 text-sm text-amber-600">
                Payment issue — access continues until{" "}
                {new Date(data.plan.accessUntil).toLocaleDateString()}.
              </p>
            ) : null}
          </div>
          <Button asChild>
            <Link to="/pricing">Change plan</Link>
          </Button>
        </div>

        {data.credits.included > 0 ? (
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Credits</span>
              <span className="text-muted-foreground">
                {formatNumber(data.credits.balance)} of {formatNumber(data.credits.included)} left
              </span>
            </div>
            <Progress value={creditsPercent ?? 0} className="mt-2 h-2" />
          </div>
        ) : null}
      </div>

      {data.overLimitResources.length > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            You have reached your plan limit for{" "}
            <span className="font-medium">{data.overLimitResources.join(", ")}</span>. Upgrade to
            keep growing.
          </p>
        </div>
      ) : null}

      <div className="surface-card p-6">
        <h3 className="font-semibold">Usage this period</h3>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {data.usage.map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{row.label}</span>
                <span
                  className={
                    row.overLimit
                      ? "text-destructive"
                      : row.nearLimit
                        ? "text-amber-600"
                        : "text-muted-foreground"
                  }
                >
                  {formatNumber(row.used)}
                  {row.limit === null ? " / Unlimited" : ` / ${formatNumber(row.limit)}`}
                </span>
              </div>
              <Progress value={row.percent ?? 0} className="mt-2 h-1.5" />
            </div>
          ))}
        </div>
      </div>

      <div className="surface-card p-6">
        <h3 className="font-semibold">Included features</h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.features.map((feature) => (
            <div key={feature.key} className="flex items-center gap-2 text-sm">
              {feature.enabled ? (
                <Check className="size-4 shrink-0 text-primary" />
              ) : (
                <Lock className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={feature.enabled ? "" : "text-muted-foreground"}>
                {feature.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
