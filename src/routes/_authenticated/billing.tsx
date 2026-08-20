import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { getPlans } from "@/lib/plans.functions";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing — MunchReach" },
      { name: "description", content: "Manage your MunchReach subscription, plan and usage." },
      { property: "og:title", content: "Billing — MunchReach" },
      { property: "og:description", content: "Manage your MunchReach subscription and plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const fetchPlans = useServerFn(getPlans);
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });

  return (
    <AppShell title="Billing" description="Your subscription and usage">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="surface-card p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Current plan
          </p>
          <h2 className="mt-1 text-2xl font-bold">Free trial</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upgrade any time to unlock more mailboxes, leads and monthly sending volume.
          </p>
          <Button asChild className="mt-4">
            <Link to="/pricing">View all plans</Link>
          </Button>
        </div>

        {plans.isLoading ? (
          <div className="h-52 animate-pulse rounded-xl bg-muted" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {(plans.data ?? []).map((plan) => (
              <div key={plan.id} className="surface-card flex flex-col p-5">
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-1 text-2xl font-bold">
                  ${Math.round(plan.monthly_price / 100)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f.id} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{f.name}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="mt-4">
                  <Link to="/pricing">Choose {plan.name}</Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
