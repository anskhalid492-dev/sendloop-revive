import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/app/AppShell";
import { getMyWorkspaces } from "@/lib/workspaces.functions";

export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — Sendloop" },
      { name: "description", content: "Workspace details, teammates and roles in Sendloop." },
      { property: "og:title", content: "Workspace — Sendloop" },
      { property: "og:description", content: "Workspace details, teammates and roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const fetchWorkspaces = useServerFn(getMyWorkspaces);
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => fetchWorkspaces() });

  return (
    <AppShell title="Workspace" description="Your workspaces and roles">
      <div className="mx-auto max-w-4xl space-y-4">
        {workspaces.isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
        ) : (
          (workspaces.data ?? []).map((w) => (
            <div key={w.id} className="surface-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{w.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">/{w.slug}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary">
                  {w.role}
                </span>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Outreach type: {w.outreach_type ?? "Not set"}
              </p>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
