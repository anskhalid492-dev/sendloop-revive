import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ExternalLink, Check, Infinity as InfinityIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/billing/model";
import type { BillingInterval } from "@/lib/billing/model";
import {
  cancelSubscription,
  getCustomerBilling,
  listCheckoutProviders,
  openBillingPortal,
  resumeSubscription,
  startCheckout,
} from "@/lib/billing.functions";
import { isLifetimePlan, lifetimePriceCents } from "@/lib/billing/lifetime";
import { getPlans } from "@/lib/plans.functions";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

function limitLabel(limit: number | null | undefined) {
  if (limit === null || limit === undefined || limit < 0) return "Unlimited";
  return limit.toLocaleString();
}

/** Customer-friendly state label — never exposes provider or environment details. */
function customerStateLabel(state: string | null) {
  switch (state) {
    case "trialing":
      return "Trial";
    case "active":
      return "Active";
    case "past_due":
      return "Past due";
    case "payment_failed":
      return "Payment failed";
    case "paused":
      return "Paused";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return "No subscription";
  }
}

/** Status → badge variant, so every row reads the same way across the table. */
function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone =
    s === "failed" || s === "uncollectible"
      ? "bg-destructive/10 text-destructive"
      : s === "refunded"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : s === "pending" || s === "open" || s === "processing"
          ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone}`}
    >
      {status}
    </span>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const unlimited = limit === null || limit === undefined || limit < 0;
  const pct = !unlimited && limit! > 0 ? Math.min(100, Math.round((used / limit!) * 100)) : null;
  const near = pct !== null && pct >= 90;
  return (
    <div className="space-y-2 py-3.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className={near ? "text-destructive tabular-nums" : "text-muted-foreground tabular-nums"}>
          {used.toLocaleString()} <span className="opacity-60">/</span> {limitLabel(limit)}
        </span>
      </div>
      {pct !== null ? <Progress value={pct} className="h-1.5" /> : null}
    </div>
  );
}

export function BillingTab({
  workspaceId,
  highlightPlanSlug = null,
}: {
  workspaceId: string | null;
  /** Plan slug carried over from the pricing page, highlighted on arrival. */
  highlightPlanSlug?: string | null;
}) {
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const plansRef = useRef<HTMLDivElement | null>(null);

  // Arriving from the pricing page with a chosen plan: bring the plan grid into
  // view so the selection is obvious instead of buried below the usage panel.
  useEffect(() => {
    if (!highlightPlanSlug) return;
    const id = window.setTimeout(
      () => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      350,
    );
    return () => window.clearTimeout(id);
  }, [highlightPlanSlug]);

  const [confirmCancel, setConfirmCancel] = useState(false);

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
    mutationFn: (plan: { id: string; billing_type?: string | null }) =>
      checkout({
        data: {
          workspaceId: workspaceId!,
          planId: plan.id,
          interval: isLifetimePlan(plan) ? "lifetime" : interval,
          provider: (available[0]?.provider || "stripe") as import("@/lib/billing/model").BillingProvider,
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
    onSuccess: (r) => {
      setConfirmCancel(false);
      // Clicking twice must not read as a second cancellation.
      if ((r as { alreadyScheduled?: boolean })?.alreadyScheduled)
        toast.info("Cancellation already scheduled");
      else toast.success("Cancellation scheduled — your plan stays active until the period ends");
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
  /** Lifetime purchases are stored with a `lifetime` billing interval. */
  const isLifetime = billing.interval === "lifetime";
  /** No paid subscription and no lifetime purchase — free / trial-less state. */
  const hasSubscription = Boolean(billing.interval) || billing.amountCents > 0;

  const periodSuffix = billing.interval === "yearly" ? "/yr" : "/mo";
  const billingTypeLabel = isLifetime
    ? "One-time payment"
    : billing.interval === "yearly"
      ? "Annual plan"
      : billing.interval === "monthly"
        ? "Monthly plan"
        : billing.grant
          ? "Provided by MunchReach"
          : "Free plan";

  // "Never" is reserved for lifetime access. Anything else falls back to the
  // real date, or an em dash when there simply is nothing to show.
  const dateOrNever = (value: string | null) => (isLifetime ? "Never" : formatDate(value));
  const renewalLabel = isLifetime
    ? "None"
    : !hasSubscription
      ? "—"
      : billing.cancelAtPeriodEnd
        ? "Cancels at period end"
        : billing.interval === "yearly"
          ? "Renews yearly"
          : billing.interval === "monthly"
            ? "Renews monthly"
            : "—";

  return (
    <div className="space-y-8">
      {/* ---------- Current plan ---------- */}
      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{billing.planName}</h2>
              <Badge variant={billing.active ? "secondary" : "outline"}>
                {billing.grant
                  ? "Provided by MunchReach"
                  : billing.active
                    ? "Active"
                    : customerStateLabel(billing.state)}
              </Badge>
            </div>
            {billing.grant ? (
              <p className="text-sm text-muted-foreground">
                {billing.grant.planName} access provided by MunchReach — no charge
                {billing.grant.expiresAt ? ` · until ${formatDate(billing.grant.expiresAt)}` : ""}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {isLifetime
                ? "One-time payment"
                : billing.interval === "yearly"
                  ? "Annual plan"
                  : billing.interval === "monthly"
                    ? "Monthly plan"
                    : "Free plan"}
              {!isLifetime && billing.cancelAtPeriodEnd ? " · cancels at period end" : ""}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-3xl font-semibold tracking-tight">
              {formatMoney(billing.amountCents, billing.currency)}
              {hasSubscription && !isLifetime ? (
                <span className="text-sm font-normal text-muted-foreground">{periodSuffix}</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isLifetime ? "One-time payment" : hasSubscription ? billingTypeLabel : "Free plan"}
            </p>
          </div>
        </div>

        {/* Compact billing summary */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/60 bg-muted/20 px-6 py-4 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryItem label="Billing type" value={billingTypeLabel} />
          <SummaryItem label="Next billing" value={dateOrNever(billing.nextBillingAt)} />
          <SummaryItem label="Trial ends" value={dateOrNever(billing.trialEndsAt)} />
          <SummaryItem label="Access until" value={isLifetime ? "Never" : formatDate(billing.accessUntil)} />
          <SummaryItem label="Renewal" value={renewalLabel} />
        </dl>

        {isLifetime ? (
          <div className="border-t border-border/60 px-6 py-4">
            <p className="text-sm font-medium">You own this plan — lifetime access.</p>
            <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-3">
              {["No monthly renewal", "No annual renewal", "No recurring charge"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-emerald-500" /> {t}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!isLifetime && billing.cancelAtPeriodEnd ? (
          <div className="mx-6 mb-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
            <p className="font-medium">Cancellation scheduled</p>
            <p className="mt-1 text-muted-foreground">
              Your plan remains active until{" "}
              {formatDate(billing.accessUntil ?? billing.nextBillingAt)}. You won't be charged
              again.
            </p>
          </div>
        ) : null}

        {!isLifetime && (billing.state === "past_due" || billing.state === "payment_failed") ? (
          <div className="mx-6 mb-4 mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            Your last payment failed. Update your payment method to keep sending
            {billing.graceUntil ? ` — access ends ${formatDate(billing.graceUntil)}.` : "."}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-border/60 px-6 py-4">
          {billing.canManagePaymentMethod ? (
            <Button onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
              {portalMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isLifetime ? "View payment details" : "Manage payment & invoices"}
              <ExternalLink className="size-4" />
            </Button>
          ) : null}
          {/* Cancellation controls only make sense for recurring subscriptions. */}
          {!isLifetime && billing.active && !billing.cancelAtPeriodEnd && hasSubscription ? (
            <Button
              variant="outline"
              onClick={() => setConfirmCancel(true)}
              disabled={cancelMutation.isPending}
            >
              Cancel subscription
            </Button>
          ) : null}
          {!isLifetime && billing.cancelAtPeriodEnd ? (
            <Button
              variant="outline"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
            >
              {resumeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Resume subscription
            </Button>
          ) : null}
        </div>

        <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel your MunchReach subscription?</AlertDialogTitle>
              <AlertDialogDescription>
                Your subscription will remain active until the end of your current billing period
                {billing.accessUntil || billing.nextBillingAt
                  ? ` (${formatDate(billing.accessUntil ?? billing.nextBillingAt)})`
                  : ""}
                . You won't be charged again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelMutation.isPending}>
                Keep subscription
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  cancelMutation.mutate();
                }}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Cancel subscription
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      {/* ---------- Plans ---------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Plans</h2>
            <p className="text-sm text-muted-foreground">Compare limits and switch any time.</p>
          </div>
          <div className="flex gap-2">
            <Select value={interval} onValueChange={(v) => setInterval(v as BillingInterval)}>
              <SelectTrigger className="w-32">
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

        <div id="plans" ref={plansRef} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(plansQuery.data ?? [])
            .filter((plan) => !isLifetimePlan(plan) || plan.slug === highlightPlanSlug)
            .map((plan) => {
              const planIsLifetime = isLifetimePlan(plan);
              const price = planIsLifetime
                ? lifetimePriceCents(plan)
                : interval === "yearly"
                  ? ((plan as any).yearly_price ?? 0)
                  : plan.monthly_price;
              const current = plan.id === billing.planId;
              const picked = Boolean(highlightPlanSlug) && plan.slug === highlightPlanSlug;
              // Most important limits first, real values only.
              const limits = [
                { label: "emails / month", value: plan.max_emails_monthly },
                { label: "contacts", value: plan.max_leads },
                { label: "mailboxes", value: plan.max_sending_accounts },
                { label: "campaigns", value: plan.max_campaigns },
                { label: "team members", value: plan.max_users },
              ];
              return (
                <div
                  key={plan.id}
                  className={
                    "surface-card flex h-full flex-col p-5 transition-shadow hover:shadow-md" +
                    (current ? " border-primary/50" : "") +
                    (picked && !current ? " border-primary/60 ring-2 ring-primary/30" : "")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{plan.name}</h3>
                    {current ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Current
                      </Badge>
                    ) : picked ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Selected
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight">
                    {formatMoney(price)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {planIsLifetime ? " one-time" : `/${interval === "yearly" ? "yr" : "mo"}`}
                    </span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm">
                    {limits.map((l) => {
                      const unlimited = l.value === null || l.value === undefined || l.value < 0;
                      return (
                        <li key={l.label} className="flex items-start gap-2">
                          {unlimited ? (
                            <InfinityIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                          ) : (
                            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                          )}
                          <span>
                            <span className="font-medium tabular-nums">{limitLabel(l.value)}</span>{" "}
                            <span className="text-muted-foreground">{l.label}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <Button
                    className="mt-5 w-full"
                    variant={current ? "outline" : "default"}
                    disabled={current || available.length === 0 || checkoutMutation.isPending}
                    onClick={() => checkoutMutation.mutate(plan)}
                  >
                    {current
                      ? "Current plan"
                      : checkoutMutation.isPending
                        ? "Starting checkout…"
                        : planIsLifetime
                          ? "Get lifetime access"
                          : `Choose ${plan.name}`}
                  </Button>
                </div>
              );
            })}
        </div>
      </section>

      {/* ---------- Usage ---------- */}
      <section className="surface-card p-6">
        <h2 className="text-base font-semibold tracking-tight">Usage this month</h2>
        <p className="text-sm text-muted-foreground">Based on your current plan entitlements.</p>
        <div className="mt-3 divide-y divide-border/60">
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

      {/* ---------- Invoices & payments ---------- */}
      <section className="surface-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-3 pt-6">
          <h2 className="text-base font-semibold tracking-tight">Invoices &amp; payments</h2>
          <span className="text-xs text-muted-foreground">
            {billing.invoices.length + billing.transactions.length} records
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Description</th>
                <th className="px-6 py-3 font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {billing.invoices.length === 0 && billing.transactions.length === 0 ? (
                <tr>
                  <td className="px-6 py-10 text-center text-muted-foreground" colSpan={5}>
                    No billing history yet.
                  </td>
                </tr>
              ) : null}
              {billing.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border/40 last:border-0">
                  <td className="whitespace-nowrap px-6 py-3 text-muted-foreground">
                    {formatDate(inv.issued_at)}
                  </td>
                  <td className="px-6 py-3">
                    {isLifetime
                      ? "MunchReach Lifetime — One-time purchase"
                      : `Invoice ${inv.number ?? ""}`.trim()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 tabular-nums">
                    {formatMoney(inv.amount_cents, inv.currency)}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    {inv.hosted_url ? (
                      <a
                        className="text-xs text-primary hover:underline"
                        href={inv.hosted_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {billing.transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border/40 last:border-0">
                  <td className="whitespace-nowrap px-6 py-3 text-muted-foreground">
                    {formatDate(tx.occurred_at)}
                  </td>
                  <td className="px-6 py-3">
                    {isLifetime && tx.kind !== "refund"
                      ? "MunchReach Lifetime — One-time purchase"
                      : (tx.description ?? tx.kind)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 tabular-nums">
                    {tx.kind === "refund" ? "-" : ""}
                    {formatMoney(tx.amount_cents, tx.currency)}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={tx.kind === "refund" ? "refunded" : tx.status} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-xs text-muted-foreground">—</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
