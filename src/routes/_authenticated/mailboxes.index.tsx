import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  Loader2,
  Mail,
  MailPlus,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AuthCheckState } from "@/lib/mailbox-auth-check";
import { MAILBOX_HEALTH_CLASS, mailboxHealth } from "@/lib/mailbox-health";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { usePlanGates } from "@/hooks/usePlanGates";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/useWorkspace";
import { MailboxTypeIcon } from "@/components/campaign/MailboxTypeBadge";
import { WarmupHealthIndicator } from "@/components/mailboxes/WarmupHealthIndicator";
import { MailboxReplyToEditor } from "@/components/mailboxes/MailboxReplyToEditor";
import { WarmupSettingsDialog } from "@/components/warmup/WarmupSettingsDialog";
import { emailProviderOf } from "@/lib/mailbox-type";
import {
  checkWorkspaceMailboxDeletion,
  deleteWorkspaceMailbox,
  listWorkspaceMailboxes,
  recheckWorkspaceMailbox,
  sendWorkspaceMailboxTest,
  setMailboxWarmup,
  setWorkspaceMailboxActive,
  setWorkspaceMailboxSenderName,
  type MailboxCampaignRef,
  type MailboxDeletionCheck,
  type WorkspaceMailboxRow,
} from "@/lib/workspace-mailboxes.functions";

export const Route = createFileRoute("/_authenticated/mailboxes/")({
  validateSearch: (search: Record<string, unknown>) => ({
    mailbox: typeof search["mailbox"] === "string" ? search["mailbox"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Mailboxes — MunchReach" },
      {
        name: "description",
        content:
          "Manage the sending mailboxes connected to your MunchReach workspace: status, sending usage, warm-up and health score.",
      },
      { property: "og:title", content: "Mailboxes" },
      {
        property: "og:description",
        content: "Your connected sending accounts, warm-up, health and sending status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MailboxesPage,
});

type StatusFilter = "all" | "connected" | "pending" | "failed";
type WarmupFilter = "all" | "enabled" | "disabled";
type ActiveFilter = "all" | "active" | "inactive";

function MailboxesPage() {
  const { workspace } = useWorkspace();
  const { mailbox: requestedMailbox } = Route.useSearch();
  const workspaceId = workspace?.id ?? "";
  const queryClient = useQueryClient();
  // UX only — the server enforces both of these again on write.
  const plan = usePlanGates(workspaceId);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [warmup, setWarmup] = useState<WarmupFilter>("all");
  const [active, setActive] = useState<ActiveFilter>("all");
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const [detailsRow, setDetailsRow] = useState<WorkspaceMailboxRow | null>(null);
  const [warmupSettingsRow, setWarmupSettingsRow] = useState<WorkspaceMailboxRow | null>(null);
  const [testRow, setTestRow] = useState<WorkspaceMailboxRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<WorkspaceMailboxRow | null>(null);

  const fetchPage = useServerFn(listWorkspaceMailboxes);
  const runRecheck = useServerFn(recheckWorkspaceMailbox);
  const runWarmup = useServerFn(setMailboxWarmup);
  const runSetActive = useServerFn(setWorkspaceMailboxActive);

  const filters = { workspaceId, page, pageSize, search, status, warmup, active };
  const query = useQuery({
    queryKey: ["workspace-mailboxes", filters],
    queryFn: () => fetchPage({ data: filters }),
    enabled: Boolean(workspaceId),
    placeholderData: keepPreviousData,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["workspace-mailboxes"] });

  const recheck = useMutation({
    mutationFn: (id: string) => runRecheck({ data: { id } }),
    onSuccess: (result) => {
      if (result.ok) toast.success("Connection verified.");
      else toast.error(`SMTP: ${result.smtp.message} — IMAP: ${result.imap.message}`);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setWarmupEnabled = useMutation({
    mutationFn: (input: { ids: string[]; enabled: boolean }) => {
      if (input.enabled && !plan.warmupAllowed) {
        return Promise.reject(
          new Error(plan.warmupReason ?? "Warmup isn't available on your current plan."),
        );
      }
      return runWarmup({ data: input });
    },
    onSuccess: (_result, input) => {
      toast.success(input.enabled ? "Warm-up enabled." : "Warm-up turned off.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setActiveState = useMutation({
    mutationFn: (input: { ids: string[]; active: boolean }) => runSetActive({ data: input }),
    onSuccess: (_result, input) => {
      toast.success(
        input.active
          ? input.ids.length > 1
            ? `${input.ids.length} mailboxes reactivated.`
            : "Mailbox reactivated."
          : input.ids.length > 1
            ? `${input.ids.length} mailboxes paused.`
            : "Mailbox paused. It will not send anything until you turn it back on.",
      );
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const legacyCount = query.data?.legacyCount ?? 0;
  const summary = query.data?.summary ?? null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((row) => row.id));
  const toggleOne = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const resetPage = () => setPage(1);

  const filtersActive = useMemo(
    () => search.trim() !== "" || status !== "all" || warmup !== "all" || active !== "all",
    [search, status, warmup, active],
  );

  const busy = recheck.isPending || setWarmupEnabled.isPending || setActiveState.isPending;

  useEffect(() => {
    if (!requestedMailbox || detailsRow) return;
    const requested = rows.find((row) => row.sendingAccountId === requestedMailbox);
    if (requested) setDetailsRow(requested);
  }, [detailsRow, requestedMailbox, rows]);

  const rowActionProps = (row: WorkspaceMailboxRow) => ({
    row,
    busy,
    onRecheck: () => recheck.mutate(row.id),
    onTest: () => setTestRow(row),
    onDetails: () => setDetailsRow(row),
    onDelete: () => setDeleteRow(row),
    onWarmup: (enabled: boolean) => setWarmupEnabled.mutate({ ids: [row.id], enabled }),
    onWarmupSettings: () => setWarmupSettingsRow(row),
  });

  return (
    <AppShell
      title="Mailboxes"
      description="The mailboxes you have connected for sending: connection, sending usage, warm-up, health and the campaigns using them."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {query.isLoading || !summary ? (
              <span>Loading mailboxes…</span>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {summary.total} mailbox{summary.total === 1 ? "" : "es"}
                </span>
                <span aria-hidden>·</span>
                <span>{summary.usable} ready to send</span>
                {summary.paused > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{summary.paused} paused</span>
                  </>
                ) : null}
                {summary.pending > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{summary.pending} pending</span>
                  </>
                ) : null}
                {summary.failed > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-destructive">{summary.failed} need attention</span>
                  </>
                ) : null}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Refresh
            </Button>
            {plan.canAddMailbox ? (
              <Button asChild>
                <Link to="/mailboxes/add">
                  <MailPlus className="mr-2 size-4" />
                  Add Mailbox
                </Link>
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {plan.mailboxReason}
                </span>
                <Button asChild variant="outline">
                  <Link to="/billing">Upgrade plan</Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="Search by email or name"
              className="pl-9"
              aria-label="Search mailboxes"
            />
          </div>

          <Select
            value={active}
            onValueChange={(value) => {
              setActive(value as ActiveFilter);
              resetPage();
            }}
          >
            <SelectTrigger className="w-[150px]" aria-label="Active state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Active & paused</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Paused only</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={warmup}
            onValueChange={(value) => {
              setWarmup(value as WarmupFilter);
              resetPage();
            }}
          >
            <SelectTrigger className="w-[170px]" aria-label="Warmup status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any warmup status</SelectItem>
              <SelectItem value="enabled">Warmup on</SelectItem>
              <SelectItem value="disabled">Warmup off</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as StatusFilter);
              resetPage();
            }}
          >
            <SelectTrigger className="w-[180px]" aria-label="Mailbox status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any mailbox status</SelectItem>
              <SelectItem value="connected">Connected</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Needs attention</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value) as 25 | 50 | 100);
              resetPage();
            }}
          >
            <SelectTrigger className="w-[130px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 per page</SelectItem>
              <SelectItem value="50">50 per page</SelectItem>
              <SelectItem value="100">100 per page</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <span>{selected.length} selected</span>
            <Button
              size="sm"
              variant="outline"
              disabled={setActiveState.isPending}
              onClick={() => setActiveState.mutate({ ids: selected, active: true })}
            >
              <PlayCircle className="mr-2 size-4" />
              Activate
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={setActiveState.isPending}
              onClick={() => setActiveState.mutate({ ids: selected, active: false })}
            >
              <PauseCircle className="mr-2 size-4" />
              Pause
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={setWarmupEnabled.isPending}
              onClick={() => {
                const ids = rows
                  .filter(
                    (row) => selected.includes(row.id) && row.status === "connected" && row.isActive,
                  )
                  .map((row) => row.id);
                if (ids.length === 0) {
                  toast.error("Select at least one connected, active mailbox to warm up.");
                  return;
                }
                setWarmupEnabled.mutate({ ids, enabled: true });
              }}
            >
              <Flame className="mr-2 size-4" />
              Enable warm-up
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        ) : null}

        {legacyCount > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              {legacyCount} older sending address{legacyCount === 1 ? " is" : "es are"} on file
              without their own connection. Campaigns, replies and warm-up will hold for those until
              they are reconnected with their own email credentials.
            </p>
          </div>
        ) : null}

        {query.isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
            <p className="text-sm font-medium">Your mailboxes could not be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">{(query.error as Error).message}</p>
            <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
              <RefreshCw className="mr-2 size-4" />
              Retry
            </Button>
          </div>
        ) : query.isLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-border p-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading your mailboxes…
          </div>
        ) : rows.length === 0 && !filtersActive ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
              <MailPlus className="size-7 text-primary" />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">
              Connect Your First Mailbox
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Connect a mailbox to start sending campaigns and managing your outreach from
              MunchReach.
            </p>
            <Button asChild className="mt-6">
              <Link to="/mailboxes/add">+ Add Mailbox</Link>
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <h2 className="text-base font-semibold">No mailboxes match these filters</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Try a different search term or clear the filters.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop / tablet: full table, horizontally scrollable when narrow. */}
            <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all mailboxes on this page"
                      />
                    </TableHead>
                    <TableHead>Mailbox</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="whitespace-nowrap">Active</TableHead>
                    <TableHead>Sending</TableHead>
                    <TableHead>Warm-up</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Authentication</TableHead>
                    <TableHead>Campaigns</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.includes(row.id)}
                          onCheckedChange={() => toggleOne(row.id)}
                          aria-label={`Select ${row.email}`}
                        />
                      </TableCell>
                      <TableCell>
                        <MailboxCell row={row} onOpen={() => setDetailsRow(row)} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge row={row} />
                      </TableCell>
                      <TableCell>
                        <ActiveSwitch
                          row={row}
                          disabled={setActiveState.isPending}
                          onChange={(next) =>
                            setActiveState.mutate({ ids: [row.id], active: next })
                          }
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <SendingCell row={row} />
                      </TableCell>
                      <TableCell className="text-sm">
                        <WarmupCell row={row} />
                      </TableCell>
                      <TableCell className="text-sm">
                        <HealthCell row={row} />
                      </TableCell>
                      <TableCell>
                        <AuthCell row={row} />
                      </TableCell>
                      <TableCell>
                        <CampaignsCell row={row} onOpen={() => setDetailsRow(row)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions {...rowActionProps(row)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Narrow screens: one card per mailbox. */}
            <div className="space-y-3 lg:hidden">
              {rows.map((row) => (
                <div key={row.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <MailboxCell row={row} onOpen={() => setDetailsRow(row)} />
                    <RowActions {...rowActionProps(row)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge row={row} />
                    <AuthCell row={row} />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                    <span className="text-sm">{row.isActive ? "Active" : "Paused"}</span>
                    <ActiveSwitch
                      row={row}
                      disabled={setActiveState.isPending}
                      onChange={(next) => setActiveState.mutate({ ids: [row.id], active: next })}
                    />
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <Field label="Sending">
                      <SendingCell row={row} />
                    </Field>
                    <Field label="Warm-up">
                      <WarmupCell row={row} />
                    </Field>
                    <Field label="Health">
                      <HealthCell row={row} />
                    </Field>
                    <Field label="Campaigns">
                      <CampaignsCell row={row} onOpen={() => setDetailsRow(row)} />
                    </Field>
                  </dl>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {page} of {pageCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="mr-1 size-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount || query.isFetching}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                >
                  Next
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <WarmupSettingsDialog accountId={warmupSettingsRow?.sendingAccountId ?? null} accountEmail={warmupSettingsRow?.email ?? ""} onOpenChange={open => { if (!open) setWarmupSettingsRow(null); }} />
      <MailboxDetails
        row={detailsRow}
        onClose={() => setDetailsRow(null)}
        onTest={(row) => {
          setDetailsRow(null);
          setTestRow(row);
        }}
        onRecheck={(row) => recheck.mutate(row.id)}
        recheckBusy={recheck.isPending}
      />
      <TestEmailDialog row={testRow} onClose={() => setTestRow(null)} />
      <DeleteMailboxDialog
        row={deleteRow}
        onClose={() => setDeleteRow(null)}
        onDeleted={() => {
          setDeleteRow(null);
          setSelected([]);
          void invalidate();
        }}
      />
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function MailboxCell({ row, onOpen }: { row: WorkspaceMailboxRow; onOpen: () => void }) {
  const type = emailProviderOf(row.email);
  return (
    <div className="flex items-start gap-2">
      {type === "other" ? null : <MailboxTypeIcon type={type} />}
      <div className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          className="max-w-full truncate text-left text-sm font-medium hover:underline"
        >
          {row.email}
        </button>
        {row.displayName ? (
          <p className="truncate text-xs text-muted-foreground">{row.displayName}</p>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: WorkspaceMailboxRow }) {
  return (
    <span className="inline-flex items-center gap-2">
      <HealthDot row={row} />
      <ConnectionBadge row={row} />
    </span>
  );
}

/** Green / yellow / red at a glance, from the one shared health rule. */
function HealthDot({ row }: { row: WorkspaceMailboxRow }) {
  const health = mailboxHealth({
    status: row.status,
    isActive: row.isActive,
    authStatus: (row.authStatus as AuthCheckState | null) ?? null,
    authReason: row.authReason,
    paused: row.paused,
    pauseReason: row.warmupPauseReason,
  });
  return (
    <span
      title={`${health.label} — ${health.reason}`}
      aria-label={`${health.label}. ${health.reason}`}
      className={cn("inline-block size-2.5 shrink-0 rounded-full", MAILBOX_HEALTH_CLASS[health.colour])}
    />
  );
}

function ConnectionBadge({ row }: { row: WorkspaceMailboxRow }) {
  if (row.status === "failed") return <Badge variant="destructive">Error</Badge>;
  if (row.status === "pending") return <Badge variant="secondary">Pending</Badge>;
  if (!row.isActive) return <Badge variant="secondary">Paused</Badge>;
  if (row.paused === true) return <Badge variant="secondary">Paused</Badge>;
  if (row.customerEnabled === false) return <Badge variant="secondary">Inactive</Badge>;
  return <Badge variant="outline">Active</Badge>;
}

function ActiveSwitch({
  row,
  disabled,
  onChange,
}: {
  row: WorkspaceMailboxRow;
  disabled: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={row.isActive}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
        aria-label={row.isActive ? `Pause ${row.email}` : `Reactivate ${row.email}`}
      />
      <span className="text-xs text-muted-foreground">{row.isActive ? "Active" : "Paused"}</span>
    </div>
  );
}

function SendingCell({ row }: { row: WorkspaceMailboxRow }) {
  return (
    <div className="space-y-0.5">
      {row.hourlyLimit !== null ? (
        <p>
          {row.sentThisHour ?? 0} / {row.hourlyLimit} this hour
        </p>
      ) : (
        <p className="text-muted-foreground">Hourly usage unavailable</p>
      )}
      <p className="text-xs text-muted-foreground">
        {row.sentToday !== null
          ? `${row.sentToday} / ${row.dailyLimit ?? row.dailySendLimit} today`
          : `Daily limit ${row.dailySendLimit}`}
      </p>
    </div>
  );
}

function WarmupCell({ row }: { row: WorkspaceMailboxRow }) {
  if (row.warmupEnabled === true) {
    // Compact column: the schedule, daily target and next-day limit live in the
    // mailbox detail sheet. A system pause stays discoverable on hover.
    return (
      <Badge variant="outline" title={row.warmupPauseReason ?? undefined}>
        Enabled
      </Badge>
    );
  }
  return <span className="text-sm text-muted-foreground">Disabled</span>;
}

function HealthCell({ row }: { row: WorkspaceMailboxRow }) {
  return (
    <WarmupHealthIndicator score={row.healthScore} paused={row.warmupEnabled !== true} />
  );
}

const AUTH_LABELS: Record<string, string> = {
  pass: "passing",
  verified: "verified",
  fail: "failing",
  pending: "not verified yet",
};

function AuthCell({ row }: { row: WorkspaceMailboxRow }) {
  const items: Array<[string, string | null]> = [
    ["SPF", row.spf],
    ["DKIM", row.dkim],
    ["DMARC", row.dmarc],
    ["MX", row.mx],
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(([label, value]) => (
        <span
          key={label}
          title={`${label}: ${value ? AUTH_LABELS[value] ?? value : "not checked yet"}`}
          className={
            value === "pass" || value === "verified"
              ? "rounded border border-primary/40 px-1.5 py-0.5 text-[11px] font-medium text-primary"
              : value === "fail"
                ? "rounded border border-destructive/40 px-1.5 py-0.5 text-[11px] font-medium text-destructive"
                : "rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
          }
        >
          {label}
        </span>
      ))}
    </div>
  );
}

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

/** Keeps long campaign names readable in a narrow column; full name stays in the tooltip. */
function shortCampaignName(name: string, limit = 22): string {
  const trimmed = name.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 1).trimEnd()}…`;
}

function CampaignsCell({ row, onOpen }: { row: WorkspaceMailboxRow; onOpen: () => void }) {
  if (row.campaigns.length === 0) {
    return <span className="text-sm text-muted-foreground">Not used in any campaigns</span>;
  }
  const shown = row.campaigns.slice(0, 2);
  return (
    <div className="space-y-0.5">
      {shown.map((campaign) => (
        <Link
          key={campaign.id}
          to="/campaigns/$campaignId"
          params={{ campaignId: campaign.id }}
          title={campaign.name}
          className="block max-w-[180px] truncate text-sm hover:underline"
        >
          {shortCampaignName(campaign.name)}
        </Link>
      ))}
      {row.campaigns.length > shown.length ? (
        <button type="button" onClick={onOpen} className="text-xs text-muted-foreground hover:underline">
          +{row.campaigns.length - shown.length} more
        </button>
      ) : null}
    </div>
  );
}

function RowActions({
  row,
  busy,
  onRecheck,
  onWarmup,
  onWarmupSettings,
  onTest,
  onDetails,
  onDelete,
}: {
  row: WorkspaceMailboxRow;
  busy: boolean;
  onRecheck: () => void;
  onWarmup: (enabled: boolean) => void;
  onWarmupSettings: () => void;
  onTest: () => void;
  onDetails: () => void;
  onDelete: () => void;
}) {
  const warmupOn = row.warmupEnabled === true;
  const canSend = row.status === "connected" && row.isActive;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={busy} aria-label={`Actions for ${row.email}`}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate">{row.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            if (!canSend) {
              event.preventDefault();
              toast.error(
                row.isActive
                  ? "This mailbox is not connected yet, so a test cannot be sent. Re-check the connection first."
                  : "This mailbox is paused. Reactivate it under Mailboxes to use it.",
              );
              return;
            }
            onTest();
          }}
        >
          <Send className="mr-2 size-4" />
          Send test email
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onRecheck()}>
          <RefreshCw className="mr-2 size-4" />
          Re-check connection
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onWarmup(!warmupOn)}>
          <Flame className="mr-2 size-4" />
          {warmupOn ? "Turn warm-up off" : "Enable warm-up"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!row.sendingAccountId} onSelect={onWarmupSettings}>
            <Settings2 className="mr-2 size-4" />
            Warm-up settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDetails()}>
          <Info className="mr-2 size-4" />
          {row.campaigns.length > 0 ? "View campaigns & details" : "View mailbox details"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={() => onDelete()}>
          <Trash2 className="mr-2 size-4" />
          Delete mailbox
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function when(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

/** Lets the customer set the name recipients see next to this address. */
function SenderNameEditor({ row }: { row: WorkspaceMailboxRow }) {
  const queryClient = useQueryClient();
  const saveName = useServerFn(setWorkspaceMailboxSenderName);
  const [value, setValue] = useState(row.displayName ?? "");

  useEffect(() => {
    setValue(row.displayName ?? "");
  }, [row.id, row.displayName]);

  const save = useMutation({
    mutationFn: () => saveName({ data: { id: row.id, displayName: value.trim() } }),
    onSuccess: () => {
      toast.success("Sender name saved.");
      void queryClient.invalidateQueries({ queryKey: ["workspace-mailboxes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sender name
      </h3>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Michael Scott"
          maxLength={120}
        />
        <Button
          variant="outline"
          onClick={() => save.mutate()}
          disabled={save.isPending || value.trim() === (row.displayName ?? "")}
        >
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Shown next to {row.email} in the recipient&apos;s inbox on campaigns and replies. Leave it
        empty to send from the address alone.
      </p>
    </section>
  );
}

function MailboxDetails({
  row,
  onClose,
  onTest,
  onRecheck,
  recheckBusy,
}: {
  row: WorkspaceMailboxRow | null;
  onClose: () => void;
  onTest: (row: WorkspaceMailboxRow) => void;
  onRecheck: (row: WorkspaceMailboxRow) => void;
  recheckBusy: boolean;
}) {
  return (
    <Sheet open={row !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {row ? (
          <>
            <SheetHeader>
              <SheetTitle className="truncate">{row.email}</SheetTitle>
              <SheetDescription>
                {row.displayName ?? "No display name set"} · added {when(row.createdAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-4 text-sm">
              <SenderNameEditor row={row} />
              <MailboxReplyToEditor row={row} />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Mailbox
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge row={row} />
                  <Badge variant="outline">{row.isActive ? "Active" : "Paused"}</Badge>
                  <AuthCell row={row} />
                </div>
                <dl className="grid grid-cols-2 gap-2">
                  <Field label="Outgoing server">
                    <span className="break-all">{row.smtpHost ?? "Not saved"}</span>
                  </Field>
                  <Field label="Incoming server">
                    <span className="break-all">{row.imapHost ?? "Not saved"}</span>
                  </Field>
                  <Field label="Health">
                    <HealthCell row={row} />
                  </Field>
                  <Field label="Warm-up">
                    <WarmupCell row={row} />
                  </Field>
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Usage
                </h3>
                <dl className="grid grid-cols-2 gap-2">
                  <Field label="This hour">
                    {row.hourlyLimit !== null ? (
                      <span>
                        {row.sentThisHour ?? 0} / {row.hourlyLimit}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Hourly usage unavailable</span>
                    )}
                  </Field>
                  <Field label="Today">
                    {row.sentToday !== null ? (
                      <span>
                        {row.sentToday} / {row.dailyLimit ?? row.dailySendLimit}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not available</span>
                    )}
                  </Field>
                  <Field label="Daily limit">{row.dailyLimit ?? row.dailySendLimit}</Field>
                  <Field label="Hourly limit">{row.hourlyLimit ?? "Not set"}</Field>
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Campaigns
                </h3>
                {row.campaigns.length === 0 ? (
                  <p className="text-muted-foreground">Not used in any campaigns</p>
                ) : (
                  <ul className="space-y-1">
                    {row.campaigns.map((campaign) => (
                      <li key={campaign.id}>
                        <Link
                          to="/campaigns/$campaignId"
                          params={{ campaignId: campaign.id }}
                          className="hover:underline"
                        >
                          {campaign.name}
                        </Link>
                        <span className="text-muted-foreground">
                          {" — "}
                          {CAMPAIGN_STATUS_LABEL[campaign.status] ?? campaign.status}
                          {campaign.queued ? ` · ${campaign.queued} queued` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Activity
                </h3>
                <dl className="grid grid-cols-2 gap-2">
                  <Field label="Last successful send">{when(row.lastSentAt)}</Field>
                  <Field label="Last connection check">{when(row.lastTestedAt)}</Field>
                </dl>
                {row.status === "failed" ? (
                  <p className="text-destructive">
                    The last connection check failed. Re-check the connection to see the current
                    error.
                  </p>
                ) : null}
              </section>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => onTest(row)}
                  disabled={row.status !== "connected" || !row.isActive}
                >
                  <Send className="mr-2 size-4" />
                  Send test email
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={recheckBusy}
                  onClick={() => onRecheck(row)}
                >
                  <RefreshCw className="mr-2 size-4" />
                  Re-check connection
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TestEmailDialog({
  row,
  onClose,
}: {
  row: WorkspaceMailboxRow | null;
  onClose: () => void;
}) {
  const send = useServerFn(sendWorkspaceMailboxTest);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("MunchReach Test Email");
  const [body, setBody] = useState(
    "This is a test email sent from MunchReach to confirm this mailbox can send.",
  );

  const mutation = useMutation({
    mutationFn: (input: { id: string; to: string; subject: string; body: string }) =>
      send({ data: input }),
    onSuccess: (result) => {
      toast.success(
        result.messageId ? `Test email sent (id ${result.messageId}).` : "Test email sent.",
      );
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) {
          mutation.reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send test email</DialogTitle>
          <DialogDescription>
            Sent through <span className="font-medium">{row?.email}</span> and its own connection.
            Test emails are kept out of your campaign statistics.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="test-to">Send to</Label>
            <Input
              id="test-to"
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test-subject">Subject</Label>
            <Input
              id="test-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test-body">Message</Label>
            <Textarea
              id="test-body"
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          {mutation.isError ? (
            <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !row}
            onClick={() => {
              if (!row) return;
              if (!to.trim()) {
                toast.error("Enter an address to send the test to.");
                return;
              }
              mutation.mutate({ id: row.id, to: to.trim(), subject, body });
            }}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Mail className="mr-2 size-4" />
            )}
            {mutation.isPending ? "Sending…" : "Send test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteMailboxDialog({
  row,
  onClose,
  onDeleted,
}: {
  row: WorkspaceMailboxRow | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const check = useServerFn(checkWorkspaceMailboxDeletion);
  const remove = useServerFn(deleteWorkspaceMailbox);

  const dependencies = useQuery({
    queryKey: ["mailbox-deletion-check", row?.id],
    queryFn: () => check({ data: { id: row?.id as string } }),
    enabled: Boolean(row?.id),
  });

  const mutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (result) => {
      toast.success(`${result.email} was removed.`);
      onDeleted();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const info = (dependencies.data ?? null) as MailboxDeletionCheck | null;
  const campaigns: MailboxCampaignRef[] = info?.campaigns ?? [];

  return (
    <AlertDialog open={row !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this mailbox?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium text-foreground">{row?.email}</span> will be removed
                from your workspace and can no longer send. Your campaign history, conversations and
                warm-up records are kept — only the connection is removed. You would need to
                reconnect the mailbox with its password to use it again.
              </p>
              {dependencies.isLoading ? (
                <p className="text-muted-foreground">Checking where this mailbox is used…</p>
              ) : dependencies.isError ? (
                <p className="text-destructive">
                  {(dependencies.error as Error).message}
                </p>
              ) : info ? (
                <>
                  {campaigns.length === 0 ? (
                    <p className="text-muted-foreground">Not used in any campaigns.</p>
                  ) : (
                    <div>
                      <p className="text-muted-foreground">Used by {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}:</p>
                      <ul className="mt-1 space-y-0.5">
                        {campaigns.map((campaign) => (
                          <li key={campaign.id}>
                            {campaign.name} — {CAMPAIGN_STATUS_LABEL[campaign.status] ?? campaign.status}
                            {campaign.queued ? ` · ${campaign.queued} queued` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {info.warmupEnabled ? <p className="text-muted-foreground">Warm-up is currently on for this mailbox.</p> : null}
                  {info.conversations > 0 ? (
                    <p className="text-muted-foreground">
                      {info.conversations} inbox conversation{info.conversations === 1 ? "" : "s"} will be kept.
                    </p>
                  ) : null}
                  {info.blockedReason ? (
                    <p className="font-medium text-destructive">{info.blockedReason}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending || dependencies.isLoading || info?.canDelete !== true}
            onClick={(event) => {
              event.preventDefault();
              if (row) mutation.mutate(row.id);
            }}
          >
            {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Delete mailbox
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
