import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listPlatformCampaigns } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/campaigns")({
  component: AdminCampaignsPage,
});

function AdminCampaignsPage() {
  const fetchCampaigns = useServerFn(listPlatformCampaigns);
  const campaigns = useQuery({ queryKey: ["admin-campaigns"], queryFn: () => fetchCampaigns() });

  if (campaigns.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (campaigns.error)
    return <p className="text-sm text-destructive">{(campaigns.error as Error).message}</p>;

  const rows = campaigns.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Campaigns</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} campaigns across every customer workspace.
        </p>
      </div>
      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Workspace</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Daily cap</th>
              <th className="px-4 py-3">Launched</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.workspaceName}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium capitalize text-primary">
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.daily_cap}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {c.launched_at ? new Date(c.launched_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No campaigns yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
