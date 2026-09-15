import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Skeleton } from "@/components/ui/skeleton";
import { analyticsKeys, liveQueryOptions } from "@/lib/analytics-query";
import { getReplyIntelligence } from "@/lib/analytics.functions";
import { filterPayload, type AnalyticsFilters } from "@/lib/analytics-filters";
import { formatCount, formatPct, rate } from "@/lib/analytics-model";

const CATEGORIES = [
  { key: "positive", label: "Positive", bar: "bg-emerald-500" },
  { key: "neutral", label: "Neutral", bar: "bg-sky-500" },
  { key: "negative", label: "Negative", bar: "bg-destructive" },
  { key: "out_of_office", label: "Out of office", bar: "bg-violet-500" },
  { key: "unsubscribe", label: "Unsubscribe", bar: "bg-amber-500" },
] as const;

const LABELS: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  out_of_office: "Out of office",
  unsubscribe: "Unsubscribe",
};

/** Reply volume split by intent, with the newest replies underneath. */
export function ReplyIntelligence({ filters }: { filters: AnalyticsFilters }) {
  const fetchReplies = useServerFn(getReplyIntelligence);
  const query = useQuery({
    queryKey: analyticsKeys.replies(
      filters.workspaceId,
      filters.from,
      filters.to,
      filters.campaignId,
      filters.accountId,
    ),
    queryFn: () => fetchReplies({ data: filterPayload(filters) }),
    enabled: !!filters.workspaceId,
    ...liveQueryOptions(),
  });

  const data = query.data;
  const total = data?.total ?? 0;

  return (
    <section className="surface-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Reply intelligence</h2>
        <p className="text-xs text-muted-foreground">{formatCount(total)} replies in range</p>
      </div>

      {query.isLoading ? (
        <Skeleton className="mt-3 h-40 w-full rounded-xl" />
      ) : total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No replies in this range yet.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            {CATEGORIES.map((category) => {
              const value = data?.byCategory[category.key] ?? 0;
              return (
                <div key={category.key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{category.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatCount(value)}
                      <span className="ml-2 text-xs">{formatPct(rate(value, total))}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${category.bar}`}
                      style={{ width: `${Math.min(100, (value / Math.max(total, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Latest replies
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {(data?.recent ?? []).map((reply) => (
                <div key={reply.id} className="rounded-lg border border-border/50 p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{reply.email}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {LABELS[reply.category] ?? reply.category}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {reply.subject || "(no subject)"} ·{" "}
                    {new Date(reply.receivedAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
