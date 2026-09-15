import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  MailX,
  MousePointerClick,
  Reply,
  Send,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { analyticsKeys, liveQueryOptions } from "@/lib/analytics-query";
import { getAnalyticsActivity } from "@/lib/analytics.functions";
import { filterPayload, type AnalyticsFilters } from "@/lib/analytics-filters";

const ICONS: Record<string, { icon: typeof Send; tone: string; label: string }> = {
  sent: { icon: Send, tone: "text-primary", label: "Sent" },
  delivered: { icon: CheckCircle2, tone: "text-emerald-500", label: "Delivered" },
  opened: { icon: Eye, tone: "text-sky-500", label: "Opened" },
  clicked: { icon: MousePointerClick, tone: "text-violet-500", label: "Clicked" },
  bounced: { icon: AlertTriangle, tone: "text-destructive", label: "Bounced" },
  failed: { icon: AlertTriangle, tone: "text-destructive", label: "Failed" },
  complained: { icon: Ban, tone: "text-destructive", label: "Complaint" },
  unsubscribed: { icon: MailX, tone: "text-amber-500", label: "Unsubscribed" },
};

function describe(type: string) {
  if (type.startsWith("reply_")) {
    const category = type.slice("reply_".length).replace(/_/g, " ");
    return { icon: Reply, tone: "text-emerald-500", label: `Reply · ${category}` };
  }
  return ICONS[type] ?? { icon: Send, tone: "text-muted-foreground", label: type.replace(/_/g, " ") };
}

/** Newest delivery and reply events for the current filters. */
export function ActivityFeed({ filters }: { filters: AnalyticsFilters }) {
  const fetchActivity = useServerFn(getAnalyticsActivity);
  const query = useQuery({
    queryKey: analyticsKeys.activity(
      filters.workspaceId,
      filters.from,
      filters.to,
      filters.campaignId,
      filters.accountId,
    ),
    queryFn: () => fetchActivity({ data: { ...filterPayload(filters), limit: 40 } }),
    enabled: !!filters.workspaceId,
    ...liveQueryOptions(30_000),
  });

  const rows = query.data ?? [];

  return (
    <section className="surface-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Activity</h2>
        <p className="text-xs text-muted-foreground">Live feed, newest first</p>
      </div>

      {query.isLoading ? (
        <Skeleton className="mt-3 h-48 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No events in this range yet.
        </p>
      ) : (
        <ul className="mt-3 max-h-96 divide-y divide-border/40 overflow-y-auto pr-1">
          {rows.map((row) => {
            const meta = describe(row.type);
            const Icon = meta.icon;
            return (
              <li key={row.id} className="flex items-start gap-3 py-2.5">
                <Icon className={`mt-0.5 size-4 shrink-0 ${meta.tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium capitalize">{meta.label}</span>
                    {row.email ? <span className="text-muted-foreground"> · {row.email}</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.campaignName ?? "No campaign"}
                    {row.detail ? ` · ${row.detail}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {new Date(row.occurredAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
