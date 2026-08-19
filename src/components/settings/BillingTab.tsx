import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getBillingOverview } from "@/lib/settings.functions";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

function UsageRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
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
  const fetchBilling = useServerFn(getBillingOverview);
  const query = useQuery({
    queryKey: ["billing-overview", workspaceId],
    queryFn: () => fetchBilling({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

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
          <div>
            <h2 className="text-base font-semibold">{billing.planName}</h2>
            <p className="text-sm text-muted-foreground">
              Status: {billing.status} · payment {billing.paymentStatus} ·{" "}
              {billing.billingInterval}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">
              {billing.monthlyPriceCents !== null
                ? `$${(billing.monthlyPriceCents / 100).toFixed(0)}`
                : "—"}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
          </div>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p className="text-muted-foreground">
            Renews: <span className="text-foreground">{formatDate(billing.renewsAt)}</span>
          </p>
          <p className="text-muted-foreground">
            Trial ends: <span className="text-foreground">{formatDate(billing.trialEndsAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/billing">Upgrade plan</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/billing">Manage subscription</Link>
          </Button>
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
    </div>
  );
}
