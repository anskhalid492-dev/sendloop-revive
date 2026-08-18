import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  LEAD_COLUMNS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_STYLES,
  leadLocation,
  leadName,
  type LeadColumnId,
  type LeadRow,
} from "@/lib/lead-model";

const SORT_MAP: Partial<Record<LeadColumnId, string>> = {
  name: "first_name",
  email: "email",
  company: "company",
  job_title: "job_title",
  status: "status",
  last_activity_at: "last_activity_at",
  created_at: "created_at",
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function LeadTable({
  rows,
  total,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  selected,
  onSelectedChange,
  sortBy,
  sortDir,
  onSort,
  page,
  pageSize,
  onPageChange,
  onOpenLead,
  emptyHint,
}: {
  rows: LeadRow[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string | undefined;
  onRetry: () => void;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (column: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onOpenLead: (id: string) => void;
  emptyHint: string;
}) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(LEAD_COLUMNS.map((c) => [c.id, c.width])),
  );
  const drag = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  const onMouseMove = useCallback((event: MouseEvent) => {
    const state = drag.current;
    if (!state) return;
    const next = Math.max(90, state.startWidth + (event.clientX - state.startX));
    setWidths((w) => ({ ...w, [state.id]: next }));
  }, []);

  useEffect(() => {
    const stop = () => {
      drag.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stop);
    };
  }, [onMouseMove]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (isError) {
    return (
      <div className="surface-card p-12 text-center">
        <h3 className="text-lg font-semibold">Could not load leads</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {errorMessage ?? "Something went wrong while reading your workspace."}
        </p>
        <Button className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="surface-card space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-9 w-6" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="surface-card p-12 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Users className="size-5" />
        </span>
        <h3 className="mt-4 text-lg font-semibold">No leads to show</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="surface-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 1400 }}>
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-3 py-2">
                <Checkbox
                  aria-label="Select all leads on this page"
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    onSelectedChange(
                      checked
                        ? Array.from(new Set([...selected, ...rows.map((r) => r.id)]))
                        : selected.filter((id) => !rows.some((r) => r.id === id)),
                    )
                  }
                />
              </th>
              {LEAD_COLUMNS.map((col) => {
                const sortKey = SORT_MAP[col.id];
                return (
                  <th
                    key={col.id}
                    className="relative select-none px-3 py-2 font-medium"
                    style={{ width: widths[col.id], minWidth: widths[col.id] }}
                  >
                    {sortKey ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={() => onSort(sortKey)}
                      >
                        {col.label}
                        {sortBy === sortKey ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${col.label} column`}
                      onMouseDown={(e) => {
                        drag.current = {
                          id: col.id,
                          startX: e.clientX,
                          startWidth: widths[col.id] ?? col.width,
                        };
                      }}
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
                    />
                  </th>
                );
              })}
              <th className="w-20 px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => {
              const checked = selected.includes(lead.id);
              return (
                <tr
                  key={lead.id}
                  className={cn(
                    "border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40",
                    checked && "bg-primary/5",
                  )}
                >
                  <td className="px-3 py-2">
                    <Checkbox
                      aria-label={`Select ${lead.email}`}
                      checked={checked}
                      onCheckedChange={(value) =>
                        onSelectedChange(
                          value ? [...selected, lead.id] : selected.filter((id) => id !== lead.id),
                        )
                      }
                    />
                  </td>
                  <td className="truncate px-3 py-2 font-medium">
                    <button
                      type="button"
                      className="truncate hover:text-primary hover:underline"
                      onClick={() => onOpenLead(lead.id)}
                    >
                      {leadName(lead) || "—"}
                    </button>
                  </td>
                  <td className="truncate px-3 py-2 text-muted-foreground">{lead.email}</td>
                  <td className="truncate px-3 py-2 text-muted-foreground">{lead.company ?? "—"}</td>
                  <td className="truncate px-3 py-2 text-muted-foreground">{lead.job_title ?? "—"}</td>
                  <td className="truncate px-3 py-2 text-muted-foreground">{lead.phone ?? "—"}</td>
                  <td className="truncate px-3 py-2 text-muted-foreground">
                    {leadLocation(lead) || "—"}
                  </td>
                  <td className="truncate px-3 py-2 text-muted-foreground">
                    {lead.website ? (
                      <a
                        className="hover:text-primary hover:underline"
                        href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {lead.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="truncate px-3 py-2 text-muted-foreground">
                    {lead.linkedin_url ? (
                      <a
                        className="hover:text-primary hover:underline"
                        href={
                          lead.linkedin_url.startsWith("http")
                            ? lead.linkedin_url
                            : `https://${lead.linkedin_url}`
                        }
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {lead.linkedin_url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        LEAD_STATUS_STYLES[lead.status] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(lead.tags ?? []).slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[11px]">
                          {tag}
                        </Badge>
                      ))}
                      {(lead.tags?.length ?? 0) > 3 ? (
                        <Badge variant="outline" className="text-[11px]">
                          +{lead.tags.length - 3}
                        </Badge>
                      ) : null}
                      {(lead.tags?.length ?? 0) === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="truncate px-3 py-2 text-muted-foreground">
                    {lead.campaignNames?.length ? lead.campaignNames.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(lead.last_activity_at)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(lead.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => onOpenLead(lead.id)}>
                      Open
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
        <p className="text-muted-foreground">
          Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} leads
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
