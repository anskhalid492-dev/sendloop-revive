import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { AdminShell } from "@/components/app/AdminShell";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <AppShell title="Admin" description="Checking permissions…">
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </AppShell>
    );
  }

  if (!isAdmin) {
    // Sidebar hiding is not the guard: every admin server function also
    // re-checks the platform admin role, and RLS restricts provider data.
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

  return (
    <AdminShell title="Admin" description="Sendloop platform administration">
      <Outlet />
    </AdminShell>
  );
}
