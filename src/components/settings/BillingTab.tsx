import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney, PROVIDER_LABELS, STATE_LABELS } from "@/lib/billing/model";
import type { BillingInterval, BillingProvider } from "@/lib/billing/model";
import {
  cancelSubscription,
  getCustomerBilling,
  listCheckoutProviders,
  openBillingPortal,
  resumeSubscription,
  startCheckout,
} from "@/lib/billing.functions";
import { getPlans } from "@/lib/plans.functions";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  return (
    <div className="space-y-1.5 py-3">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {used.toLocaleString()}
          {limit ? ` / ${limit.toLocaleString()}` : ""}
        </span>
      </div>
      {pct !== null ? <Progress value={pct} /> : null}
    </div>
  );
}

export function BillingTab({ workspaceId }: { workspaceId: string | null }) {
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [provider, setProvider] = useState<BillingProvider | "">("");

  const fetchBilling = useServerFn(getCustomerBilling);
  const fetchProviders = useServerFn(listCheckoutProviders);
  const fetchPlans = useServerFn(getPlans);
  const checkout = useServerFn(startCheckout);
  const portal = useServerFn(openBillingPortal);
  const cancel = useServerFn(cancelSubscription);
  const resume = useServerFn(resumeSubscription);

  const query = useQuery({
    queryKey: ["billing-overview", workspaceId],
    queryFn: () => fetchBilling({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });
  const providersQuery = useQuery({
    queryKey: ["billing-providers"],
    queryFn: () => fetchProviders(),
  });
  const plansQuery = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["billing-overview"] });

  const checkoutMutation = useMutation({
    mutationFn: (planId: string) =>
      checkout({
        data: {
          workspaceId: workspaceId!,
          planId,
          interval,
          provider: (provider ||
            available[0]?.provider ||
            "stripe") as BillingProvider,
        },
      }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const portalMutation = useMutation({
    mutationFn: () =>
      portal({ data: { workspaceId: workspaceId!, returnUrl: window.location.href } }),
    onSuccess: (r) => {
      if (r.url) window.location.href = r.url;
      else toast.info("Your provider does not offer a self-serve portal. Contact support.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancel({ data: { workspaceId: workspaceId! } }),
    onSuccess: () => {
      toast.success("Cancellation scheduled for the end of the period");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resume({ data: { workspaceId: workspaceId! } }),
    onSuccess: () => {
      toast.success("Subscription resumed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const available = (providersQuery.data ?? []).filter((p) => p.available);

  if (!workspaceId) {
    return (
      <div className="surface-card p-6 text-sm text-muted-foreground">
        Create a workspace to see billing.
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading billing…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="surface-card p-6 text-sm text-destructive">
        {(query.error as Error)?.message || "Could not load billing information."}
      </div>
    );
  }

  const billing = query.data;

  return (
    <div className="space-y-6">
      <section className="surface-card space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{billing.planName}</h2>
              <Badge variant={billing.active ? "secondary" : "outline"}>
                {billing.grant
                  ? "Provided by MunchReach"
                  : (STATE_LABELS[billing.state as keyof typeof STATE_LABELS] ?? "No subscription")}
              </Badge>
              {billing.environment === "test" ? <Badge variant="outline">Test mode</Badge> : null}
            </div>
            {billing.grant ? (
              <p className="text-sm text-muted-foreground">
                {billing.grant.planName} access provided by MunchReach — no charge
                {billing.grant.expiresAt ? ` · until ${formatDate(billing.grant.expiresAt)}` : ""}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {billing.provider ? PROVIDER_LABELS[billing.provider] : "No payment method"} ·{" "}
              {billing.interval ?? "—"}
              {billing.cancelAtPeriodEnd ? " · cancels at period end" : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">
              {formatMoney(billing.amountCents, billing.currency)}
              <span className="text-sm font-normal text-muted-foreground">
                /{billing.interval === "yearly" ? "yr" : "mo"}
              </span>
            </p>
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <p className="text-muted-foreground">
            Next billing: <span className="text-foreground">{formatDate(billing.nextBillingAt)}</span>
          </p>
          <p className="text-muted-foreground">
            Trial ends: <span className="text-foreground">{formatDate(billing.trialEndsAt)}</span>
          </p>
          <p className="text-muted-foreground">
            Access until: <span className="text-foreground">{formatDate(billing.accessUntil)}</span>
          </p>
        </div>

        {billing.state === "past_due" || billing.state === "payment_failed" ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            Your last payment failed. Update your payment method to keep sending
            {billing.graceUntil ? ` — access ends ${formatDate(billing.graceUntil)}.` : "."}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {billing.canManagePaymentMethod ? (
            <Button onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
              {portalMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Manage payment & invoices
              <ExternalLink className="size-4" />
            </Button>
          ) : null}
          {billing.active && !billing.cancelAtPeriodEnd ? (
            <Button
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              Cancel subscription
            </Button>
          ) : null}
          {billing.cancelAtPeriodEnd ? (
            <Button
              variant="outline"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
            >
              Resume subscription
            </Button>
          ) : null}
        </div>
      </section>

      <section className="surface-card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Plans</h2>
          <div className="flex gap-2">
            <Select value={interval} onValueChange={(v) => setInterval(v as BillingInterval)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
            {available.length > 1 ? (
              <Select
                value={provider || available[0]!.provider}
                onValueChange={(v) => setProvider(v as BillingProvider)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {available.map((p) => (
                    <SelectItem key={p.provider} value={p.provider}>
                      {PROVIDER_LABELS[p.provider]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>

        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Online checkout is not available right now. Contact support to change your plan.
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(plansQuery.data ?? []).map((plan) => {
            const price =
              interval === "yearly" ? (plan as any).yearly_price ?? 0 : plan.monthly_price;
            const current = plan.id === billing.planId;
            return (
              <div key={plan.id} className="surface-card flex flex-col p-5">
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-1 text-2xl font-bold">
                  {formatMoney(price)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{interval === "yearly" ? "yr" : "mo"}
                  </span>
                </p>
                <ul className="mt-4 flex-1 space-y-1 text-sm text-muted-foreground">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f.id}>{f.name}</li>
                  ))}
                </ul>
                <Button
                  className="mt-4"
                  variant={current ? "outline" : "default"}
                  disabled={current || available.length === 0 || checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate(plan.id)}
                >
                  {current ? "Current plan" : `Choose ${plan.name}`}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="surface-card p-6">
        <h2 className="text-base font-semibold">Usage this month</h2>
        <div className="mt-2 divide-y divide-border/60">
          <UsageRow
            label="Emails sent"
            used={billing.usage.emailsThisMonth}
            limit={billing.limits.emailsMonthly}
          />
          <UsageRow
            label="Mailboxes"
            used={billing.usage.sendingAccounts}
            limit={billing.limits.sendingAccounts}
          />
          <UsageRow label="Contacts" used={billing.usage.leads} limit={billing.limits.leads} />
          <UsageRow
            label="Campaigns"
            used={billing.usage.campaigns}
            limit={billing.limits.campaigns}
          />
          <UsageRow label="Team members" used={billing.usage.users} limit={billing.limits.users} />
        </div>
      </section>

      <section className="surface-card overflow-x-auto">
        <div className="p-6 pb-3">
          <h2 className="text-base font-semibold">Invoices & payments</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">Description</th>
              <th className="px-6 py-3">Amount</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {billing.invoices.length === 0 && billing.transactions.length === 0 ? (
              <tr>
                <td className="px-6 py-6 text-muted-foreground" colSpan={5}>
                  No billing history yet.
                </td>
              </tr>
            ) : null}
            {billing.invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-border/40 last:border-0">
                <td className="px-6 py-3">{formatDate(inv.issued_at)}</td>
                <td className="px-6 py-3">Invoice {inv.number ?? ""}</td>
                <td className="px-6 py-3">{formatMoney(inv.amount_cents, inv.currency)}</td>
                <td className="px-6 py-3">{inv.status}</td>
                <td className="px-6 py-3 text-right">
                  {inv.hosted_url ? (
                    <a className="text-xs underline" href={inv.hosted_url} target="_blank" rel="noreferrer">
                      View
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
            {billing.transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-border/40 last:border-0">
                <td className="px-6 py-3">{formatDate(tx.occurred_at)}</td>
                <td className="px-6 py-3">{tx.description ?? tx.kind}</td>
                <td className="px-6 py-3">
                  {tx.kind === "refund" ? "-" : ""}
                  {formatMoney(tx.amount_cents, tx.currency)}
                </td>
                <td className="px-6 py-3">{tx.status}</td>
                <td className="px-6 py-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
