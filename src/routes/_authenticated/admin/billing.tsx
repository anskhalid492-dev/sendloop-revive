import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPlatformBilling } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/billing")({
  component: AdminBillingPage,
});

function AdminBillingPage() {
  const fetchBilling = useServerFn(getPlatformBilling);
  const q = useQuery({ queryKey: ["admin-billing"], queryFn: () => fetchBilling() });

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Billing</h2>
        <p className="text-sm text-muted-foreground">Plans, customers and infrastructure cost.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5">
          <div className="text-2xl font-bold">{d.workspaces}</div>
          <div className="text-sm text-muted-foreground">Customer workspaces</div>
        </div>
        <div className="surface-card p-5">
          <div className="text-2xl font-bold">{d.plans.length}</div>
          <div className="text-sm text-muted-foreground">Active plans</div>
        </div>
        <div className="surface-card p-5">
          <div className="text-2xl font-bold">
            ${(d.estimatedMonthlyInfraCents / 100).toFixed(2)}
          </div>
          <div className="text-sm text-muted-foreground">Est. monthly infra cost</div>
        </div>
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Monthly</th>
              <th className="px-4 py-3">Yearly</th>
            </tr>
          </thead>
          <tbody>
            {d.plans.map((p) => (
              <tr key={p.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">${(p.monthly_price / 100).toFixed(0)}</td>
                <td className="px-4 py-3">${(p.yearly_price / 100).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
