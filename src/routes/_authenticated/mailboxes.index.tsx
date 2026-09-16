import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Flame,
  Loader2,
  MailPlus,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { useWorkspace } from "@/hooks/useWorkspace";
import { MailboxTypeIcon } from "@/components/campaign/MailboxTypeBadge";
import { emailProviderOf } from "@/lib/mailbox-type";
import {
  listWorkspaceMailboxes,
  recheckWorkspaceMailbox,
  type WorkspaceMailboxRow,
} from "@/lib/workspace-mailboxes.functions";
import { bulkSetWarmup } from "@/lib/warmup.functions";

export const Route = createFileRoute("/_authenticated/mailboxes/")({
  head: () => ({
    meta: [
      { title: "Mailboxes — MunchReach" },
      {
        name: "description",
        content:
          "Manage the sending mailboxes connected to your MunchReach workspace: status, sending usage, warm-up, health score and domain authentication.",
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

function MailboxesPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [warmup, setWarmup] = useState<WarmupFilter>("all");
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const fetchPage = useServerFn(listWorkspaceMailboxes);
  const runRecheck = useServerFn(recheckWorkspaceMailbox);
  const runWarmup = useServerFn(bulkSetWarmup);

  const filters = { workspaceId, page, pageSize, search, status, warmup };
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
    mutationFn: (input: { ids: string[]; enabled: boolean }) => runWarmup({ data: input }),
    onSuccess: (_result, input) => {
      toast.success(input.enabled ? "Warm-up enabled." : "Warm-up turned off.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const legacyCount = query.data?.legacyCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const toggleAll = () =>
    setSelected(allSelected ? [] : rows.map((row) => row.id));
  const toggleOne = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const resetPage = () => setPage(1);

  const filtersActive = useMemo(
    () => search.trim() !== "" || status !== "all" || warmup !== "all",
    [search, status, warmup],
  );

  return (
    <AppShell
      title="Mailboxes"
      description="Manage your connected sending accounts, warmup, health, and sending status."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {query.isLoading ? "Loading mailboxes…" : `${total} mailbox${total === 1 ? "" : "es"}`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Refresh
            </Button>
            <Button asChild>
              <Link to="/mailboxes/add">
                <MailPlus className="mr-2 size-4" />
                Add Mailbox
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="Search by email, name, or campaign"
              className="pl-9"
              aria-label="Search mailboxes"
            />
          </div>

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
            <SelectTrigger className="w-[180px]" aria-label="Account status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any account status</SelectItem>
              <SelectItem value="connected">Active</SelectItem>
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
              disabled={setWarmupEnabled.isPending}
              onClick={() => {
                const ids = rows
                  .filter((row) => selected.includes(row.id) && row.sendingAccountId)
                  .map((row) => row.sendingAccountId as string);
                if (ids.length === 0) {
                  toast.error("None of the selected mailboxes are registered for warm-up yet.");
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
            <p className="mt-1 text-sm text-muted-foreground">
              {(query.error as Error).message}
            </p>
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
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <h2 className="text-base font-semibold">
              {filtersActive ? "No mailboxes match these filters" : "No mailboxes connected yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {filtersActive
                ? "Try a different search term or clear the filters."
                : "Connect a sending mailbox to start sending campaigns from MunchReach."}
            </p>
            <Button asChild className="mt-5">
              <Link to="/mailboxes/add">
                <MailPlus className="mr-2 size-4" />
                Add Mailbox
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Desktop / tablet: full table, horizontally scrollable when narrow. */}
            <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
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
                    <TableHead>Sending</TableHead>
                    <TableHead>Warm-up</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Authentication</TableHead>
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
                        <MailboxCell row={row} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge row={row} />
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
                      <TableCell className="text-right">
                        <RowActions
                          row={row}
                          busy={recheck.isPending || setWarmupEnabled.isPending}
                          onRecheck={() => recheck.mutate(row.id)}
                          onWarmup={(enabled) =>
                            row.sendingAccountId
                              ? setWarmupEnabled.mutate({
                                  ids: [row.sendingAccountId],
                                  enabled,
                                })
                              : toast.error(
                                  "Warm-up becomes available once this mailbox is registered for sending.",
                                )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: one card per mailbox. */}
            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <div key={row.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <MailboxCell row={row} />
                    <RowActions
                      row={row}
                      busy={recheck.isPending || setWarmupEnabled.isPending}
                      onRecheck={() => recheck.mutate(row.id)}
                      onWarmup={(enabled) =>
                        row.sendingAccountId
                          ? setWarmupEnabled.mutate({ ids: [row.sendingAccountId], enabled })
                          : toast.error(
                              "Warm-up becomes available once this mailbox is registered for sending.",
                            )
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge row={row} />
                    <AuthCell row={row} />
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

function MailboxCell({ row }: { row: WorkspaceMailboxRow }) {
  const type = emailProviderOf(row.email);
  return (
    <div className="flex items-start gap-2">
      {type === "other" ? null : <MailboxTypeIcon type={type} />}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{row.email}</p>
        {row.displayName ? (
          <p className="truncate text-xs text-muted-foreground">{row.displayName}</p>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: WorkspaceMailboxRow }) {
  if (row.status === "failed") return <Badge variant="destructive">Needs attention</Badge>;
  if (row.status === "pending") return <Badge variant="secondary">Pending</Badge>;
  if (row.paused === true) return <Badge variant="secondary">Paused</Badge>;
  if (row.customerEnabled === false) return <Badge variant="secondary">Inactive</Badge>;
  return <Badge variant="outline">Active</Badge>;
}

function SendingCell({ row }: { row: WorkspaceMailboxRow }) {
  return (
    <div className="space-y-0.5">
      {row.hourlyLimit !== null ? (
        <p>
          {row.sentThisHour ?? 0} / {row.hourlyLimit} this hour
        </p>
      ) : (
        <p className="text-muted-foreground">Hourly usage not available</p>
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
  if (row.warmupEnabled === true || (row.warmupEnabled === null && row.warmupEnabledFlag)) {
    return (
      <div className="space-y-0.5">
        <Badge variant="outline">Warmup Active</Badge>
        {row.warmupDailyTarget ? (
          <p className="text-xs text-muted-foreground">{row.warmupDailyTarget}/day target</p>
        ) : null}
        {row.warmupPauseReason ? (
          <p className="text-xs text-muted-foreground">{row.warmupPauseReason}</p>
        ) : null}
      </div>
    );
  }
  return <span className="text-sm text-muted-foreground">Off</span>;
}

function HealthCell({ row }: { row: WorkspaceMailboxRow }) {
  if (row.healthScore === null) {
    return <span className="text-sm text-muted-foreground">Not scored yet</span>;
  }
  return <span className="text-sm font-medium">{row.healthScore}</span>;
}

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
          title={value ? `${label}: ${value}` : `${label}: not checked`}
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

function RowActions({
  row,
  busy,
  onRecheck,
  onWarmup,
}: {
  row: WorkspaceMailboxRow;
  busy: boolean;
  onRecheck: () => void;
  onWarmup: (enabled: boolean) => void;
}) {
  const warmupOn = row.warmupEnabled === true;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={busy} aria-label={`Actions for ${row.email}`}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{row.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onRecheck()}>
          <RefreshCw className="mr-2 size-4" />
          Re-check connection
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onWarmup(!warmupOn)}>
          <Flame className="mr-2 size-4" />
          {warmupOn ? "Turn warm-up off" : "Enable warm-up"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/warmup">
            <Settings2 className="mr-2 size-4" />
            Warm-up settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
