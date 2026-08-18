import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/app/AppShell";
import { listLeads } from "@/lib/leads.functions";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM — Sendloop" },
      {
        name: "description",
        content: "Track every prospect through your pipeline stages inside Sendloop.",
      },
      { property: "og:title", content: "CRM — Sendloop" },
      { property: "og:description", content: "Pipeline stages for every prospect." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CrmPage,
});

const stages = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "won", label: "Won" },
];

function CrmPage() {
  const fetchLeads = useServerFn(listLeads);
  const leads = useQuery({ queryKey: ["crm-leads"], queryFn: () => fetchLeads({ data: { pageSize: 200 } }) });

  const rows = leads.data?.rows ?? [];

  return (
    <AppShell title="CRM" description="Pipeline view of every prospect">
      <div className="mx-auto max-w-6xl">
        {leads.isLoading ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            {stages.map((stage) => {
              const items = rows.filter(
                (l) => (l.status ?? "new").toLowerCase() === stage.key,
              );
              return (
                <div key={stage.key} className="surface-card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{stage.label}</h3>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {items.slice(0, 25).map((lead) => (
                      <div key={lead.id} className="rounded-lg border border-border/60 p-3">
                        <p className="truncate text-sm font-medium">
                          {[lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
                            lead.email}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {lead.company ?? lead.email}
                        </p>
                      </div>
                    ))}
                    {items.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">Empty</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
