import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AdminShell } from "@/components/app/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { categoryLabel } from "@/lib/integrations-catalog";
import {
  adminListIntegrationEvents,
  adminListIntegrations,
  adminUpdateIntegration,
} from "@/lib/integrations-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/integrations")({
  head: () => ({
    meta: [
      { title: "Admin Integrations — MunchReach" },
      {
        name: "description",
        content:
          "Enable or disable MunchReach integrations globally, gate them behind paid plans and monitor delivery failures.",
      },
      { property: "og:title", content: "Admin Integrations — MunchReach" },
      {
        property: "og:description",
        content: "Global integration controls, adoption and failure monitoring.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminIntegrationsPage,
});

function AdminIntegrationsPage() {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(adminListIntegrations);
  const fetchEvents = useServerFn(adminListIntegrationEvents);
  const update = useServerFn(adminUpdateIntegration);

  const list = useQuery({ queryKey: ["admin-integrations"], queryFn: () => fetchList() });
  const events = useQuery({
    queryKey: ["admin-integration-events"],
    queryFn: () => fetchEvents(),
  });

  const mutation = useMutation({
    mutationFn: (input: { slug: string; isEnabled?: boolean; requiresPaidPlan?: boolean }) =>
      update({ data: input }),
    onSuccess: async () => {
      toast.success("Integration updated");
      await queryClient.invalidateQueries({ queryKey: ["admin-integrations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AdminShell
      title="Integrations"
      description="Global availability, plan gating and delivery health for every integration"
    >
      <div className="space-y-8">
        <div className="overflow-hidden rounded-xl border border-border/70">
          {list.isLoading ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Integration</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Connections</th>
                  <th className="px-4 py-2 font-medium">24h events</th>
                  <th className="px-4 py-2 font-medium">Paid only</th>
                  <th className="px-4 py-2 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((row) => (
                  <tr key={row.slug} className="border-t border-border/60">
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.tagline}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {categoryLabel(row.category)}
                    </td>
                    <td className="px-4 py-3">
                      {row.connections}
                      {row.errored > 0 ? (
                        <Badge variant="destructive" className="ml-2">
                          {row.errored} failing
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {row.events24h}
                      {row.failures24h > 0 ? (
                        <span className="ml-2 text-xs text-destructive">
                          {row.failures24h} failed
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={row.requiresPaidPlan}
                        onCheckedChange={(next) =>
                          mutation.mutate({ slug: row.slug, requiresPaidPlan: next })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={row.isEnabled}
                        onCheckedChange={(next) => mutation.mutate({ slug: row.slug, isEnabled: next })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h2 className="text-base font-semibold">Latest integration events</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-border/70">
            {(events.data ?? []).length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No events recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Workspace</th>
                    <th className="px-4 py-2 font-medium">Integration</th>
                    <th className="px-4 py-2 font-medium">Event</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {(events.data ?? []).map((e) => (
                    <tr key={e.id} className="border-t border-border/60">
                      <td className="px-4 py-2">{e.workspaceName}</td>
                      <td className="px-4 py-2">{e.slug}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {e.eventType} ({e.direction})
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={e.status === "success" ? "secondary" : "destructive"}>
                          {e.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
