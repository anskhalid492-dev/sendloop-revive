import { createFileRoute, isRedirect, Link, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";

import { AdminShell } from "@/components/app/AdminShell";
import { AdminMfaGate } from "@/components/admin/AdminMfaGate";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { getAdminIdentity } from "@/lib/admin-dashboard.functions";
import { getAdminSecurityIdentity } from "@/lib/admin-security.functions";

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
          This area is restricted to MunchReach staff.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </AppShell>
  );
}

function AdminLayout() {
  // Server-verified MFA state. Privileged server functions reject AAL1
  // sessions independently; this only decides what the UI shows.
  const loadIdentity = useServerFn(getAdminSecurityIdentity);
  const identity = useQuery({
    queryKey: ["admin-security-identity"],
    queryFn: () => loadIdentity({}),
    retry: false,
  });

  const mfa = (identity.data as any)?.mfa as
    | { enrolled: boolean; satisfied: boolean }
    | null
    | undefined;

  if (identity.isError) return <AdminDenied />;

  if (mfa && !mfa.satisfied) {
    return (
      <AdminShell title="Admin" description="MunchReach platform administration">
        <AdminMfaGate enrolled={mfa.enrolled} onSatisfied={() => identity.refetch()} />
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Admin" description="MunchReach platform administration">
      <Outlet />
    </AdminShell>
  );
}
