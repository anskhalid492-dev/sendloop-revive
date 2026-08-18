import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Boxes, Building2, Gauge, Send } from "lucide-react";

import { getAdminOverview } from "@/lib/admin.functions";
import { providerLabel } from "@/lib/providers/registry";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Infrastructure Overview — Sendloop Admin" },
      {
        name: "description",
        content: "Internal overview of Sendloop providers, sending pool capacity and workspaces.",
      },
    ],
  }),
  component: AdminOverviewPage,
});

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Gauge;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AdminOverviewPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => fetchOverview(),
  });

  if (isLoading || !data) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Boxes} label="Providers" value={data.providers} hint="Configured integrations" />
        <Stat
          icon={Send}
          label="Mailboxes"
          value={data.pool.total}
          hint={`${data.pool.assigned} assigned · ${data.pool.unassigned} free`}
        />
        <Stat icon={Building2} label="Workspaces" value={data.workspaces} />
        <Stat
          icon={Activity}
          label="Campaigns"
          value={data.campaigns}
          hint={`${data.activeCampaigns} active`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Gauge} label="Healthy" value={data.pool.healthy} />
        <Stat icon={Gauge} label="Warming" value={data.pool.warming} />
        <Stat icon={Gauge} label="Paused" value={data.pool.paused} />
        <Stat icon={Gauge} label="Errored" value={data.pool.error} />
      </div>

      <div className="surface-card p-6">
        <h2 className="text-sm font-semibold">Daily capacity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.pool.sentToday.toLocaleString()} of {data.pool.capacity.toLocaleString()} emails
          used today across the pool.
        </p>
        <div className="mt-6 space-y-3">
          {data.byProvider.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mailboxes in the pool yet.</p>
          ) : (
            data.byProvider.map((p) => (
              <div key={p.provider} className="flex items-center justify-between text-sm">
                <span className="font-medium">{providerLabel(p.provider)}</span>
                <span className="text-muted-foreground">
                  {p.accounts} mailboxes · {p.sentToday.toLocaleString()}/
                  {p.capacity.toLocaleString()} today
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
