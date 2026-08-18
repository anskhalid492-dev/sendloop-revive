import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getSystemAnalytics } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AdminAnalyticsPage,
});

function AdminAnalyticsPage() {
  const fetchAnalytics = useServerFn(getSystemAnalytics);
  const q = useQuery({ queryKey: ["admin-analytics"], queryFn: () => fetchAnalytics() });

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;

  const cards = [
    { label: "Queued recipients", value: d.recipients },
    { label: "Leads stored", value: d.leads },
    { label: "Sent today", value: `${d.sentToday} / ${d.capacity}` },
    { label: "Pool utilization", value: `${d.utilization}%` },
    { label: "Avg mailbox health", value: `${d.avgHealth}/100` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">System analytics</h2>
        <p className="text-sm text-muted-foreground">Platform-wide sending and pipeline metrics.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="surface-card p-5">
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-sm text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h3 className="font-semibold">Recipient status</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {Object.entries(d.byStatus).map(([status, count]) => (
              <li key={status} className="flex justify-between">
                <span className="capitalize text-muted-foreground">{status}</span>
                <span className="font-medium">{count}</span>
              </li>
            ))}
            {Object.keys(d.byStatus).length === 0 ? (
              <li className="text-muted-foreground">No sends queued yet.</li>
            ) : null}
          </ul>
        </div>
        <div className="surface-card p-5">
          <h3 className="font-semibold">Provider capacity</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {d.providers.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span className="text-muted-foreground">
                  {p.name} {p.is_enabled ? "" : "(disabled)"}
                </span>
                <span className="font-medium">{p.daily_capacity.toLocaleString()}/day</span>
              </li>
            ))}
            {d.providers.length === 0 ? (
              <li className="text-muted-foreground">No providers configured.</li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
