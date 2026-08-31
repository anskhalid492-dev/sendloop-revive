import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, PlugZap, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, PROVIDER_LABELS, PROVIDER_REQUIREMENTS } from "@/lib/billing/model";
import { BillingCredentialsDialog, type ProviderSecretStatus } from "@/components/admin/BillingCredentialsDialog";
import {
  clearBillingProviderError,
  getBillingProviderHealth,
  getBillingProviderSecrets,
  setBillingProviderEnabled,
  testBillingProviderConnection,
} from "@/lib/billing-admin.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/billing-providers")({
  component: BillingProvidersPage,
  head: () => ({
    meta: [
      { title: "Billing providers · MunchReach admin" },
      {
        name: "description",
        content:
          "Enable payment providers, check sandbox and live connection status, and review the last payment, webhook and error per environment.",
      },
    ],
  }),
});

const ENVIRONMENTS = [
  { key: "test", label: "Sandbox / test" },
  { key: "live", label: "Live" },
] as const;

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function ago(value: string | null | undefined) {
  if (!value) return null;
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ConnectionBadge({ state }: { state: "connected" | "failed" | "unknown" }) {
  if (state === "connected")
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Connected
      </Badge>
    );
  if (state === "failed")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <HelpCircle className="h-3 w-3" /> Not tested
    </Badge>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string | null }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function BillingProvidersPage() {
  const queryClient = useQueryClient();
  const fetchHealth = useServerFn(getBillingProviderHealth);
  const toggleProvider = useServerFn(setBillingProviderEnabled);
  const testConnection = useServerFn(testBillingProviderConnection);
  const clearError = useServerFn(clearBillingProviderError);
  const fetchSecrets = useServerFn(getBillingProviderSecrets);

  const q = useQuery({ queryKey: ["admin-billing-provider-health"], queryFn: () => fetchHealth() });
  const secretsQ = useQuery({
    queryKey: ["admin-billing-provider-secrets"],
    queryFn: () => fetchSecrets() as Promise<ProviderSecretStatus[]>,
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-billing-provider-health"] });
    queryClient.invalidateQueries({ queryKey: ["admin-billing-provider-secrets"] });
    queryClient.invalidateQueries({ queryKey: ["admin-billing"] });
    queryClient.invalidateQueries({ queryKey: ["admin-billing-readiness"] });
  };

  const toggleMutation = useMutation({
    mutationFn: (v: { provider: any; environment: any; enabled: boolean }) => toggleProvider({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(`${PROVIDER_LABELS[v.provider as keyof typeof PROVIDER_LABELS]} ${v.enabled ? "enabled" : "disabled"}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: (v: { provider: any; environment: any }) => testConnection({ data: v }),
    onSuccess: (r: any) => {
      if (r.ok) toast.success(r.detail);
      else toast.error(r.detail);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMutation = useMutation({
    mutationFn: (v: { provider: any; environment: any }) => clearError({ data: v }),
    onSuccess: () => {
      toast.success("Last error cleared");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;

  const data = q.data!;
  const rows = data.rows;
  const pendingKey = (m: typeof testMutation | typeof clearMutation | typeof toggleMutation) =>
    m.isPending ? `${(m.variables as any)?.provider}-${(m.variables as any)?.environment}` : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Billing providers</h1>
            <p className="text-sm text-muted-foreground">
              Enable payment providers per environment and monitor connection, payment, webhook and error state.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={data.settings.environment === "live" ? "default" : "secondary"}>
              Checkout uses {data.settings.environment === "live" ? "live" : "sandbox"} mode
            </Badge>
            <Button variant="outline" size="sm" onClick={() => invalidate()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>

        {ENVIRONMENTS.map((env) => (
          <section key={env.key} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{env.label}</h2>
              <span className="h-px flex-1 bg-border/60" />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {rows
                .filter((r) => r.environment === env.key)
                .map((r) => {
                  const key = `${r.provider}-${r.environment}`;
                  const req = PROVIDER_REQUIREMENTS[r.provider];
                  return (
                    <div key={key} className="surface-card space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{PROVIDER_LABELS[r.provider]}</span>
                            <ConnectionBadge state={r.connection.state} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {r.connection.checkedAt
                              ? `Checked ${ago(r.connection.checkedAt)} · ${r.connection.detail ?? ""}`
                              : "Connection has not been tested yet."}
                          </p>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Switch
                                checked={r.enabled}
                                disabled={toggleMutation.isPending || (!r.enabled && !r.ready)}
                                onCheckedChange={(enabled) =>
                                  toggleMutation.mutate({
                                    provider: r.provider,
                                    environment: r.environment,
                                    enabled,
                                  })
                                }
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {r.enabled
                              ? "Disable this provider"
                              : r.ready
                                ? "Enable this provider"
                                : "Complete setup before enabling"}
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <Metric
                          label="Last successful payment"
                          value={
                            r.lastPayment?.amountCents != null
                              ? formatMoney(r.lastPayment.amountCents, r.lastPayment.currency ?? "usd")
                              : r.lastPayment?.at
                                ? "Recorded"
                                : "No payments yet"
                          }
                          hint={r.lastPayment?.at ? when(r.lastPayment.at) : null}
                        />
                        <Metric
                          label="Last webhook"
                          value={r.lastWebhook.at ? (r.lastWebhook.eventType ?? "Event received") : "None received"}
                          hint={
                            r.lastWebhook.at
                              ? `${when(r.lastWebhook.at)} · ${r.lastWebhook.status ?? "unknown"}${
                                  r.lastWebhook.signatureOk === false ? " · bad signature" : ""
                                }`
                              : req.webhookPath
                          }
                        />
                        <Metric
                          label="Webhooks (30d)"
                          value={`${r.counts.webhooks30d}`}
                          hint={r.counts.failedWebhooks30d ? `${r.counts.failedWebhooks30d} failed` : "No failures"}
                        />
                        <Metric label="Active subscriptions" value={`${r.counts.activeSubscriptions}`} />
                      </div>

                      {r.lastError.message ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                          <div className="flex items-start gap-2 text-xs text-destructive">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium">Last error · {when(r.lastError.at)}</p>
                              <p className="mt-0.5 break-words">{r.lastError.message}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 h-7 text-xs"
                            disabled={clearMutation.isPending && pendingKey(clearMutation) === key}
                            onClick={() =>
                              clearMutation.mutate({ provider: r.provider, environment: r.environment })
                            }
                          >
                            Clear error
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                          No errors recorded.
                        </div>
                      )}

                      {!r.ready ? (
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {r.missingSecrets.length ? (
                            <li>Missing credentials: {r.missingSecrets.join(", ")}</li>
                          ) : null}
                          {r.blockers
                            .filter((b) => !b.startsWith("Missing credentials"))
                            .slice(0, 3)
                            .map((b) => (
                              <li key={b}>• {b}</li>
                            ))}
                        </ul>
                      ) : null}

                      <BillingCredentialsDialog
                        provider={r.provider}
                        environment={r.environment}
                        status={(secretsQ.data ?? []).find(
                          (s) => s.provider === r.provider && s.environment === r.environment,
                        )}
                      />

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={testMutation.isPending && pendingKey(testMutation) === key}
                          onClick={() =>
                            testMutation.mutate({ provider: r.provider, environment: r.environment })
                          }
                        >
                          {testMutation.isPending && pendingKey(testMutation) === key ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <PlugZap className="mr-2 h-4 w-4" />
                          )}
                          Test connection
                        </Button>
                        <Button size="sm" variant="ghost" asChild>
                          <a href="/mranuskhalid/billing">Open setup wizard</a>
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </TooltipProvider>
  );
}
