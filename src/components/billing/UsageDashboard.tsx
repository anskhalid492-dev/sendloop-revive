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

type UsageRow = {
  key: string;
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  percent: number | null;
};

/** Escalating warning copy at 70 / 85 / 95 / 100 % of an allowance. */
function usageWarning(percent: number | null) {
  if (percent === null) return null;
  if (percent >= 100) return { tone: "danger" as const, text: "Limit reached — upgrade to continue" };
  if (percent >= 95) return { tone: "danger" as const, text: "95% used — almost out" };
  if (percent >= 85) return { tone: "warn" as const, text: "85% used — consider upgrading" };
  if (percent >= 70) return { tone: "warn" as const, text: "70% used" };
  return null;
}

function LimitCard({ title, caption, row }: { title: string; caption: string; row: UsageRow | undefined }) {
  if (!row) return null;
  const percent = row.percent ?? 0;
  const warning = usageWarning(row.percent);
  const barTone =
    percent >= 95 ? "[&>div]:bg-destructive" : percent >= 70 ? "[&>div]:bg-amber-500" : "";
  return (
    <div className="rounded-xl border bg-card/50 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">
          {formatNumber(row.used)}
          {row.limit === null ? " / Unlimited" : ` / ${formatNumber(row.limit)}`}
        </span>
      </div>
      <Progress value={percent} className={`mt-3 h-2 ${barTone}`} />
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{caption}</span>
        {warning ? (
          <span className={warning.tone === "danger" ? "text-destructive" : "text-amber-600"}>
            {warning.text}
          </span>
        ) : row.remaining !== null ? (
          <span className="text-muted-foreground">{formatNumber(row.remaining)} left</span>
        ) : null}
      </div>
    </div>
  );
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
    // Usage moves while campaigns send: keep the meters live.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
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

  const leads = data.usage.find((u) => u.key === "leads");
  const emails = data.usage.find((u) => u.key === "emails_monthly");
  const emailsDaily = data.usage.find((u) => u.key === "emails_daily");
  const other = data.usage.filter(
    (u) => !["leads", "emails_monthly", "emails_daily"].includes(u.key),
  );
  const daysLeft = data.period.end
    ? Math.max(0, Math.ceil((new Date(data.period.end).getTime() - Date.now()) / 86_400_000))
    : null;
  const resetLabel = data.period.resets
    ? data.period.end
      ? `Resets ${new Date(data.period.end).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
      : "Resets each billing cycle"
    : "Total trial allowance — does not reset";

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
              {data.period.resets
                ? `Billing cycle started ${new Date(data.period.start).toLocaleDateString()}`
                : "Free trial — fixed lead and email allowance"}
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

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <LimitCard
            title="Leads"
            caption="Fixed workspace capacity"
            row={leads}
          />
          <LimitCard title="Emails" caption={resetLabel} row={emails} />
        </div>

        {emailsDaily && emailsDaily.limit !== null ? (
          <div className="mt-4">
            <LimitCard title="Daily sending cap" caption="Resets at midnight UTC" row={emailsDaily} />
          </div>
        ) : null}

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

      {data.overages.length > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Your workspace is above the limits of the {data.plan.name} plan.</p>
            <p className="mt-1 text-muted-foreground">
              {data.overages
                .map((o) => `${o.label}: ${formatNumber(o.used)} of ${formatNumber(o.limit)}`)
                .join(" · ")}
            </p>
            <p className="mt-1 text-muted-foreground">
              Existing data stays visible and exportable, but you cannot add more until you upgrade
              or remove the excess.
            </p>
          </div>
        </div>
      ) : null}

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
        <h3 className="font-semibold">Other usage</h3>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {other.map((row) => (
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
