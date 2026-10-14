import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Filter, Loader2, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { ImportProgressPanel } from "@/components/leads/ImportProgressPanel";
import { ImportWizard } from "@/components/leads/ImportWizard";
import { LeadDetailSheet } from "@/components/leads/LeadDetailSheet";
import { LeadFiltersPanel } from "@/components/leads/LeadFiltersPanel";
import { LeadListSidebar } from "@/components/leads/LeadListSidebar";
import { LeadTable } from "@/components/leads/LeadTable";
import { Button } from "@/components/ui/button";
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
import { useWorkspace } from "@/hooks/useWorkspace";
import { LEAD_STATUSES, leadLocation, leadName, type LeadFilters } from "@/lib/lead-model";
import { listCampaigns } from "@/lib/campaigns.functions";
import { saveAndDownloadExport } from "@/lib/file-storage";
import {
  EMPTY_SELECTION,
  selectionCount,
  type LeadSelection,
} from "@/lib/leads-query";
import {
  bulkLeadAction,
  createLead,
  listLeadLists,
  listLeadTags,
  listLeads,
} from "@/lib/leads.functions";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Leads & Lists — MunchReach" },
      {
        name: "description",
        content:
          "Manage every prospect in one place: advanced filters, lists, tags, bulk actions, CSV import with field mapping and full lead profiles.",
      },
      { property: "og:title", content: "Leads & Lists — MunchReach" },
      {
        property: "og:description",
        content: "Advanced lead management for cold outreach teams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadsPage,
});

const PAGE_SIZE = 50;

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function LeadsPage() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();

  const fetchLists = useServerFn(listLeadLists);
  const fetchLeads = useServerFn(listLeads);
  const fetchTags = useServerFn(listLeadTags);
  const fetchCampaigns = useServerFn(listCampaigns);
  const bulkFn = useServerFn(bulkLeadAction);
  const createLeadFn = useServerFn(createLead);

  const [activeList, setActiveList] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<LeadFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selection, setSelection] = useState<LeadSelection>(EMPTY_SELECTION);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkDialog, setBulkDialog] = useState<null | "list" | "tag" | "campaign" | "status">(null);
  const [bulkValue, setBulkValue] = useState("");
  const [bulkRemove, setBulkRemove] = useState(false);
  const [newLead, setNewLead] = useState({
    email: "",
    first_name: "",
    last_name: "",
    company: "",
    job_title: "",
    phone: "",
  });

  const workspaceId = workspace?.id;

  const lists = useQuery({
    queryKey: ["lead-lists", workspaceId],
    queryFn: () => fetchLists({ data: { workspaceId } } as never),
    enabled: Boolean(workspaceId),
  });

  const tags = useQuery({
    queryKey: ["lead-tags", workspaceId],
    queryFn: () => fetchTags(),
    enabled: Boolean(workspaceId),
  });

  const campaigns = useQuery({
    queryKey: ["campaigns", workspaceId],
    queryFn: () => fetchCampaigns({ data: { workspaceId } } as never),
    enabled: Boolean(workspaceId),
  });

  const query = useMemo(
    () => ({
      ...filters,
      ...(workspaceId ? { workspaceId } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(activeList ? { listId: activeList } : {}),
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir,
    }),
    [filters, workspaceId, search, activeList, page, sortBy, sortDir],
  );

  const leads = useQuery({
    queryKey: ["leads", workspaceId, query],
    queryFn: () => fetchLeads({ data: query as never }),
    enabled: Boolean(workspaceId),
  });

  const rows = leads.data?.rows ?? [];
  const total = leads.data?.total ?? 0;
  const selectedCount = selectionCount(selection, total);
  const allMatchingSelected = selection.mode === "all" && selection.excluded.length === 0;

  // Filters sent with bulk actions so the server resolves the same population.
  const bulkFilters = useMemo(() => {
    const { page: _p, pageSize: _s, sortBy: _b, sortDir: _d, ...rest } = query;
    return rest;
  }, [query]);

  const campaignOptions = (campaigns.data ?? []).map((c: { id: string; name: string }) => ({
    id: c.id,
    name: c.name,
  }));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
    void queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
    void queryClient.invalidateQueries({ queryKey: ["lead-tags"] });
  };

  const bulk = useMutation({
    mutationFn: async (vars: Record<string, unknown>) => {
      const call = () =>
        bulkFn({
          data: { selection, filters: bulkFilters, workspaceId, ...vars } as never,
        });
      let result = await call();
      // Deleting a big selection is served in capped slices; keep going until the
      // server reports nothing left so one click clears the whole selection.
      let affected = result?.affected ?? 0;
      let failed = result?.failed ?? 0;
      let guard = 0;
      while (vars["action"] === "delete" && (result?.remaining ?? 0) > 0 && guard < 200) {
        guard += 1;
        result = await call();
        affected += result?.affected ?? 0;
        failed += result?.failed ?? 0;
        if ((result?.affected ?? 0) === 0) break;
      }
      return { ...result, affected, failed };
    },
    onSuccess: (result) => {
      const failed = result?.failed ?? 0;
      const detail = (result?.reasons ?? [])
        .map((r: { count: number; reason: string }) => `${r.count} ${r.reason.toLowerCase()}`)
        .join(", ");
      if (failed > 0) {
        toast.warning(`Updated: ${result.affected} · Failed: ${failed}`, {
          description: detail || undefined,
        });
      } else {
        toast.success(`Updated: ${result?.affected ?? 0} leads`, {
          description: detail || undefined,
        });
      }
      setSelection(EMPTY_SELECTION);
      setBulkDialog(null);
      setBulkValue("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addLead = useMutation({
    mutationFn: () =>
      createLeadFn({
        data: {
          workspaceId: workspaceId!,
          lead: {
            email: newLead.email.trim(),
            first_name: newLead.first_name.trim() || null,
            last_name: newLead.last_name.trim() || null,
            company: newLead.company.trim() || null,
            job_title: newLead.job_title.trim() || null,
            phone: newLead.phone.trim() || null,
            list_id: activeList,
          },
        } as never,
      }),
    onSuccess: () => {
      toast.success("Lead added");
      setAddOpen(false);
      setNewLead({ email: "", first_name: "", last_name: "", company: "", job_title: "", phone: "" });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exportCsv = async () => {
    const source =
      selection.mode === "ids" && selection.ids.length
        ? rows.filter((r) => selection.ids.includes(r.id))
        : rows;
    if (source.length === 0) {
      toast.error("Nothing to export on this page");
      return;
    }
    const header = [
      "email",
      "first_name",
      "last_name",
      "company",
      "job_title",
      "phone",
      "location",
      "website",
      "status",
      "tags",
      "created_at",
    ];
    const body = source.map((lead) =>
      [
        lead.email,
        lead.first_name ?? "",
        lead.last_name ?? "",
        lead.company ?? "",
        lead.job_title ?? "",
        lead.phone ?? "",
        leadLocation(lead),
        lead.website ?? "",
        lead.status,
        (lead.tags ?? []).join("|"),
        lead.created_at,
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
    await saveAndDownloadExport({
      content: [header.join(","), ...body].join("\n"),
      fileName: `munchreach-leads-${new Date().toISOString().slice(0, 10)}.csv`,
      category: "leads",
    });
  };

  const onSort = (column: string) => {
    if (sortBy === column) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(column);
      setSortDir("asc");
    }
    setPage(1);
  };

  return (
    <AppShell title="Leads" description={`${total} prospects in this workspace`}>
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <LeadListSidebar
          lists={lists.data ?? []}
          isLoading={lists.isLoading}
          totalLeads={total}
          activeList={activeList}
          onSelect={(id) => {
            setActiveList(id);
            setPage(1);
            setSelection(EMPTY_SELECTION);
          }}
          workspaceId={workspaceId}
        />

        <div className="min-w-0 space-y-4">
          <ImportProgressPanel workspaceId={workspaceId} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 basis-full sm:min-w-[220px] sm:flex-1 sm:basis-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search leads"
                className="pl-9"
                placeholder="Search name, email or company"
                value={search}
                maxLength={120}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Button variant="outline" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
              <Filter className="mr-2 size-4" />
              Filters
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 size-4" />
              Import CSV
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 size-4" />
              Export
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add lead
            </Button>
          </div>

          {showFilters ? (
            <LeadFiltersPanel
              filters={filters}
              onChange={(next) => {
                setFilters(next);
                setPage(1);
              }}
              campaigns={campaignOptions}
              tags={tags.data ?? []}
            />
          ) : null}

          {selectedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3">
              <p className="text-sm font-medium">
                {allMatchingSelected
                  ? `All ${total.toLocaleString()} leads selected`
                  : `${selectedCount.toLocaleString()} leads selected`}
              </p>
              {!allMatchingSelected && total > selectedCount ? (
                <Button
                  size="sm"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => setSelection({ mode: "all", excluded: [] })}
                >
                  Select all {total.toLocaleString()} leads
                </Button>
              ) : null}
              <div className="ml-auto flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      Bulk actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Lists</DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={() => {
                        setBulkRemove(false);
                        setBulkDialog("list");
                      }}
                    >
                      Add to list
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => bulk.mutate({ action: "remove_from_list" })}
                    >
                      Remove from list
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Tags</DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={() => {
                        setBulkRemove(false);
                        setBulkDialog("tag");
                      }}
                    >
                      Add tag
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setBulkRemove(true);
                        setBulkDialog("tag");
                      }}
                    >
                      Remove tag
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Campaigns</DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={() => {
                        setBulkRemove(false);
                        setBulkDialog("campaign");
                      }}
                    >
                      Add to campaign
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setBulkRemove(true);
                        setBulkDialog("campaign");
                      }}
                    >
                      Remove from campaign
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        setBulkRemove(false);
                        setBulkDialog("status");
                      }}
                    >
                      Set status
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void exportCsv()}>Export selected</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => bulk.mutate({ action: "delete" })}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" variant="ghost" onClick={() => setSelection(EMPTY_SELECTION)}>
                  Clear
                </Button>
              </div>
            </div>
          ) : null}

          <LeadTable
            rows={rows}
            total={total}
            isLoading={leads.isLoading}
            isError={leads.isError}
            errorMessage={(leads.error as Error | null)?.message}
            onRetry={() => void leads.refetch()}
            selection={selection}
            onSelectionChange={setSelection}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            onOpenLead={setOpenLeadId}
            emptyHint="Import a CSV or add a lead manually to start building this workspace."
          />
        </div>
      </div>

      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        workspaceId={workspaceId}
        lists={lists.data ?? []}
        defaultListId={activeList}
      />

      <LeadDetailSheet
        leadId={openLeadId}
        workspaceId={workspaceId}
        onOpenChange={(open) => {
          if (!open) setOpenLeadId(null);
        }}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a lead</DialogTitle>
            <DialogDescription>
              The lead is added to {activeList ? "the selected list" : "your workspace"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["email", "Email"],
                ["first_name", "First name"],
                ["last_name", "Last name"],
                ["company", "Company"],
                ["job_title", "Job title"],
                ["phone", "Phone"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`new-${key}`}>{label}</Label>
                <Input
                  id={`new-${key}`}
                  maxLength={200}
                  value={newLead[key]}
                  onChange={(e) => setNewLead((s) => ({ ...s, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newLead.email.trim() || !workspaceId || addLead.isPending}
              onClick={() => addLead.mutate()}
            >
              {addLead.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Add lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDialog !== null} onOpenChange={(open) => !open && setBulkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkDialog === "list"
                ? "Add to list"
                : bulkDialog === "tag"
                  ? bulkRemove
                    ? "Remove tag"
                    : "Add tag"
                  : bulkDialog === "campaign"
                    ? bulkRemove
                      ? "Remove from campaign"
                      : "Add to campaign"
                    : "Set status"}
            </DialogTitle>
            <DialogDescription>
              Applies to {selectedCount.toLocaleString()} selected leads.
            </DialogDescription>
          </DialogHeader>

          {bulkDialog === "tag" ? (
            <Input
              value={bulkValue}
              maxLength={40}
              placeholder="Tag name"
              onChange={(e) => setBulkValue(e.target.value)}
            />
          ) : (
            <Select value={bulkValue} onValueChange={setBulkValue}>
              <SelectTrigger>
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {bulkDialog === "list"
                  ? (lists.data ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))
                  : bulkDialog === "campaign"
                    ? campaignOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))
                    : LEAD_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
              </SelectContent>
            </Select>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={!bulkValue.trim() || bulk.isPending}
              onClick={() => {
                if (bulkDialog === "list") bulk.mutate({ action: "add_to_list", listId: bulkValue });
                else if (bulkDialog === "tag")
                  bulk.mutate({
                    action: bulkRemove ? "remove_tag" : "add_tag",
                    tag: bulkValue.trim(),
                  });
                else if (bulkDialog === "campaign")
                  bulk.mutate({
                    action: bulkRemove ? "remove_from_campaign" : "add_to_campaign",
                    campaignId: bulkValue,
                  });
                else bulk.mutate({ action: "set_status", status: bulkValue });
              }}
            >
              {bulk.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
