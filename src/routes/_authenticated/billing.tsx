import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";
import { BillingTab } from "@/components/settings/BillingTab";
import { useWorkspace } from "@/hooks/useWorkspace";

export const Route = createFileRoute("/_authenticated/billing")({
  /** `?plan=<slug>` carries the plan a visitor picked on the pricing page. */
  validateSearch: (search: Record<string, unknown>): { plan?: string } =>
    typeof search["plan"] === "string" && search["plan"].length > 0
      ? { plan: search["plan"] as string }
      : {},
  head: () => ({
    meta: [
      { title: "Billing & Upgrade — MunchReach" },
      { name: "description", content: "Manage your MunchReach subscription, plan and usage." },
      { property: "og:title", content: "Billing & Upgrade — MunchReach" },
      { property: "og:description", content: "Manage your MunchReach subscription and plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const { workspace } = useWorkspace();
  const { plan } = Route.useSearch();

  return (
    <AppShell title="Billing & Upgrade" description="Your plan, usage and invoices">
      <div className="mx-auto max-w-5xl">
        <BillingTab workspaceId={workspace?.id ?? null} highlightPlanSlug={plan ?? null} />
      </div>
    </AppShell>
  );
}
