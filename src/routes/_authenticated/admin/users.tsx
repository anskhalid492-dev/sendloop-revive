import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listPlatformUsers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const fetchUsers = useServerFn(listPlatformUsers);
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers() });

  if (users.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (users.error)
    return <p className="text-sm text-destructive">{(users.error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Users</h2>
        <p className="text-sm text-muted-foreground">
          {(users.data ?? []).length} accounts across all workspaces.
        </p>
      </div>
      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Platform role</th>
              <th className="px-4 py-3">Workspaces</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{u.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      u.platformRole === "admin"
                        ? "rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {u.platformRole}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {u.workspaces.length === 0
                    ? "—"
                    : u.workspaces.map((w) => `${w.name} (${w.role})`).join(", ")}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
