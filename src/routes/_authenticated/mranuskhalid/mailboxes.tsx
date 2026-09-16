import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Inbox,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  ServerCog,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AdminPageHeader,
  EmptyState,
  FilterBar,
  FilterSelect,
  LoadingRows,
  Pill,
  num,
  type Tone,
} from "@/components/app/admin/OutreachUI";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { MicrosoftMark } from "@/components/campaign/MailboxTypeBadge";
import {
  adminListCustomerMailboxes,
  type AdminMailboxRow,
} from "@/lib/admin-mailboxes.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/mailboxes")({
  head: () => ({
    meta: [
      { title: "Mailboxes — MunchReach Admin" },
      {
        name: "description",
        content:
          "Read-only overview of every mailbox connected by every customer, with provider type, status, daily limit and warmup state.",
      },
    ],
  }),
  component: AdminMailboxesPage,
});

/**
 * The shared FilterSelect already renders its own "all" entry, so these option
 * lists must NOT repeat it — that is what produced "All statusesAll statuses".
 */
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "connected", label: "Connected" },
  { value: "failed", label: "Failed" },
];

const PROVIDER_OPTIONS = [
  { value: "Gmail", label: "Gmail" },
  { value: "Outlook", label: "Microsoft / Outlook" },
  { value: "IMAP/SMTP", label: "IMAP / SMTP" },
];

/** Connected → green, pending → amber, failed → red, paused → neutral. */
function statusTone(row: AdminMailboxRow): Tone {
  if (row.status === "failed") return "bad";
  if (row.status === "connected") return row.is_active ? "good" : "muted";
  return "warn";
}

function statusLabel(row: AdminMailboxRow): string {
  if (row.status === "connected" && !row.is_active) return "disabled";
  return row.status;
}

/** "Sep 16, 2026" on one line and "07:08 AM" underneath. */
function dateParts(value: string | null): { day: string; time: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

function ProviderCell({ type }: { type: AdminMailboxRow["provider_type"] }) {
  if (type === "Gmail") {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <GoogleIcon className="size-4" />
        Gmail
      </span>
    );
  }
  if (type === "Outlook") {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <MicrosoftMark className="size-4" />
        Microsoft / Outlook
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <ServerCog className="size-4 text-muted-foreground" />
      IMAP / SMTP
    </span>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{num(value)}</p>
    </div>
  );
}

function AdminMailboxesPage() {
  const listMailboxes = useServerFn(adminListCustomerMailboxes);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("all");
  const [workspace, setWorkspace] = useState("all");
  const [openRow, setOpenRow] = useState<AdminMailboxRow | null>(null);

  // One read of the real table; every filter below narrows that same data, so
  // the summary always reflects the whole picture rather than the filtered view.
  const mailboxesQuery = useQuery({
    queryKey: ["admin", "customer-mailboxes"],
    queryFn: () => listMailboxes({ data: {} }),
  });

  const all = (mailboxesQuery.data ?? []) as AdminMailboxRow[];

  const summary = useMemo(
    () => ({
      total: all.length,
      connected: all.filter((row) => row.status === "connected").length,
      pending: all.filter((row) => row.status === "pending").length,
      failed: all.filter((row) => row.status === "failed").length,
      warmup: all.filter((row) => row.warmup_enabled).length,
    }),
    [all],
  );

  const workspaceOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of all) seen.set(row.workspace_id, row.workspace_name);
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [all]);

  const term = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      all.filter((row) => {
        if (status !== "all" && row.status !== status) return false;
        if (provider !== "all" && row.provider_type !== provider) return false;
        if (workspace !== "all" && row.workspace_id !== workspace) return false;
        if (
          term &&
          !row.email_address.toLowerCase().includes(term) &&
          !(row.display_name ?? "").toLowerCase().includes(term) &&
          !row.workspace_name.toLowerCase().includes(term)
        ) {
          return false;
        }
        return true;
      }),
    [all, status, provider, workspace, term],
  );

  const filtersActive =
    term !== "" || status !== "all" || provider !== "all" || workspace !== "all";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Mailboxes"
        description="Every mailbox connected by a customer through the mailbox connection flow. Read-only: passwords are never shown and nothing can be changed from here."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void mailboxesQuery.refetch()}
            disabled={mailboxesQuery.isFetching}
          >
            {mailboxesQuery.isFetching ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <SummaryCard label="Total mailboxes" value={summary.total} />
        <SummaryCard label="Connected" value={summary.connected} />
        <SummaryCard label="Pending" value={summary.pending} />
        <SummaryCard label="Failed / error" value={summary.failed} />
        <SummaryCard label="Warmup active" value={summary.warmup} />
      </div>

      <FilterBar>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search mailbox, name or workspace"
            className="h-9 pl-9"
            aria-label="Search mailboxes"
          />
        </div>
        <FilterSelect
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          allLabel="All statuses"
        />
        <FilterSelect
          value={provider}
          onChange={setProvider}
          options={PROVIDER_OPTIONS}
          allLabel="All providers"
          width="w-52"
        />
        {workspaceOptions.length > 1 ? (
          <FilterSelect
            value={workspace}
            onChange={setWorkspace}
            options={workspaceOptions}
            allLabel="All workspaces"
            width="w-56"
          />
        ) : null}
        <span className="text-sm text-muted-foreground">
          {num(rows.length)} of {num(all.length)} mailboxes
        </span>
      </FilterBar>

      {mailboxesQuery.isLoading ? (
        <LoadingRows />
      ) : mailboxesQuery.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium">Mailboxes could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {(mailboxesQuery.error as Error).message}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void mailboxesQuery.refetch()}
          >
            <RefreshCw className="mr-2 size-4" />
            Retry
          </Button>
        </div>
      ) : all.length === 0 ? (
        <EmptyState message="No mailboxes connected yet" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm font-medium">No mailboxes match these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different search term or clear the filters.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSearch("");
              setStatus("all");
              setProvider("all");
              setWorkspace("all");
            }}
            disabled={!filtersActive}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Mailbox</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right whitespace-nowrap">Daily limit</TableHead>
                <TableHead>Warmup</TableHead>
                <TableHead className="whitespace-nowrap">Last tested</TableHead>
                <TableHead className="w-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const tested = dateParts(row.last_tested_at);
                return (
                  <TableRow key={row.id} className="align-top">
                    <TableCell className="max-w-[180px] truncate font-medium">
                      {row.workspace_name}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <button
                        type="button"
                        onClick={() => setOpenRow(row)}
                        className="block max-w-full truncate text-left text-sm font-medium hover:underline"
                      >
                        {row.email_address}
                      </button>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.display_name ?? row.provider_type}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <ProviderCell type={row.provider_type} />
                    </TableCell>
                    <TableCell>
                      <Pill tone={statusTone(row)}>{statusLabel(row)}</Pill>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {row.daily_send_limit === null ? "—" : `${num(row.daily_send_limit)}/day`}
                    </TableCell>
                    <TableCell>
                      <Pill tone={row.warmup_enabled ? "info" : "muted"}>
                        {row.warmup_enabled ? "active" : "inactive"}
                      </Pill>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {tested ? (
                        <>
                          <span className="block">{tested.day}</span>
                          <span className="block text-xs text-muted-foreground">{tested.time}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Never tested</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${row.email_address}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="truncate">
                            {row.email_address}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setOpenRow(row)}>
                            <Inbox className="mr-2 size-4" />
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to="/mranuskhalid/workspaces">
                              <Building2 className="mr-2 size-4" />
                              View workspaces
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <MailboxDetailSheet row={openRow} onClose={() => setOpenRow(null)} />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="max-w-[60%] break-words text-right text-sm">{value}</span>
    </div>
  );
}

/**
 * Read-only detail panel. It shows connection shape only — hostnames, ports and
 * transport security — and never any password, token or encrypted credential.
 */
function MailboxDetailSheet({
  row,
  onClose,
}: {
  row: AdminMailboxRow | null;
  onClose: () => void;
}) {
  const tested = dateParts(row?.last_tested_at ?? null);
  const created = dateParts(row?.created_at ?? null);

  return (
    <Sheet open={row !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {row ? (
          <>
            <SheetHeader>
              <SheetTitle className="truncate">{row.email_address}</SheetTitle>
              <SheetDescription>
                {row.workspace_name} · read-only view. No credentials are stored on this screen.
              </SheetDescription>
            </SheetHeader>

            <div className="py-4">
              <DetailRow label="Email address" value={row.email_address} />
              <DetailRow label="Display name" value={row.display_name ?? "Not set"} />
              <DetailRow label="Workspace" value={row.workspace_name} />
              <DetailRow label="Mailbox type" value={<ProviderCell type={row.provider_type} />} />
              <DetailRow
                label="Connection status"
                value={<Pill tone={statusTone(row)}>{statusLabel(row)}</Pill>}
              />
              <DetailRow
                label="Daily limit"
                value={
                  row.daily_send_limit === null ? "Not set" : `${num(row.daily_send_limit)}/day`
                }
              />
              <DetailRow
                label="Warmup"
                value={
                  <Pill tone={row.warmup_enabled ? "info" : "muted"}>
                    {row.warmup_enabled ? "active" : "inactive"}
                  </Pill>
                }
              />
              <DetailRow
                label="Last tested"
                value={tested ? `${tested.day}, ${tested.time}` : "Never tested"}
              />
              <DetailRow
                label="Created"
                value={created ? `${created.day}, ${created.time}` : "Unknown"}
              />
              <DetailRow
                label="Outgoing server"
                value={
                  row.smtp_host
                    ? `${row.smtp_host}:${row.smtp_port ?? "—"}${row.smtp_secure ? " (secure)" : ""}`
                    : "Not saved"
                }
              />
              <DetailRow
                label="Incoming server"
                value={
                  row.imap_host
                    ? `${row.imap_host}:${row.imap_port ?? "—"}${row.imap_secure ? " (secure)" : ""}`
                    : "Not saved"
                }
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Passwords, tokens and any other authentication data are held separately and are never
              readable from the admin panel.
            </p>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
