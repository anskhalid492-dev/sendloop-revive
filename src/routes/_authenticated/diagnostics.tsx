import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, RefreshCw, X } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getWorkspaceDiagnostics } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/diagnostics")({
  head: () => ({
    meta: [
      { title: "Plan diagnostics — Sendloop" },
      {
        name: "description",
        content:
          "Troubleshoot your Sendloop workspace: resolved plan, feature flags, credit balance and usage limits.",
      },
      { property: "og:title", content: "Plan diagnostics — Sendloop" },
      {
        property: "og:description",
        content: "Resolved plan, enabled features, credits and usage limits for your workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const fetchDiagnostics = useServerFn(getWorkspaceDiagnostics);
  const q = useQuery({
    queryKey: ["workspace-diagnostics", workspace?.id],
    queryFn: () => fetchDiagnostics({ data: { workspaceId: workspace!.id } }),
    enabled: Boolean(workspace?.id),
  });

  const data = q.data;

  return (
    <AppShell title="Plan diagnostics" description="Resolved entitlements for this workspace">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.workspaceName} · generated ${new Date(data.generatedAt).toLocaleString()}`
              : "Loading workspace entitlements…"}
          </p>
          <Button variant="outline" size="sm" onClick={() => void q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`mr-2 size-4 ${q.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {wsLoading || q.isLoading ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">No workspace selected.</p>
        ) : (
          <>
            <section className="surface-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Resolved plan
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-2xl font-bold">{data.plan.name}</span>
                <Badge variant={data.plan.active ? "default" : "secondary"}>
                  {data.plan.state === "none" ? "no subscription" : data.plan.state}
                </Badge>
                {data.plan.inGrace ? <Badge variant="outline">grace period</Badge> : null}
              </div>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Entitlement active</dt>
                  <dd className="font-medium">{data.plan.active ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Access until</dt>
                  <dd className="font-medium">
                    {data.plan.accessUntil ? new Date(data.plan.accessUntil).toLocaleDateString() : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Plan ID</dt>
                  <dd className="font-mono text-xs">{data.plan.id ?? "—"}</dd>
                </div>
              </dl>
            </section>

            <section className="surface-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Credits
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-4">
                {[
                  { label: "Balance", value: data.credits.balance },
                  { label: "Included / month", value: data.credits.included },
                  { label: "Allocated total", value: data.credits.allocatedTotal },
                  { label: "Consumed total", value: data.credits.consumedTotal },
                ].map((c) => (
                  <div key={c.label}>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="text-xl font-bold">{c.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
              {data.recentLedger.length ? (
                <div className="mt-4 divide-y divide-border/40 rounded-lg border border-border/50">
                  {data.recentLedger.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(r.at).toLocaleString()}
                      </span>
                      <Badge variant="outline">{r.entryType}</Badge>
                      <span className={r.amount < 0 ? "text-destructive" : "text-primary"}>
                        {r.amount > 0 ? "+" : ""}
                        {r.amount.toLocaleString()}
                      </span>
                      <span className="flex-1 min-w-32 text-muted-foreground">{r.reason ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        balance {r.balanceAfter.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No credit activity recorded yet.</p>
              )}
            </section>

            <section className="surface-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Usage vs plan limits
              </h2>
              <div className="mt-3 space-y-3">
                {data.usage.map((u) => (
                  <div key={u.key}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{u.label}</span>
                      <span className={u.overLimit ? "text-destructive" : "text-muted-foreground"}>
                        {u.used.toLocaleString()} / {u.limit === null ? "unlimited" : u.limit.toLocaleString()}
                        {u.overLimit ? (
                          <AlertTriangle className="ml-1 inline size-3.5 align-text-top" />
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div
                        className={`h-1.5 rounded-full ${u.overLimit ? "bg-destructive" : "bg-primary"}`}
                        style={{ width: `${u.percent ?? 0}%` }}
                      />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{u.key}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="surface-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Feature flags
              </h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.features.map((f) => (
                  <div
                    key={f.key}
                    className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2"
                  >
                    {f.enabled ? (
                      <Check className="size-4 text-primary" />
                    ) : (
                      <X className="size-4 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.label}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {f.key} · {f.source}
                      </p>
                    </div>
                    <Badge variant={f.enabled ? "default" : "secondary"}>
                      {f.enabled ? "on" : "off"}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
