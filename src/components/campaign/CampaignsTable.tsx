import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Trash2,
  Archive,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  CAMPAIGN_STATUS_STYLES,
  type CampaignOverviewRow,
} from "@/lib/campaign-overview";
import { DailyLimitPopover } from "@/components/campaign/DailyLimitPopover";
import { CategoryPopover } from "@/components/campaign/CategoryPopover";

type SortKey = "name" | "leads" | "openRate" | "replies" | "reached" | "sent" | "status";

const PAGE_SIZE = 10;

const numberFmt = new Intl.NumberFormat("en-US");

function SortButton({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 whitespace-nowrap font-medium transition-colors hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"} ${className ?? ""}`}
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : null}
    </button>
  );
}

export function CampaignsTable({
  rows,
  onSetStatus,
  onDuplicate,
  onDelete,
  onBulkAction,
  bulkBusy,
  busyId,
}: {
  rows: CampaignOverviewRow[];
  onSetStatus: (id: string, status: "active" | "paused" | "archived") => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onBulkAction?: (
    action: "pause" | "resume" | "duplicate" | "archive" | "delete",
    ids: string[],
  ) => void | Promise<void>;
  bulkBusy?: boolean;
  busyId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("sent");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (status !== "all" && r.displayStatus !== status) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.account?.from_email ?? "").toLowerCase().includes(q)
      );
    });
    const factor = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * factor;
      if (sortKey === "status") return a.displayStatus.localeCompare(b.displayStatus) * factor;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * factor;
    });
  }, [rows, query, status, sortKey, dir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const paged = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const visibleIds = paged.map((r) => r.id);
  const selectedSet = new Set(selected);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const toggleRow = (id: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  const toggleAllVisible = (checked: boolean) =>
    setSelected((prev) =>
      checked
        ? [...new Set([...prev, ...visibleIds])]
        : prev.filter((id) => !visibleIds.includes(id)),
    );
  const runBulk = async (
    action: "pause" | "resume" | "duplicate" | "archive" | "delete",
  ) => {
    if (!onBulkAction || selected.length === 0) return;
    await onBulkAction(action, selected);
    setSelected([]);
  };

  const onSort = (key: SortKey) => {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir(key === "name" || key === "status" ? "asc" : "desc");
    }
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search campaigns, categories or mailboxes"
          className="min-w-0 sm:max-w-xs"
          aria-label="Search campaigns"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <p className="col-span-2 text-xs text-muted-foreground sm:ml-auto">
          {filtered.length} of {rows.length} campaigns
        </p>
      </div>

      {onBulkAction && selected.length > 0 ? (
        <div className="surface-card flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulk("resume")}>
              Resume
            </Button>
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulk("pause")}>
              Pause
            </Button>
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulk("duplicate")}>
              Duplicate
            </Button>
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulk("archive")}>
              Archive
            </Button>
            <Button size="sm" variant="destructive" disabled={bulkBusy} onClick={() => runBulk("delete")}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="surface-card overflow-x-auto">
        <Table className="min-w-[960px] table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {onBulkAction ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(v) => toggleAllVisible(v === true)}
                    aria-label="Select all campaigns on this page"
                  />
                </TableHead>
              ) : null}
              <TableHead className="w-[35%]">
                <SortButton label="Campaign Name" sortKey="name" active={sortKey === "name"} dir={dir} onSort={onSort} />
              </TableHead>
              <TableHead className="w-[15%]">
                <SortButton label="Progress" sortKey="sent" active={sortKey === "sent"} dir={dir} onSort={onSort} />
              </TableHead>
              <TableHead className="w-[8%] text-right">
                <SortButton label="Leads" sortKey="leads" active={sortKey === "leads"} dir={dir} onSort={onSort} />
              </TableHead>
              <TableHead className="w-[8%] text-right">
                <SortButton label="Opened" sortKey="openRate" active={sortKey === "openRate"} dir={dir} onSort={onSort} />
              </TableHead>
              <TableHead className="w-[8%] text-right">
                <SortButton label="Replied" sortKey="replies" active={sortKey === "replies"} dir={dir} onSort={onSort} />
              </TableHead>
              <TableHead className="w-[8%] text-right">
                <SortButton label="Delivered" sortKey="reached" active={sortKey === "reached"} dir={dir} onSort={onSort} />
              </TableHead>
              <TableHead className="w-[9%] pl-6">
                <SortButton label="Status" sortKey="status" active={sortKey === "status"} dir={dir} onSort={onSort} />
              </TableHead>
              <TableHead className="w-[9%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((row) => {
              const paused = row.displayStatus === "paused";
              const pct =
                row.leads > 0 ? Math.min(100, Math.round((row.sent / row.leads) * 100)) : 0;
              const created = row.createdAt ? new Date(row.createdAt) : null;
              return (
                <TableRow
                  key={row.id}
                  className={`transition-colors hover:bg-muted/40 ${busyId === row.id ? "opacity-60" : ""}`}
                >
                  {onBulkAction ? (
                    <TableCell>
                      <Checkbox
                        checked={selectedSet.has(row.id)}
                        onCheckedChange={(v) => toggleRow(row.id, v === true)}
                        aria-label={`Select ${row.name}`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="min-w-0">
                    <Link
                      to="/campaigns/$campaignId"
                      params={{ campaignId: row.id }}
                      className="block truncate font-semibold text-foreground hover:text-primary"
                    >
                      {row.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      <CategoryPopover campaignId={row.id} category={row.category} />
                      {created && !Number.isNaN(created.getTime())
                        ? ` · Created ${created.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div
                      className="space-y-1"
                      title={
                        row.leads > 0
                          ? `${numberFmt.format(row.sent)} emails sent to ${numberFmt.format(row.leads)} leads`
                          : "No leads added yet"
                      }
                    >
                      <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                        <span className="font-semibold text-foreground">{pct}%</span>
                        <span className="text-muted-foreground">
                          {numberFmt.format(row.sent)} / {numberFmt.format(row.leads)}
                        </span>
                      </div>
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${row.name} progress`}
                      >
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{numberFmt.format(row.leads)}</TableCell>
                  <TableCell
                    className="text-right tabular-nums"
                    title={`${numberFmt.format(row.opened)} opened · ${numberFmt.format(row.reached)} confirmed delivered`}
                  >
                    {row.openRate.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{numberFmt.format(row.replies)}</TableCell>
                  <TableCell
                    className="text-right tabular-nums"
                    title="Emails accepted for sending minus confirmed bounces"
                  >
                    {numberFmt.format(row.reached)}
                  </TableCell>
                  <TableCell className="pl-6">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${CAMPAIGN_STATUS_STYLES[row.displayStatus]}`}
                    >
                      {row.displayStatus}
                    </span>
                  </TableCell>
<TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <DailyLimitPopover row={row} />
                      <Button variant="outline" size="icon" asChild title="Analytics">
                        <Link to="/campaigns/$campaignId" params={{ campaignId: row.id }}>
                          <BarChart3 className="size-4" />
                          <span className="sr-only">Analytics for {row.name}</span>
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" title="More actions">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">More actions for {row.name}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem asChild>
                            <Link to="/campaigns/$campaignId" params={{ campaignId: row.id }}>
                              <Pencil className="mr-2 size-4" /> Open / Edit
                            </Link>
                          </DropdownMenuItem>
                          {paused ? (
                            <DropdownMenuItem onClick={() => onSetStatus(row.id, "active")}>
                              <Play className="mr-2 size-4" /> Resume
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => onSetStatus(row.id, "paused")}
                              disabled={row.displayStatus === "draft"}
                            >
                              <Pause className="mr-2 size-4" /> Pause
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => onDuplicate(row.id)}>
                            <Copy className="mr-2 size-4" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onSetStatus(row.id, "archived")}
                            disabled={row.displayStatus === "archived"}
                          >
                            <Archive className="mr-2 size-4" /> Archive
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDelete(row.id)}
                          >
                            <Trash2 className="mr-2 size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={onBulkAction ? 9 : 8} className="py-10 text-center text-sm text-muted-foreground">
                  No campaigns match this search.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {current + 1} of {pageCount}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <ChevronLeft className="mr-1 size-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Next <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
