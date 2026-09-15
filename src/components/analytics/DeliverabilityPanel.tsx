import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Skeleton } from "@/components/ui/skeleton";
import { analyticsKeys, liveQueryOptions } from "@/lib/analytics-query";
import { getDeliverability } from "@/lib/analytics.functions";
import { filterPayload, type AnalyticsFilters } from "@/lib/analytics-filters";
import { formatCount, formatPct, rate } from "@/lib/analytics-model";

/** Bounce, failure, unsubscribe and delivery health for the range. */
export function DeliverabilityPanel({ filters }: { filters: AnalyticsFilters }) {
  const fetchDeliverability = useServerFn(getDeliverability);
  const query = useQuery({
    queryKey: analyticsKeys.deliverability(
      filters.workspaceId,
      filters.from,
      filters.to,
      filters.campaignId,
      filters.accountId,
    ),
    queryFn: () => fetchDeliverability({ data: filterPayload(filters) }),
    enabled: !!filters.workspaceId,
    ...liveQueryOptions(),
  });

  const data = query.data;
  const sent = data?.sent ?? 0;

  const tiles = [
    {
      label: "Delivery rate",
      value: formatPct(rate(data?.delivered ?? 0, sent)),
      sub: `${formatCount(data?.delivered ?? 0)} delivered`,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Bounce rate",
      value: formatPct(rate(data?.bounced ?? 0, sent)),
      sub: `${formatCount(data?.bounced ?? 0)} bounced`,
      tone: "text-destructive",
    },
    {
      label: "Failed sends",
      value: formatCount(data?.failed ?? 0),
      sub: `${formatPct(rate(data?.failed ?? 0, sent))} of sends`,
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Unsubscribe rate",
      value: formatPct(rate(data?.unsubscribed ?? 0, sent)),
      sub: `${formatCount(data?.unsubscribed ?? 0)} unsubscribed`,
      tone: "text-muted-foreground",
    },
  ];

  return (
    <section className="surface-card p-4">
      <h2 className="text-sm font-semibold">Deliverability</h2>

      {query.isLoading ? (
        <Skeleton className="mt-3 h-32 w-full rounded-xl" />
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-xl border border-border/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tile.label}
                </p>
                <p className={`mt-1 text-xl font-semibold ${tile.tone}`}>{tile.value}</p>
                <p className="text-xs text-muted-foreground">{tile.sub}</p>
              </div>
            ))}
          </div>

          {(data?.reasons ?? []).length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Most common failure reasons
              </p>
              <ul className="mt-2 space-y-1.5">
                {(data?.reasons ?? []).map((reason) => (
                  <li
                    key={reason.reason}
                    className="flex items-start justify-between gap-3 border-b border-border/40 pb-1.5 text-sm last:border-0"
                  >
                    <span className="text-muted-foreground">{reason.reason}</span>
                    <span className="shrink-0 tabular-nums">{formatCount(reason.count)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
