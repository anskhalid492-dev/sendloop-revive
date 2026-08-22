import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Building2, Search } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WorkspacePlanPanel } from "@/components/admin/WorkspacePlanPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  adminGetWorkspace,
  adminListWorkspaces,
  adminSetWorkspaceSuspended,
  type AdminWorkspaceRow,
} from "@/lib/admin-directory.functions";

export const Route = createFileRoute("/_authenticated/admin/workspaces")({
  head: () => ({
    meta: [
      { title: "Workspaces — MunchReach Admin" },
      {
        name: "description",
        content:
          "Every customer workspace with owner, members, plan, usage and suspension controls.",
      },
    ],
  }),
  component: AdminWorkspacesPage,
});

const PAGE_SIZE = 25;
type SortKey = "name" | "members" | "campaigns" | "createdAt";

function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function money(cents: number | null, currency: string | null) {
  if (cents === null || cents === undefined) return "No data";
  return `${(cents / 100).toFixed(2)} ${(currency ?? "usd").toUpperCase()}`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
        status === "suspended"
          ? "bg-destructive/10 text-destructive"
          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      }`}
    >
      {status}
    </span>
  );
}

function AdminWorkspacesPage() {
  const queryClient = useQueryClient();
  const fetchWorkspaces = useServerFn(adminListWorkspaces);
  const setSuspended = useServerFn(adminSetWorkspaceSuspended);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [subStatus, setSubStatus] = useState("all");
  const [sort, setSort] = useState<SortKey>("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminWorkspaceRow | null>(null);

  const wsQuery = useQuery({
    queryKey: ["admin", "workspaces", "directory"],
    queryFn: () => fetchWorkspaces(),
  });

  const suspendMutation = useMutation({
    mutationFn: (vars: { id: string; suspended: boolean }) => setSuspended({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.suspended ? "Workspace suspended" : "Workspace reactivated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = wsQuery.data ?? [];
  const plans = useMemo(
    () => Array.from(new Set(all.map((w) => w.planName).filter(Boolean))) as string[],
    [all],
  );
  const subStatuses = useMemo(
    () => Array.from(new Set(all.map((w) => w.subscriptionStatus).filter(Boolean))) as string[],
    [all],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = all.filter((w) => {
      if (term) {
        const hay = `${w.name} ${w.slug} ${w.ownerName ?? ""} ${w.ownerEmail ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (status !== "all" && w.status !== status) return false;
      if (plan !== "all" && w.planName !== plan) return false;
      if (subStatus !== "all" && w.subscriptionStatus !== subStatus) return false;
      return true;
    });
    const factor = dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "number" && typeof bv === "number") return factor * (av - bv);
      return factor * String(av ?? "").localeCompare(String(bv ?? ""));
    });
  }, [all, search, status, plan, subStatus, sort, dir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function SortButton({ label, sortKey }: { label: string; sortKey: SortKey }) {
    return (
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => {
          if (sort === sortKey) setDir(dir === "asc" ? "desc" : "asc");
          else {
            setSort(sortKey);
            setDir("asc");
          }
          setPage(0);
        }}
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
      <div>
        <h2 className="text-xl font-bold">Workspaces</h2>
        <p className="text-sm text-muted-foreground">
          {wsQuery.isLoading ? "Loading workspaces…" : `${filtered.length} of ${all.length} tenants`}
        </p>
      </div>

      <div className="surface-card grid gap-3 p-4 md:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search workspace or owner"
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
            <SelectItem value="suspended">Suspended</SelectItem>
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
          value={subStatus}
          onValueChange={(v) => {
            setSubStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Subscription" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subscriptions</SelectItem>
            {subStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {wsQuery.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : wsQuery.error ? (
        <div className="surface-card p-6">
          <p className="text-sm text-destructive">{(wsQuery.error as Error).message}</p>
          <Button className="mt-4" variant="outline" onClick={() => wsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card flex flex-col items-center p-12 text-center">
          <Building2 className="size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No workspaces match these filters</p>
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortButton label="Workspace" sortKey="name" />
                </TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>
                  <SortButton label="Members" sortKey="members" />
                </TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>
                  <SortButton label="Campaigns" sortKey="campaigns" />
                </TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead>
                  <SortButton label="Created" sortKey="createdAt" />
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground">/{w.slug}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {w.ownerName ?? w.ownerEmail ?? "—"}
                  </TableCell>
                  <TableCell>{w.members}</TableCell>
                  <TableCell className="text-xs">{w.planName ?? "No data"}</TableCell>
                  <TableCell className="text-xs">
                    {w.subscriptionStatus ? (
                      <Badge variant="outline" className="capitalize">
                        {w.subscriptionStatus}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">No data</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">No data</TableCell>
                  <TableCell>{w.campaigns}</TableCell>
                  <TableCell>{w.sendingAccounts}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmt(w.createdAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={w.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setOpenId(w.id)}>
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant={w.status === "suspended" ? "secondary" : "ghost"}
                        onClick={() => setConfirm(w)}
                      >
                        {w.status === "suspended" ? "Reactivate" : "Suspend"}
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

      <WorkspaceDetailSheet workspaceId={openId} onClose={() => setOpenId(null)} />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.status === "suspended" ? "Reactivate workspace?" : "Suspend workspace?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.status === "suspended"
                ? `${confirm?.name} returns to normal operation.`
                : `${confirm?.name} will be flagged as suspended for staff and billing review. No data is deleted.`}
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

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value === null || value === "" ? "No data" : value}</p>
    </div>
  );
}

function WorkspaceDetailSheet({
  workspaceId,
  onClose,
}: {
  workspaceId: string | null;
  onClose: () => void;
}) {
  const fetchWorkspace = useServerFn(adminGetWorkspace);
  const query = useQuery({
    queryKey: ["admin", "workspace", workspaceId],
    queryFn: () => fetchWorkspace({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });
  const w = query.data;

  return (
    <Sheet open={Boolean(workspaceId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{w?.name ?? "Workspace"}</SheetTitle>
        </SheetHeader>

        {query.isLoading ? (
          <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
        ) : query.error ? (
          <p className="mt-6 text-sm text-destructive">{(query.error as Error).message}</p>
        ) : w ? (
          <Tabs defaultValue="overview" className="mt-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="usage">Usage</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Slug" value={`/${w.slug}`} />
              <Field label="Status" value={w.status} />
              <Field label="Owner" value={w.ownerName ?? w.ownerEmail} />
              <Field label="Company" value={w.companyName} />
              <Field label="Members" value={w.members} />
              <Field label="Created" value={fmt(w.createdAt)} />
              <Field label="Plan" value={w.planName} />
              <Field label="Subscription" value={w.subscriptionStatus} />
              <Field label="Credit balance" value={null} />
              <Field label="Timezone" value={w.timezone} />
              {w.status === "suspended" ? (
                <div className="col-span-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  Suspended {fmt(w.suspendedAt)} — {w.suspendedReason ?? "no reason recorded"}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="members" className="mt-4">
              {w.memberList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {w.memberList.map((m) => (
                      <TableRow key={m.userId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-7">
                              {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt="" /> : null}
                              <AvatarFallback className="text-[10px]">
                                {(m.name ?? m.email ?? "?").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-sm font-medium">{m.name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">{m.email ?? "—"}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs capitalize">{m.role}</TableCell>
                        <TableCell className="text-xs capitalize">{m.status}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmt(m.joinedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="usage" className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Emails sent" value={w.usage.emailsSent} />
              <Field label="Campaigns" value={w.usage.campaigns} />
              <Field label="Leads" value={w.usage.leads} />
              <Field label="Sending accounts" value={w.usage.sendingAccounts} />
              <Field label="Mailboxes in warmup" value={w.usage.warmupAccounts} />
              <Field label="Credits used" value={null} />
            </TabsContent>

            <TabsContent value="billing" className="mt-4 space-y-5">
              <WorkspacePlanPanel workspaceId={w.id} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Current plan" value={w.subscription?.planName ?? w.planName} />
                <Field label="Status" value={w.subscription?.status ?? null} />
                <Field label="Interval" value={w.subscription?.interval ?? null} />
                <Field
                  label="Amount"
                  value={money(w.subscription?.amountCents ?? null, w.subscription?.currency ?? null)}
                />
                <Field label="Renews" value={fmt(w.subscription?.currentPeriodEnd ?? null)} />
                <Field label="Provider" value={w.subscription?.provider ?? null} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Invoices</h3>
                {w.invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invoices.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {w.invoices.map((i) => (
                      <li key={i.id} className="flex justify-between border-b py-1 last:border-0">
                        <span>{i.number ?? i.id.slice(0, 8)}</span>
                        <span className="text-xs text-muted-foreground">
                          {money(i.amountCents, i.currency)} · {i.status} · {fmt(i.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Payments</h3>
                {w.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments recorded.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {w.transactions.map((t) => (
                      <li key={t.id} className="flex justify-between border-b py-1 last:border-0">
                        <span className="capitalize">
                          {t.kind} · {t.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {money(t.amountCents, t.currency)} · {fmt(t.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              {w.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recorded activity.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {w.activity.map((a) => (
                    <li key={a.id} className="flex justify-between gap-3 border-b py-1 last:border-0">
                      <span className="truncate">
                        <span className="font-medium">{a.type}</span>
                        {a.detail ? ` — ${a.detail}` : ""}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmt(a.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
