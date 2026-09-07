import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DetailGrid,
  EmptyState,
  FilterBar,
  FilterSelect,
  LoadingRows,
  Pill,
  SearchInput,
  StatCard,
  fmtDate,
  num,
} from "@/components/app/admin/OutreachUI";
import {
  adminExportLeads,
  adminGetLead,
  adminListLeads,
  adminOutreachFilters,
} from "@/lib/admin-outreach.functions";
import { LeadRetentionPanel } from "@/components/app/admin/LeadRetentionPanel";

export const Route = createFileRoute("/_authenticated/mranuskhalid/leads")({
  head: () => ({
    meta: [
      { title: "Leads — MunchReach Admin" },
      {
        name: "description",
        content:
          "Platform-wide contact directory with workspace, list and campaign filters plus full per-contact outreach history.",
      },
    ],
  }),
  component: AdminLeadsPage,
});

const LEAD_STATUSES = ["new", "contacted", "replied", "bounced", "unsubscribed", "converted"];

function AdminLeadsPage() {
  const listLeads = useServerFn(adminListLeads);
  const getLead = useServerFn(adminGetLead);
  const loadFilters = useServerFn(adminOutreachFilters);

  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [list, setList] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"page" | "all" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exportLeads = useServerFn(adminExportLeads);
  const deleteLeads = useServerFn(adminDeleteLeads);
  const queryClient = useQueryClient();

  const options = useQuery({
    queryKey: ["admin", "outreach", "filters"],
    queryFn: () => loadFilters(),
  });

  const filters = {
    workspaceId: workspace === "all" ? null : workspace,
    listId: list === "all" ? null : list,
    campaignId: campaign === "all" ? null : campaign,
    status: status === "all" ? null : status,
    search: search.trim() || null,
    page,
    pageSize: 50,
  };

  const leadsQuery = useQuery({
    queryKey: ["admin", "outreach", "leads", filters],
    queryFn: () => listLeads({ data: filters }),
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "outreach", "lead", openId],
    queryFn: () => getLead({ data: { leadId: openId! } }),
    enabled: Boolean(openId),
  });

  const rows = leadsQuery.data?.rows ?? [];
  const total = leadsQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));

  const scopedLists = (options.data?.lists ?? []).filter(
    (l: any) => workspace === "all" || l.workspaceId === workspace,
  );
  const scopedCampaigns = (options.data?.campaigns ?? []).filter(
    (c: any) => workspace === "all" || c.workspaceId === workspace,
  );

  async function runExport(scope: "page" | "all") {
    setExporting(scope);
    try {
      const result = await exportLeads({ data: { ...filters, scope } });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `munchreach-leads-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Leads"
        description="Every contact stored on the platform, labelled by workspace. Read-only support view — contacts are never edited or deleted from here."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={exporting !== null || !rows.length}
              onClick={() => runExport("page")}
            >
              {exporting === "page" ? "Exporting…" : "Export page CSV"}
            </Button>
            <Button
              size="sm"
              disabled={exporting !== null || !total}
              onClick={() => runExport("all")}
            >
              {exporting === "all" ? "Exporting…" : `Export all ${num(total)} CSV`}
            </Button>
          </div>
        }
      />

      <LeadRetentionPanel />


      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Matching contacts" value={num(total)} />
        <StatCard label="Page" value={`${page} / ${pages}`} />
        <StatCard label="Workspaces" value={num(options.data?.workspaces?.length ?? 0)} />
      </div>

      <FilterBar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search name, email or company"
        />
        <FilterSelect
          value={workspace}
          onChange={(v) => {
            setWorkspace(v);
            setList("all");
            setCampaign("all");
            setPage(1);
          }}
          allLabel="All workspaces"
          options={(options.data?.workspaces ?? []).map((w: any) => ({
            value: w.id,
            label: w.name,
          }))}
        />
        <FilterSelect
          value={list}
          onChange={(v) => {
            setList(v);
            setPage(1);
          }}
          allLabel="All lists"
          options={scopedLists.map((l: any) => ({ value: l.id, label: l.name }))}
        />
        <FilterSelect
          value={campaign}
          onChange={(v) => {
            setCampaign(v);
            setPage(1);
          }}
          allLabel="All campaigns"
          width="w-56"
          options={scopedCampaigns.map((c: any) => ({ value: c.id, label: c.name }))}
        />
        <FilterSelect
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          allLabel="All statuses"
          width="w-40"
          options={LEAD_STATUSES.map((s) => ({ value: s, label: s }))}
        />
      </FilterBar>

      <div className="rounded-xl border bg-card">
        {leadsQuery.isLoading ? (
          <LoadingRows />
        ) : leadsQuery.isError ? (
          <EmptyState message={(leadsQuery.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState message="No contacts match these filters." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>List</TableHead>
                <TableHead>Campaigns</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: any) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setOpenId(row.id)}>
                  <TableCell>
                    <div className="font-medium">{row.name ?? row.email}</div>
                    <div className="text-xs text-muted-foreground">{row.email}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.company ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.workspaceName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.listName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.campaigns.length ? row.campaigns.slice(0, 2).join(", ") : "—"}
                    {row.campaigns.length > 2 ? ` +${row.campaigns.length - 2}` : ""}
                  </TableCell>
                  <TableCell>
                    <Pill tone={row.status === "replied" ? "good" : "muted"}>
                      {row.status ?? "—"}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDate(row.lastActivityAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      <Sheet open={Boolean(openId)} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{detailQuery.data?.lead.name ?? detailQuery.data?.lead.email ?? "Contact"}</SheetTitle>
          </SheetHeader>
          {detailQuery.isLoading ? (
            <LoadingRows />
          ) : detailQuery.isError ? (
            <EmptyState message={(detailQuery.error as Error).message} />
          ) : detailQuery.data ? (
            <LeadDetail data={detailQuery.data} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function LeadDetail({ data }: { data: any }) {
  const l = data.lead;
  return (
    <div className="mt-4 space-y-5 px-4 pb-8">
      <DetailGrid
        items={[
          { label: "Email", value: l.email },
          { label: "Company", value: l.company ?? "—" },
          { label: "Job title", value: l.jobTitle ?? "—" },
          { label: "Phone", value: l.phone ?? "—" },
          { label: "Location", value: [l.city, l.state, l.country].filter(Boolean).join(", ") || "—" },
          { label: "Workspace", value: l.workspaceName },
          { label: "List", value: l.listName ?? "—" },
          { label: "Status", value: <Pill>{l.status ?? "—"}</Pill> },
          { label: "Source", value: l.leadSource ?? "—" },
          { label: "Added", value: fmtDate(l.createdAt) },
        ]}
      />

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="replies">Replies</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Notes & tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="pt-3">
          {data.campaigns.length === 0 ? (
            <EmptyState message="Not enrolled in any campaign." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Last sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.campaigns.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.campaign}</TableCell>
                    <TableCell>
                      <Pill tone={c.status === "replied" ? "good" : "muted"}>{c.status}</Pill>
                    </TableCell>
                    <TableCell>{num(c.currentStep)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(c.lastSentAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="emails" className="pt-3">
          {data.emails.length === 0 ? (
            <EmptyState message="No emails sent to this contact." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.emails.map((m: any) => (
                <li key={m.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{m.subject ?? "(no subject)"}</p>
                    <Pill tone={m.status === "sent" ? "good" : m.status === "failed" ? "bad" : "muted"}>
                      {m.status}
                    </Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m.campaign} · {fmtDate(m.sentAt)}
                  </p>
                  {m.error ? <p className="mt-1 text-xs text-destructive">{m.error}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="replies" className="pt-3">
          {data.replies.length === 0 ? (
            <EmptyState message="No replies received." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.replies.map((r: any) => (
                <li key={r.id} className="rounded-lg border p-3">
                  <p className="font-medium">{r.subject ?? "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.fromEmail} · {fmtDate(r.receivedAt)} · {r.sentiment ?? "unclassified"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="pt-3">
          {data.activities.length === 0 ? (
            <EmptyState message="No activity recorded." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.activities.map((a: any) => (
                <li key={a.id} className="rounded-lg border p-3">
                  <p className="font-medium capitalize">{String(a.type).replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.campaign ? `${a.campaign} · ` : ""}
                    {fmtDate(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-4 pt-3">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Notes</h3>
            {data.notes.length === 0 ? (
              <EmptyState message="No notes." />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.notes.map((n: any) => (
                  <li key={n.id} className="rounded-lg border p-3">
                    <p>{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{fmtDate(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Tasks</h3>
            {data.tasks.length === 0 ? (
              <EmptyState message="No tasks." />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.tasks.map((t: any) => (
                  <li key={t.id} className="flex items-center justify-between rounded-lg border p-3">
                    <span>{t.title}</span>
                    <Pill tone={t.completed ? "good" : "warn"}>
                      {t.completed ? "done" : `due ${fmtDate(t.dueAt)}`}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
