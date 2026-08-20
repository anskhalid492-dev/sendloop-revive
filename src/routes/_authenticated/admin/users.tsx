import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Search, ShieldOff, ShieldCheck, Users2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminGetUser,
  adminListUsers,
  adminSetUserSuspended,
  type AdminUserRow,
} from "@/lib/admin-directory.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Sendloop Admin" },
      {
        name: "description",
        content: "Search, filter and manage every Sendloop account across all workspaces.",
      },
    ],
  }),
  component: AdminUsersPage,
});

const PAGE_SIZE = 25;
type SortKey = "fullName" | "email" | "createdAt" | "lastActivityAt";

function initials(name: string | null, email: string | null) {
  const base = name ?? email ?? "?";
  return base.slice(0, 2).toUpperCase();
}

function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "suspended"
      ? "bg-destructive/10 text-destructive"
      : status === "invited"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${tone}`}>
      {status}
    </span>
  );
}

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const fetchUsers = useServerFn(adminListUsers);
  const setSuspended = useServerFn(adminSetUserSuspended);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [plan, setPlan] = useState("all");
  const [workspace, setWorkspace] = useState("all");
  const [sort, setSort] = useState<SortKey>("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminUserRow | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => fetchUsers(),
  });

  const suspendMutation = useMutation({
    mutationFn: (vars: { id: string; suspended: boolean }) => setSuspended({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.suspended ? "User suspended" : "User reactivated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "user"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = usersQuery.data ?? [];

  const plans = useMemo(
    () => Array.from(new Set(all.map((u) => u.planName).filter(Boolean))) as string[],
    [all],
  );
  const workspaces = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of all) for (const w of u.workspaces) map.set(w.id, w.name);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [all]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = all.filter((u) => {
      if (term) {
        const hay = `${u.fullName ?? ""} ${u.email ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (status !== "all" && u.status !== status) return false;
      if (role !== "all") {
        if (role === "customer" ? u.platformRole !== null : u.platformRole !== role) return false;
      }
      if (plan !== "all" && u.planName !== plan) return false;
      if (workspace !== "all" && !u.workspaces.some((w) => w.id === workspace)) return false;
      return true;
    });
    const factor = dir === "asc" ? 1 : -1;
    return rows.sort(
      (a, b) => factor * String(a[sort] ?? "").localeCompare(String(b[sort] ?? "")),
    );
  }, [all, search, status, role, plan, workspace, sort, dir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setDir("asc");
    }
    setPage(0);
  }

  function SortButton({ label, sortKey }: { label: string; sortKey: SortKey }) {
    return (
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => toggleSort(sortKey)}
      >
        {label}
        {sort === sortKey ? (
          dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Users</h2>
          <p className="text-sm text-muted-foreground">
            {usersQuery.isLoading
              ? "Loading accounts…"
              : `${filtered.length} of ${all.length} accounts`}
          </p>
        </div>
      </div>

      <div className="surface-card grid gap-3 p-4 md:grid-cols-5">
        <div className="relative md:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search name or email"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="invited">Pending confirmation</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Platform admin</SelectItem>
            <SelectItem value="support">Support</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={plan}
          onValueChange={(v) => {
            setPlan(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {plans.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={workspace}
          onValueChange={(v) => {
            setWorkspace(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Workspace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workspaces</SelectItem>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {usersQuery.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : usersQuery.error ? (
        <div className="surface-card p-6">
          <p className="text-sm text-destructive">{(usersQuery.error as Error).message}</p>
          <Button className="mt-4" variant="outline" onClick={() => usersQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card flex flex-col items-center p-12 text-center">
          <Users2 className="size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No users match these filters</p>
          <p className="text-xs text-muted-foreground">Adjust the search or filters above.</p>
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortButton label="User" sortKey="fullName" />
                </TableHead>
                <TableHead>
                  <SortButton label="Email" sortKey="email" />
                </TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <SortButton label="Created" sortKey="createdAt" />
                </TableHead>
                <TableHead>
                  <SortButton label="Last activity" sortKey="lastActivityAt" />
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt="" /> : null}
                        <AvatarFallback className="text-xs">
                          {initials(u.fullName, u.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{u.fullName ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.email ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.workspaces.length === 0
                      ? "—"
                      : u.workspaces.length === 1
                        ? u.workspaces[0].name
                        : `${u.workspaces[0].name} +${u.workspaces.length - 1}`}
                  </TableCell>
                  <TableCell className="text-xs">
                    {u.platformRole ? (
                      <Badge variant="outline" className="capitalize">
                        {u.platformRole}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        {u.workspaces[0]?.role ?? "customer"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.planName ?? "No data"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={u.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmt(u.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmt(u.lastActivityAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setOpenUserId(u.id)}>
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant={u.status === "suspended" ? "secondary" : "ghost"}
                        onClick={() => setConfirm(u)}
                      >
                        {u.status === "suspended" ? (
                          <ShieldCheck className="size-4" />
                        ) : (
                          <ShieldOff className="size-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {filtered.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {current + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <UserDetailSheet userId={openUserId} onClose={() => setOpenUserId(null)} />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.status === "suspended" ? "Reactivate account?" : "Suspend account?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.status === "suspended"
                ? `${confirm?.email} will be able to sign in again immediately.`
                : `${confirm?.email} will be signed out and blocked from signing in until reactivated. Their data is untouched.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                suspendMutation.mutate({
                  id: confirm.id,
                  suspended: confirm.status !== "suspended",
                });
                setConfirm(null);
              }}
            >
              {confirm?.status === "suspended" ? "Reactivate" : "Suspend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? "No data"}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function UserDetailSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const fetchUser = useServerFn(adminGetUser);
  const query = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => fetchUser({ data: { userId: userId! } }),
    enabled: Boolean(userId),
  });
  const u = query.data;

  return (
    <Sheet open={Boolean(userId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{u?.fullName ?? u?.email ?? "User"}</SheetTitle>
        </SheetHeader>

        {query.isLoading ? (
          <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
        ) : query.error ? (
          <p className="mt-6 text-sm text-destructive">{(query.error as Error).message}</p>
        ) : u ? (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" value={u.email} />
              <Field label="Status" value={u.status} />
              <Field label="Platform role" value={u.platformRole ?? "Customer"} />
              <Field label="Sign-in method" value={u.provider} />
              <Field label="Created" value={fmt(u.createdAt)} />
              <Field label="Last sign-in" value={fmt(u.lastSignInAt)} />
              <Field label="Timezone" value={u.timezone} />
              <Field label="Credit balance" value={null} />
            </div>

            <Section title="Workspace memberships">
              {u.workspaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workspaces.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {u.workspaces.map((w) => (
                    <li key={w.id} className="flex justify-between rounded-md border p-2">
                      <span>{w.name}</span>
                      <span className="text-xs capitalize text-muted-foreground">{w.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Subscription">
              <p className="text-sm">
                {u.planName ? `${u.planName} · ${u.subscriptionStatus ?? "unknown"}` : "No data"}
              </p>
            </Section>

            <Section title="Recent activity">
              {u.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recorded activity.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {u.activity.map((a) => (
                    <li key={a.id} className="flex justify-between gap-3 border-b py-1 last:border-0">
                      <span className="truncate">{a.detail ?? a.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmt(a.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Recent campaigns">
              {u.campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No campaigns created.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {u.campaigns.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3 border-b py-1 last:border-0">
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 text-xs capitalize text-muted-foreground">
                        {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Support tickets">
              {u.tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tickets.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {u.tickets.map((t) => (
                    <li key={t.id} className="flex justify-between gap-3 border-b py-1 last:border-0">
                      <span className="truncate">{t.subject}</span>
                      <span className="shrink-0 text-xs capitalize text-muted-foreground">
                        {t.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Billing history">
              {u.billing.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {u.billing.map((b) => (
                    <li key={b.id} className="flex justify-between gap-3 border-b py-1 last:border-0">
                      <span className="capitalize">
                        {b.kind} · {b.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(b.amountCents / 100).toFixed(2)} {b.currency.toUpperCase()} ·{" "}
                        {fmt(b.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
