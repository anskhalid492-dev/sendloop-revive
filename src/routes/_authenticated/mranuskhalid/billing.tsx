import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney, PROVIDER_LABELS, STATE_LABELS } from "@/lib/billing/model";
import { BillingProviderWizard } from "@/components/admin/BillingProviderWizard";
import { BillingTestChecklist } from "@/components/admin/BillingTestChecklist";
import {
  deletePlanPrice,
  getBillingReadiness,
  getBillingTestChecklist,
  getBillingConsole,
  listBillingRecords,
  retryBillingWebhook,
  setBillingProviderEnabled,
  syncStripeCatalogue,
  updateBillingSettings,
  upsertPlanPrice,

} from "@/lib/billing-admin.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/billing")({
  component: AdminBillingPage,
  head: () => ({ meta: [
    { title: "Billing administration — MunchReach" },
    { name: "description", content: "Manage MunchReach billing providers, lifetime offers and price mappings." },
    { property: "og:title", content: "Billing administration — MunchReach" },
    { property: "og:description", content: "Manage MunchReach billing configuration and lifetime prices." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

const TABS = [
  "Overview",
  "Providers",
  "Setup wizard",
  "Testing",
  "Plans & prices",
  "Subscriptions",
  "Transactions",
  "Invoices",
  "Webhooks",
  "Audit log",
  "Settings",
] as const;
type Tab = (typeof TABS)[number];

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Table({ head, rows }: { head: string[]; rows: (React.ReactNode[] | null)[] }) {
  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-muted-foreground" colSpan={head.length}>
                Nothing here yet.
              </td>
            </tr>
          ) : (
            rows.map((cells, i) =>
              cells ? (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  {cells.map((c, j) => (
                    <td key={j} className="px-4 py-3 align-top">
                      {c}
                    </td>
                  ))}
                </tr>
              ) : null,
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function RecordsTab({
  kind,
  head,
  render,
}: {
  kind: "subscriptions" | "transactions" | "invoices" | "webhooks" | "audit";
  head: string[];
  render: (row: any) => React.ReactNode[];
}) {
  const [search, setSearch] = useState("");
  const fetchRecords = useServerFn(listBillingRecords);
  const q = useQuery({
    queryKey: ["admin-billing-records", kind, search],
    queryFn: () => fetchRecords({ data: { kind, search } }),
  });

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by provider id…"
        className="max-w-sm"
      />
      {q.isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : (
        <Table head={head} rows={((q.data as any[]) ?? []).map(render)} />
      )}
    </div>
  );
}

function AdminBillingPage() {
  const [tab, setTab] = useState<Tab>("Overview");
  const queryClient = useQueryClient();
  const fetchConsole = useServerFn(getBillingConsole);
  const toggleProvider = useServerFn(setBillingProviderEnabled);
  const saveSettings = useServerFn(updateBillingSettings);
  const savePrice = useServerFn(upsertPlanPrice);
  const removePrice = useServerFn(deletePlanPrice);
  const retryHook = useServerFn(retryBillingWebhook);

  const fetchReadiness = useServerFn(getBillingReadiness);
  const fetchChecklist = useServerFn(getBillingTestChecklist);
  const q = useQuery({ queryKey: ["admin-billing"], queryFn: () => fetchConsole() });
  const readinessQ = useQuery({
    queryKey: ["admin-billing-readiness"],
    queryFn: () => fetchReadiness(),
  });
  const checklistQ = useQuery({
    queryKey: ["admin-billing-checklist"],
    queryFn: () => fetchChecklist(),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-billing"] });
    queryClient.invalidateQueries({ queryKey: ["admin-billing-records"] });
    queryClient.invalidateQueries({ queryKey: ["admin-billing-readiness"] });
    queryClient.invalidateQueries({ queryKey: ["admin-billing-checklist"] });
  };

  const providerMutation = useMutation({
    mutationFn: (v: { provider: any; environment: any; enabled: boolean }) =>
      toggleProvider({ data: v }),
    onSuccess: () => {
      toast.success("Provider updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settingsMutation = useMutation({
    mutationFn: (v: any) => saveSettings({ data: v }),
    onSuccess: () => {
      toast.success("Billing settings saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const priceMutation = useMutation({
    mutationFn: (v: any) => savePrice({ data: v }),
    onSuccess: () => {
      toast.success("Price mapping saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removePrice({ data: { id } }),
    onSuccess: () => {
      toast.success("Mapping removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retryHook({ data: { id } }),
    onSuccess: () => {
      toast.success("Event reprocessed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Billing</h2>
          <p className="text-sm text-muted-foreground">
            Providers, plans, subscriptions and payment events.
          </p>
        </div>
        <Badge variant={d.settings.environment === "live" ? "default" : "secondary"}>
          {d.settings.environment === "live" ? "Live mode" : "Test mode"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border/60">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-2 text-sm transition-colors ${
              tab === t
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="surface-card p-5">
            <div className="text-2xl font-bold">{formatMoney(d.stats.mrrCents)}</div>
            <div className="text-sm text-muted-foreground">MRR</div>
          </div>
          <div className="surface-card p-5">
            <div className="text-2xl font-bold">{d.stats.activeSubscriptions}</div>
            <div className="text-sm text-muted-foreground">Active subscriptions</div>
          </div>
          <div className="surface-card p-5">
            <div className="text-2xl font-bold">{formatMoney(d.stats.revenue30Cents)}</div>
            <div className="text-sm text-muted-foreground">Net revenue (30d)</div>
          </div>
          <div className="surface-card p-5">
            <div className="text-2xl font-bold">{d.stats.failedWebhooks}</div>
            <div className="text-sm text-muted-foreground">
              Failed webhooks · last {when(d.stats.lastWebhookAt)}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "Providers" ? (
        <Table
          head={["Provider", "Environment", "Credentials", "Plan IDs", "Last webhook", "Last error", "Enabled"]}
          rows={d.providers.map((p) => [
            <span className="font-medium">{PROVIDER_LABELS[p.provider]}</span>,
            p.environment,
            p.configured ? (
              <Badge variant="secondary">Configured</Badge>
            ) : (
              <Badge variant="outline">Missing keys</Badge>
            ),
            (() => {
              const r = (readinessQ.data as any[] | undefined)?.find(
                (x: any) => x.provider === p.provider && x.environment === p.environment,
              );
              return r?.planIdsOk ? (
                <Badge variant="secondary">Complete</Badge>
              ) : (
                <Badge variant="outline">Incomplete</Badge>
              );
            })(),
            when(p.lastWebhookAt),
            <span className="text-xs text-muted-foreground">{p.lastError ?? "—"}</span>,
            <Switch
              checked={p.enabled}
              disabled={
                providerMutation.isPending ||
                (!p.enabled &&
                  !(readinessQ.data as any[] | undefined)?.find(
                    (r: any) => r.provider === p.provider && r.environment === p.environment,
                  )?.ready)
              }
              onCheckedChange={(enabled) =>
                providerMutation.mutate({
                  provider: p.provider,
                  environment: p.environment,
                  enabled,
                })
              }
            />,
          ])}
        />
      ) : null}

      {tab === "Setup wizard" ? (
        readinessQ.isLoading ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        ) : readinessQ.error ? (
          <p className="text-sm text-destructive">{(readinessQ.error as Error).message}</p>
        ) : (
          <BillingProviderWizard
            readiness={readinessQ.data as any}
            appOrigin={typeof window === "undefined" ? "" : window.location.origin}
            savingPrice={priceMutation.isPending}
            togglingProvider={providerMutation.isPending}
            onSavePrice={(v) => priceMutation.mutate(v)}
            onToggleProvider={(v) => providerMutation.mutate(v)}
          />
        )
      ) : null}

      {tab === "Testing" ? (
        checklistQ.isLoading ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        ) : checklistQ.error ? (
          <p className="text-sm text-destructive">{(checklistQ.error as Error).message}</p>
        ) : (
          <BillingTestChecklist data={checklistQ.data as any} />
        )
      ) : null}

      {tab === "Plans & prices" ? (
        <PlanPrices
          plans={d.plans}
          prices={d.prices}
          onSave={(v) => priceMutation.mutate(v)}
          onDelete={(id) => deleteMutation.mutate(id)}
          saving={priceMutation.isPending}
        />
      ) : null}

      {tab === "Subscriptions" ? (
        <RecordsTab
          kind="subscriptions"
          head={["Workspace", "Plan", "Provider", "Status", "Amount", "Renews", "Provider ID"]}
          render={(r) => [
            r.workspaces?.name ?? "—",
            r.plans?.name ?? "—",
            `${PROVIDER_LABELS[r.provider as keyof typeof PROVIDER_LABELS]} · ${r.environment}`,
            <Badge variant="secondary">
              {STATE_LABELS[r.status as keyof typeof STATE_LABELS] ?? r.status}
            </Badge>,
            `${formatMoney(r.amount_cents, r.currency)} / ${r.billing_interval}`,
            when(r.current_period_end),
            <span className="font-mono text-xs">{r.external_subscription_id}</span>,
          ]}
        />
      ) : null}

      {tab === "Transactions" ? (
        <RecordsTab
          kind="transactions"
          head={["Workspace", "Provider", "Kind", "Amount", "Status", "When", "Provider ID"]}
          render={(r) => [
            r.workspaces?.name ?? "—",
            `${r.provider} · ${r.environment}`,
            r.kind,
            formatMoney(r.amount_cents, r.currency),
            r.status,
            when(r.occurred_at),
            <span className="font-mono text-xs">{r.external_transaction_id}</span>,
          ]}
        />
      ) : null}

      {tab === "Invoices" ? (
        <RecordsTab
          kind="invoices"
          head={["Workspace", "Number", "Amount", "Status", "Issued", "Links"]}
          render={(r) => [
            r.workspaces?.name ?? "—",
            r.number ?? r.external_invoice_id,
            formatMoney(r.amount_cents, r.currency),
            r.status,
            when(r.issued_at),
            <div className="flex gap-2 text-xs">
              {r.hosted_url ? (
                <a className="underline" href={r.hosted_url} target="_blank" rel="noreferrer">
                  View
                </a>
              ) : null}
              {r.pdf_url ? (
                <a className="underline" href={r.pdf_url} target="_blank" rel="noreferrer">
                  PDF
                </a>
              ) : null}
            </div>,
          ]}
        />
      ) : null}

      {tab === "Webhooks" ? (
        <RecordsTab
          kind="webhooks"
          head={["Provider", "Event", "Signature", "Status", "Received", "Error", ""]}
          render={(r) => [
            `${r.provider} · ${r.environment}`,
            <div>
              <div>{r.event_type ?? "—"}</div>
              <div className="font-mono text-xs text-muted-foreground">{r.event_id}</div>
            </div>,
            r.signature_ok ? (
              <Badge variant="secondary">Verified</Badge>
            ) : (
              <Badge variant="destructive">Invalid</Badge>
            ),
            r.status,
            when(r.received_at),
            <span className="text-xs text-destructive">{r.error ?? "—"}</span>,
            r.signature_ok ? (
              <Button
                size="sm"
                variant="outline"
                disabled={retryMutation.isPending}
                onClick={() => retryMutation.mutate(r.id)}
              >
                <RefreshCw className="size-3.5" /> Retry
              </Button>
            ) : null,
          ]}
        />
      ) : null}

      {tab === "Audit log" ? (
        <RecordsTab
          kind="audit"
          head={["When", "Action", "Provider", "Detail"]}
          render={(r) => [
            when(r.created_at),
            <span className="font-medium">{r.action}</span>,
            r.provider ? `${r.provider} · ${r.environment ?? ""}` : "—",
            <span className="font-mono text-xs text-muted-foreground">
              {JSON.stringify(r.detail ?? {})}
            </span>,
          ]}
        />
      ) : null}

      {tab === "Settings" ? (
        <div className="surface-card max-w-xl space-y-5 p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Active environment</label>
            <Select
              value={d.settings.environment}
              onValueChange={(environment) => settingsMutation.mutate({ environment })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Checkout, entitlements and dashboards read the active environment only.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Dunning grace period (days)</label>
            <Input
              type="number"
              min={0}
              max={90}
              defaultValue={d.settings.graceDays}
              onBlur={(e) => settingsMutation.mutate({ graceDays: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              Access is retained for this long after a failed payment.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Default checkout provider</label>
            <Select
              value={d.settings.defaultProvider ?? "none"}
              onValueChange={(v) =>
                settingsMutation.mutate({ defaultProvider: v === "none" ? null : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preference</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="paddle">Paddle</SelectItem>
                <SelectItem value="lemonsqueezy">Lemon Squeezy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {settingsMutation.isPending ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Saving…
            </p>
          ) : null}
          <div className="rounded-lg border border-border/60 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Webhook endpoints</p>
            <p className="mt-1 font-mono">/api/public/billing/stripe</p>
            <p className="font-mono">/api/public/billing/paddle</p>
            <p className="font-mono">/api/public/billing/lemonsqueezy</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlanPrices({
  plans,
  prices,
  onSave,
  onDelete,
  saving,
}: {
  plans: any[];
  prices: any[];
  onSave: (v: any) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    planId: plans[0]?.id ?? "",
    provider: "stripe",
    environment: "test",
    interval: "monthly",
    externalPriceId: "",
  });
  const queryClient = useQueryClient();
  const runSync = useServerFn(syncStripeCatalogue);
  const syncMutation = useMutation({
    mutationFn: (environment: "test" | "live") => runSync({ data: { environment } }),
    onSuccess: (res: any) => {
      const created = res.plans.filter((p: any) => p.action === "created").length;
      toast.success(
        `Stripe ${res.environment} catalogue synced — ${created} price(s) created, ${res.plans.length - created} reused`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-billing"] });
      queryClient.invalidateQueries({ queryKey: ["admin-billing-readiness"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Stripe sync failed"),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.filter(p => p.billing_type === "lifetime").sort((a, b) => a.one_time_price - b.one_time_price).map(plan => (
          <LifetimePriceEditor key={`${plan.id}-${prices.filter(p => p.plan_id === plan.id).map(p => p.external_price_id).join()}`} plan={plan} prices={prices} onSave={onSave} saving={saving} />
        ))}
      </div>
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm font-medium">Auto-create Stripe prices</p>
          <p className="text-xs text-muted-foreground">
            Creates recurring Stripe prices. Lifetime offers use the separately saved Price IDs below and are never changed by sync.
          </p>
        </div>
        <div className="flex gap-2">
          {(["test", "live"] as const).map((env) => (
            <Button
              key={env}
              variant={env === "test" ? "default" : "outline"}
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate(env)}
            >
              {syncMutation.isPending && syncMutation.variables === env ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Sync {env}
            </Button>
          ))}
        </div>
      </div>

      <div className="surface-card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6">

        <Select value={form.planId} onValueChange={(planId) => setForm((f) => ({ ...f, planId, interval: plans.find(p => p.id === planId)?.billing_type === "lifetime" ? "lifetime" : "monthly", provider: plans.find(p => p.id === planId)?.billing_type === "lifetime" ? "stripe" : f.provider }))}>
          <SelectTrigger>
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={form.provider} onValueChange={(provider) => setForm((f) => ({ ...f, provider }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stripe">Stripe</SelectItem>
            <SelectItem value="paddle">Paddle</SelectItem>
            <SelectItem value="lemonsqueezy">Lemon Squeezy</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={form.environment}
          onValueChange={(environment) => setForm((f) => ({ ...f, environment }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Test</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
        <Select value={form.interval} onValueChange={(interval) => setForm((f) => ({ ...f, interval }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
            <SelectItem value="lifetime">Lifetime (one-time)</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={form.externalPriceId}
          onChange={(e) => setForm((f) => ({ ...f, externalPriceId: e.target.value }))}
          placeholder="price_… / variant id"
        />
        <Button
          disabled={saving || !form.planId || !form.externalPriceId}
          onClick={() => {
            onSave(form);
            setForm((f) => ({ ...f, externalPriceId: "" }));
          }}
        >
          Save mapping
        </Button>
      </div>

      <Table
        head={["Plan", "Provider", "Environment", "Interval", "Price ID", ""]}
        rows={prices.map((p) => [
          plans.find((pl) => pl.id === p.plan_id)?.name ?? "—",
          PROVIDER_LABELS[p.provider as keyof typeof PROVIDER_LABELS],
          p.environment,
          p.billing_interval,
          <span className="font-mono text-xs">{p.external_price_id}</span>,
          <Button size="sm" variant="ghost" onClick={() => onDelete(p.id)}>
            Remove
          </Button>,
        ])}
      />
    </div>
  );
}

function LifetimePriceEditor({ plan, prices, onSave, saving }: { plan: any; prices: any[]; onSave: (value: any) => void; saving: boolean }) {
  const [environment, setEnvironment] = useState<"test" | "live">("live");
  const mapping = prices.find(p => p.plan_id === plan.id && p.provider === "stripe" && p.environment === environment && p.billing_interval === "lifetime");
  const [values, setValues] = useState<Record<string, string>>({});
  const priceId = values[environment] ?? mapping?.external_price_id ?? "";
  return <section className="surface-card space-y-3 p-5">
    <h3 className="font-semibold">{plan.name}</h3>
    <p className="text-sm text-muted-foreground">{formatMoney(plan.one_time_price ?? 0)} once · {plan.max_leads?.toLocaleString()} contacts · {plan.max_emails_monthly?.toLocaleString()} emails/month</p>
    <Select value={environment} onValueChange={value => setEnvironment(value as "test" | "live")}><SelectTrigger aria-label={`${plan.name} Stripe environment`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="test">Test</SelectItem><SelectItem value="live">Live</SelectItem></SelectContent></Select>
    <label htmlFor={`lifetime-price-${plan.id}`} className="block text-sm font-medium">Stripe Lifetime Price ID</label>
    <Input id={`lifetime-price-${plan.id}`} value={priceId} onChange={e => setValues(v => ({ ...v, [environment]: e.target.value }))} placeholder="price_…" />
    <Button disabled={saving || !priceId.trim()} onClick={() => onSave({ planId: plan.id, provider: "stripe", environment, interval: "lifetime", externalPriceId: priceId.trim(), currency: "usd" })}>Save {plan.name} Price ID</Button>
  </section>;
}
