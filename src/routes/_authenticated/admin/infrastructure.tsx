import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getManagedInfraStatus, getSystemAnalytics } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/infrastructure")({
  component: AdminInfrastructurePage,
});

function AdminInfrastructurePage() {
  const fetchAnalytics = useServerFn(getSystemAnalytics);
  const fetchManaged = useServerFn(getManagedInfraStatus);
  const q = useQuery({ queryKey: ["admin-analytics"], queryFn: () => fetchAnalytics() });
  const managed = useQuery({
    queryKey: ["admin-managed-infra"],
    queryFn: () => fetchManaged(),
  });

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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">Managed provider check</h3>
          {managed.data ? (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${managed.data.configured ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}
            >
              {managed.data.configured ? "Configured" : "Not configured"}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Sendloop owns these credentials server-side. Customers only own their domain and DNS.
        </p>
        {managed.isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : managed.error ? (
          <p className="text-sm text-destructive">{(managed.error as Error).message}</p>
        ) : (
          <>
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Credentials</th>
                    <th className="px-4 py-3">Reachable</th>
                    <th className="px-4 py-3">Verified domains</th>
                    <th className="px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {(managed.data?.providers ?? []).map((p) => (
                    <tr key={p.provider + (p.id ?? "")} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {p.name}
                        {p.isEnabled ? "" : " (disabled)"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.hasCredentials
                          ? p.credentialSource === "platform_env"
                            ? "Platform env key"
                            : "Stored provider secret"
                          : "Missing"}
                      </td>
                      <td className="px-4 py-3">{p.reachable ? "Yes" : "No"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.verifiedDomains.length ? p.verifiedDomains.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.message}</td>
                    </tr>
                  ))}
                  {(managed.data?.providers ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No managed providers configured yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Customer domain</th>
                    <th className="px-4 py-3">DNS</th>
                    <th className="px-4 py-3">Provider verification</th>
                    <th className="px-4 py-3">Mailboxes</th>
                    <th className="px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {(managed.data?.domains ?? []).map((d2) => (
                    <tr key={d2.id} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3 font-medium">{d2.domain}</td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{d2.dnsStatus}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${d2.providerStatus === "verified" ? "bg-emerald-500/10 text-emerald-600" : d2.providerStatus === "not_verified" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}
                        >
                          {d2.providerStatus.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">{d2.mailboxes}</td>
                      <td className="px-4 py-3 text-muted-foreground">{d2.providerDetail}</td>
                    </tr>
                  ))}
                  {(managed.data?.domains ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No customer sending domains yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

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
