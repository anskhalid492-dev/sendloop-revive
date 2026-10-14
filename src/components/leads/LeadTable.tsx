import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, Ellipsis, Linkedin, Users } from "lucide-react";

import { LeadProviderBadge } from "@/components/leads/LeadProviderBadge";
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
import { isSelected, toggleSelection, type LeadSelection } from "@/lib/leads-query";
import { leadLinkedInHref } from "@/lib/lead-presentation";


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
  selection,
  onSelectionChange,
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
  selection: LeadSelection;
  onSelectionChange: (selection: LeadSelection) => void;
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

  const allSelected = rows.length > 0 && rows.every((r) => isSelected(selection, r.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (isError) {
    return (
      <div className="surface-card min-h-0 flex-1 overflow-auto p-6 text-center sm:p-12">
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
      <div className="surface-card min-h-0 flex-1 space-y-2 overflow-auto p-4">
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
      <div className="surface-card min-h-0 flex-1 overflow-auto p-6 text-center sm:p-12">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Users className="size-5" />
        </span>
        <h3 className="mt-4 text-lg font-semibold">No leads to show</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="min-h-0 max-w-full flex-1 overflow-auto overscroll-contain" role="region" aria-label="Leads table" tabIndex={0}>
        <table className="w-full table-fixed border-collapse text-[13px]" style={{ minWidth: LEAD_COLUMNS.reduce((sum, col) => sum + (widths[col.id] ?? col.width), 0) + 100 }}>
          <thead>
            <tr className="h-11 border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <th scope="col" className="sticky left-0 top-0 z-30 w-11 bg-muted px-3 py-2">
                <Checkbox
                  aria-label="Select all leads on this page"
                  checked={allSelected}
                  onCheckedChange={(checked) => {
                    let next = selection;
                    for (const row of rows) next = toggleSelection(next, row.id, Boolean(checked));
                    onSelectionChange(next);
                  }}

                />
              </th>
              {LEAD_COLUMNS.map((col) => {
                const sortKey = SORT_MAP[col.id];
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={cn("sticky top-0 z-20 select-none bg-muted px-3 py-2 font-medium", col.id === "name" && "left-11 z-30")}
                    style={{ width: widths[col.id], minWidth: widths[col.id] }}
                  >
                    {sortKey ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto justify-start gap-1 rounded-none p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
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
                      </Button>
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
              <th scope="col" className="sticky top-0 z-20 w-14 bg-muted px-3 py-2 text-right font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => {
              const checked = isSelected(selection, lead.id);
              const linkedInHref = leadLinkedInHref(lead.linkedin_url);
              const name = leadName(lead);
              return (
                <tr
                  key={lead.id}
                  className={cn(
                    "group h-14 border-b border-border/60 bg-card transition-colors last:border-0 hover:bg-muted/40",
                    checked && "bg-accent/40",
                  )}
                >
                  <td className={cn("sticky left-0 z-10 px-3 py-2 group-hover:bg-muted", checked ? "bg-accent" : "bg-card")}>
                    <Checkbox
                      aria-label={`Select ${lead.email}`}
                      checked={checked}
                      onCheckedChange={(value) =>
                        onSelectionChange(toggleSelection(selection, lead.id, Boolean(value)))
                      }

                    />
                  </td>
                  <td className={cn("sticky left-11 z-10 px-3 py-2 font-medium group-hover:bg-muted", checked ? "bg-accent" : "bg-card")}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start gap-2.5 px-0 py-0 text-[13px] hover:bg-transparent hover:text-primary"
                      onClick={() => onOpenLead(lead.id)}
                    >
                      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/10 bg-primary/10 text-[11px] font-semibold text-primary">
                        {name ? [lead.first_name?.[0], lead.last_name?.[0]].filter(Boolean).join("").toUpperCase() : <Users className="size-3.5" />}
                      </span>
                      <span className="truncate" title={name || lead.email}>{name || "—"}</span>
                    </Button>
                  </td>
                  <td className="truncate px-3 py-2 text-muted-foreground" title={lead.email}>{lead.email}</td>
                  <td className="px-3 py-2"><LeadProviderBadge email={lead.email} /></td>
                  <td className="truncate px-3 py-2 text-muted-foreground" title={lead.company ?? undefined}>{lead.company ?? "—"}</td>
                  <td className="truncate px-3 py-2 text-muted-foreground" title={lead.job_title ?? undefined}>{lead.job_title ?? "—"}</td>
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
                    {linkedInHref ? (
                      <Button asChild variant="ghost" size="icon" className="size-8 text-primary">
                      <a
                        aria-label={`Open ${name || lead.email}'s LinkedIn profile`}
                        title="Open LinkedIn profile"
                        href={linkedInHref}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Linkedin className="size-4" aria-hidden />
                      </a>
                      </Button>
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
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Open ${name || lead.email}`} title="Open lead details" onClick={() => onOpenLead(lead.id)}>
                      <Ellipsis className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 text-xs">
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
            <ChevronLeft className="size-3.5" />
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
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
