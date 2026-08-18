import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getSystemAnalytics } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const fetchAnalytics = useServerFn(getSystemAnalytics);
  const q = useQuery({ queryKey: ["admin-analytics"], queryFn: () => fetchAnalytics() });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">System settings</h2>
        <p className="text-sm text-muted-foreground">
          Platform-level configuration for managed sending.
        </p>
      </div>

      <div className="surface-card space-y-4 p-6 text-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Managed sending mode</p>
            <p className="text-muted-foreground">
              Customers never connect their own providers. All sending routes through the
              Sendloop pool.
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Enabled
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
          <div>
            <p className="font-medium">Credential encryption</p>
            <p className="text-muted-foreground">
              Provider credentials are encrypted server-side (AES-256-GCM) and never returned to
              the browser.
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Active
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
          <div>
            <p className="font-medium">Configured providers</p>
            <p className="text-muted-foreground">
              Manage routing priority and capacity per provider.
            </p>
          </div>
          <Link to="/admin/providers" className="text-primary underline-offset-4 hover:underline">
            {q.data ? `${q.data.providers.length} providers` : "Manage"}
          </Link>
        </div>
      </div>
    </div>
  );
}
