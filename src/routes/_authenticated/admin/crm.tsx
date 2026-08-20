import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
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
import { adminCrmContact, adminCrmDashboard } from "@/lib/admin-phase5.functions";
import { adminOutreachFilters } from "@/lib/admin-outreach.functions";

export const Route = createFileRoute("/_authenticated/admin/crm")({
  head: () => ({
    meta: [
      { title: "CRM — MunchReach Admin" },
      {
        name: "description",
        content:
          "Platform-wide CRM inspection: pipeline stages, contacts, tasks, notes, activity and campaign history per workspace.",
      },
      { property: "og:title", content: "CRM — MunchReach Admin" },
      {
        property: "og:description",
        content: "Read-only cross-workspace CRM inspection for support and platform teams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCrmPage,
});

function AdminCrmPage() {
  const loadDashboard = useServerFn(adminCrmDashboard);
  const loadContact = useServerFn(adminCrmContact);
  const loadFilters = useServerFn(adminOutreachFilters);

  const [workspace, setWorkspace] = useState("all");
  const [stage, setStage] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const options = useQuery({
    queryKey: ["admin", "outreach", "filters"],
    queryFn: () => loadFilters(),
  });

  const filters = {
    workspaceId: workspace === "all" ? null : workspace,
    stageId: stage === "all" ? null : stage,
    search: search.trim() || null,
    page,
    pageSize: 50,
  };

  const crm = useQuery({
    queryKey: ["admin", "crm", filters],
    queryFn: () => loadDashboard({ data: filters }),
    refetchOnWindowFocus: true,
  });

  const detail = useQuery({
    queryKey: ["admin", "crm", "contact", openId],
    queryFn: () => loadContact({ data: { leadId: openId! } }),
    enabled: Boolean(openId),
  });

  const stats = crm.data?.stats;
  const rows = crm.data?.rows ?? [];
  const total = crm.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const stages = (crm.data?.stages ?? []).filter(
    (s: any) => workspace === "all" || s.workspaceId === workspace,
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="CRM"
        description="Platform-wide view of the existing CRM. Contacts, pipeline stages, notes, tasks and activity are read here for support — editing stays in the customer workspace."
        actions={
          <Button variant="outline" size="sm" onClick={() => void crm.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Contacts" value={num(stats?.contacts)} />
        <StatCard label="Active" value={num(stats?.active)} hint="Not archived" />
        <StatCard label="Open deals" value={num(stats?.openDeals)} />
        <StatCard label="Won" value={num(stats?.wonDeals)} />
        <StatCard label="Lost" value={num(stats?.lostDeals)} />
        <StatCard label="Open tasks" value={num(stats?.openTasks)} />
      </div>

      <FilterBar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search contact, email or company"
        />
        <FilterSelect
          value={workspace}
          onChange={(v) => {
            setWorkspace(v);
            setStage("all");
            setPage(1);
          }}
          allLabel="All workspaces"
          options={(options.data?.workspaces ?? []).map((w: any) => ({
            value: w.id,
            label: w.name,
          }))}
        />
        <FilterSelect
          value={stage}
          onChange={(v) => {
            setStage(v);
            setPage(1);
          }}
          allLabel="All stages"
          options={stages.map((s: any) => ({ value: s.id, label: s.name }))}
        />
      </FilterBar>

      <div className="rounded-xl border bg-card">
        {crm.isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Deal value</TableHead>
                <TableHead>Open tasks</TableHead>
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
                  <TableCell>
                    <Pill tone={row.stageName ? "info" : "muted"}>{row.stageName ?? "None"}</Pill>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.dealValue === null || row.dealValue === undefined
                      ? "—"
                      : num(row.dealValue)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{num(row.openTasks)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDate(row.lastActivityAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {num(total)} contacts · page {page} of {pages}
        </p>
        <div className="flex gap-2">
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
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Recent CRM activity</h2>
        {crm.isLoading ? (
          <LoadingRows rows={3} />
        ) : (crm.data?.recent ?? []).length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {(crm.data?.recent ?? []).map((r: any) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium capitalize">{r.type}</span>{" "}
                  <span className="text-muted-foreground">{r.detail}</span>{" "}
                  <span className="text-muted-foreground">· {r.leadEmail ?? "—"}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.workspaceName} · {fmtDate(r.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={Boolean(openId)} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>
              {detail.data?.contact.name ?? detail.data?.contact.email ?? "Contact"}
            </SheetTitle>
          </SheetHeader>
          {detail.isLoading ? (
            <LoadingRows />
          ) : detail.data ? (
            <div className="mt-4 space-y-5">
              <DetailGrid
                items={[
                  { label: "Email", value: detail.data.contact.email },
                  { label: "Company", value: detail.data.contact.company ?? "—" },
                  { label: "Title", value: detail.data.contact.jobTitle ?? "—" },
                  { label: "Workspace", value: detail.data.contact.workspaceName },
                  { label: "Stage", value: detail.data.contact.stageName ?? "None" },
                  { label: "Status", value: detail.data.contact.status },
                  { label: "Source", value: detail.data.contact.source ?? "—" },
                  {
                    label: "Deal value",
                    value:
                      detail.data.contact.dealValue === null
                        ? "—"
                        : num(detail.data.contact.dealValue),
                  },
                  { label: "Location", value: detail.data.contact.location ?? "—" },
                  { label: "Created", value: fmtDate(detail.data.contact.createdAt) },
                ]}
              />

              <Tabs defaultValue="activity">
                <TabsList>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="tasks">Tasks</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                  <TabsTrigger value="email">Email</TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="pt-3">
                  {detail.data.activities.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {detail.data.activities.map((a: any) => (
                        <li key={a.id} className="flex justify-between gap-3 border-b pb-2">
                          <span>
                            <span className="font-medium capitalize">{a.type}</span>{" "}
                            <span className="text-muted-foreground">{a.detail}</span>
                            {a.campaignName ? (
                              <span className="text-muted-foreground"> · {a.campaignName}</span>
                            ) : null}
                          </span>
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {fmtDate(a.at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="tasks" className="pt-3">
                  {detail.data.tasks.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {detail.data.tasks.map((t: any) => (
                        <li key={t.id} className="flex justify-between gap-3 border-b pb-2">
                          <span>{t.title}</span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {fmtDate(t.dueAt)}
                            <Pill tone={t.completed ? "good" : "warn"}>
                              {t.completed ? "done" : "open"}
                            </Pill>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="notes" className="pt-3">
                  {detail.data.notes.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <ul className="space-y-3 text-sm">
                      {detail.data.notes.map((n: any) => (
                        <li key={n.id} className="rounded-lg border bg-muted/30 p-3">
                          <p className="whitespace-pre-wrap">{n.body}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{fmtDate(n.at)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="campaigns" className="pt-3">
                  {detail.data.campaigns.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {detail.data.campaigns.map((c: any) => (
                        <li
                          key={`${c.campaignId}`}
                          className="flex justify-between gap-3 border-b pb-2"
                        >
                          <span>{c.campaignName}</span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Pill>{c.status}</Pill>
                            {fmtDate(c.addedAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="email" className="space-y-4 pt-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                      Messages
                    </h3>
                    {detail.data.emails.length === 0 ? (
                      <EmptyState />
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {detail.data.emails.map((m: any) => (
                          <li key={m.id} className="flex justify-between gap-3 border-b pb-2">
                            <span>{m.subject ?? "—"}</span>
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Pill tone={m.status === "sent" ? "good" : "muted"}>{m.status}</Pill>
                              {fmtDate(m.at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                      Replies &amp; engagement
                    </h3>
                    {detail.data.replies.length === 0 && detail.data.engagement.length === 0 ? (
                      <EmptyState />
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {detail.data.replies.map((r: any) => (
                          <li key={r.id} className="flex justify-between gap-3 border-b pb-2">
                            <span>Reply: {r.subject ?? "—"}</span>
                            <span className="text-xs text-muted-foreground">
                              {fmtDate(r.at)}
                            </span>
                          </li>
                        ))}
                        {detail.data.engagement.map((e: any) => (
                          <li key={e.id} className="flex justify-between gap-3 border-b pb-2">
                            <span className="capitalize">{e.type}</span>
                            <span className="text-xs text-muted-foreground">{fmtDate(e.at)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <EmptyState />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
