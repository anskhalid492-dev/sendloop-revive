import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getSystemAnalytics } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/infrastructure")({
  component: AdminInfrastructurePage,
});

function AdminInfrastructurePage() {
  const fetchAnalytics = useServerFn(getSystemAnalytics);
  const q = useQuery({ queryKey: ["admin-analytics"], queryFn: () => fetchAnalytics() });

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Sending infrastructure</h2>
        <p className="text-sm text-muted-foreground">
          Capacity, cost and utilization across every configured provider.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5">
          <div className="text-2xl font-bold">{d.capacity.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Daily mailbox capacity</div>
        </div>
        <div className="surface-card p-5">
          <div className="text-2xl font-bold">{d.utilization}%</div>
          <div className="text-sm text-muted-foreground">Utilization today</div>
        </div>
        <div className="surface-card p-5">
          <div className="text-2xl font-bold">{d.avgHealth}/100</div>
          <div className="text-sm text-muted-foreground">Average health score</div>
        </div>
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Daily capacity</th>
              <th className="px-4 py-3">Cost / 1k</th>
            </tr>
          </thead>
          <tbody>
            {d.providers.map((p) => (
              <tr key={p.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.is_enabled ? "Enabled" : "Disabled"}
                </td>
                <td className="px-4 py-3">{p.daily_capacity.toLocaleString()}</td>
                <td className="px-4 py-3">${(p.cost_per_1k_cents / 100).toFixed(2)}</td>
              </tr>
            ))}
            {d.providers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  No providers yet —{" "}
                  <Link to="/admin/providers" className="text-primary hover:underline">
                    add one
                  </Link>
                  .
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
