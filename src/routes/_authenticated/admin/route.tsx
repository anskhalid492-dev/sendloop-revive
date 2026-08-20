import { createFileRoute, isRedirect, Link, Outlet, redirect } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { AdminShell } from "@/components/app/AdminShell";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { getAdminIdentity } from "@/lib/admin-dashboard.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  // Server-verified gate: getAdminIdentity resolves the platform role from
  // user_roles with the caller's own token. Every admin server function
  // re-checks the role, so this redirect is convenience, not the only guard.
  beforeLoad: async () => {
    try {
      const { isSuperAdmin } = await getAdminIdentity();
      if (!isSuperAdmin) throw redirect({ to: "/dashboard", replace: true });
      return { isSuperAdmin: true };
    } catch (error) {
      if (isRedirect(error)) throw error;
      throw redirect({ to: "/dashboard", replace: true });
    }
  },
  component: AdminLayout,
  errorComponent: AdminDenied,
});

function AdminDenied() {
  return (
    <AppShell title="Dashboard" description="Restricted area">
      <div className="surface-card mx-auto max-w-lg p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Admin access required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This area is restricted to Sendloop staff.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </AppShell>
  );
}

function AdminLayout() {
  return (
    <AdminShell title="Admin" description="Sendloop platform administration">
      <Outlet />
    </AdminShell>
  );
}
