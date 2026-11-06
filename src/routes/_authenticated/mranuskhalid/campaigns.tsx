import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, Pause, Play, RotateCcw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  pct,
  type Tone,
} from "@/components/app/admin/OutreachUI";
import {
  adminCampaignControl,
  adminGetCampaign,
  adminGetCampaignInsights,
  adminListCampaigns,
  type AdminCampaignRow,
  adminOutreachFilters,
} from "@/lib/admin-outreach.functions";

import { CampaignKpis } from "@/components/app/admin/campaigns/CampaignKpis";
import { Diagnostics, LeadActivity, SendingActivity } from "@/components/app/admin/campaigns/CampaignInsights";
import { allowedActions, paginate, sortRows, sumKpis, type SortDir } from "@/lib/admin-campaign-monitor";

export const Route = createFileRoute("/_authenticated/mranuskhalid/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — MunchReach Admin" },
      {
        name: "description",
        content:
          "Every customer campaign across all workspaces with delivery metrics, sequence detail and pause, resume or stop controls.",
      },
    ],
  }),
  component: AdminCampaignsPage,
});

const STATUSES = ["draft", "scheduled", "active", "paused", "completed", "archived"];

function statusTone(status: string): Tone {
  if (status === "active") return "good";
  if (status === "paused") return "warn";
  if (status === "completed" || status === "archived") return "muted";
  if (status === "scheduled") return "info";
  return "muted";
}

type SortKey = keyof AdminCampaignRow;

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; rate?: boolean }[] = [
  { key: "workspaceName", label: "Workspace" },
  { key: "ownerEmail", label: "Owner" },
  { key: "status", label: "Status" },
  { key: "leads", label: "Leads", numeric: true },
  { key: "sent", label: "Sent", numeric: true },
  { key: "delivered", label: "Delivered (est.)", numeric: true },
  { key: "deliveryRate", label: "Delivery rate", numeric: true, rate: true },
  { key: "opens", label: "Opens", numeric: true },
  { key: "openRate", label: "Open rate", numeric: true, rate: true },
  { key: "clicks", label: "Clicks", numeric: true },
  { key: "clickRate", label: "Click rate", numeric: true, rate: true },
  { key: "replies", label: "Replies", numeric: true },
  { key: "replyRate", label: "Reply rate", numeric: true, rate: true },
  { key: "positiveReplies", label: "Positive", numeric: true },
  { key: "bounces", label: "Bounces", numeric: true },
  { key: "failed", label: "Failed", numeric: true },
  { key: "unknown", label: "Unknown", numeric: true },
  { key: "unsubscribes", label: "Unsubs", numeric: true },
  { key: "lastActivityAt", label: "Last activity" },
];

const PAGE_SIZE = 25;

function AdminCampaignsPage() {
  const queryClient = useQueryClient();
  const listCampaigns = useServerFn(adminListCampaigns);
  const getCampaign = useServerFn(adminGetCampaign);
  const getInsights = useServerFn(adminGetCampaignInsights);
  const control = useServerFn(adminCampaignControl);
  const loadFilters = useServerFn(adminOutreachFilters);

  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [owner, setOwner] = useState("all");
  const [status, setStatus] = useState("all");
  const [account, setAccount] = useState("all");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastActivityAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    name: string;
    action: "pause" | "stop";
  } | null>(null);

  const resetFilters = () => {
    setSearch("");
    setWorkspace("all");
    setOwner("all");
    setStatus("all");
    setAccount("all");
    setType("all");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const options = useQuery({
    queryKey: ["admin", "outreach", "filters"],
    queryFn: () => loadFilters(),
  });

  const filters = {
    workspaceId: workspace === "all" ? null : workspace,
    status: status === "all" ? null : status,
    sendingAccountId: account === "all" ? null : account,
    ownerId: owner === "all" ? null : owner,
    type: type === "all" ? null : (type as "ai" | "standard"),
    from: from ? new Date(from).toISOString() : null,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
    search: search.trim() || null,
  };

  const campaignsQuery = useQuery({
    queryKey: ["admin", "outreach", "campaigns", filters],
    queryFn: () => listCampaigns({ data: filters }),
    refetchInterval: 30000,
    placeholderData: (prev) => prev,
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "outreach", "campaign", openId],
    queryFn: () => getCampaign({ data: { campaignId: openId! } }),
    enabled: Boolean(openId),
    refetchInterval: openId ? 15000 : false,
  });

  const insightsQuery = useQuery({
    queryKey: ["admin", "outreach", "campaign-insights", openId],
    queryFn: () => getInsights({ data: { campaignId: openId! } }),
    enabled: Boolean(openId),
  });

  const mutation = useMutation({
    mutationFn: (vars: { campaignId: string; action: "pause" | "resume" | "stop" }) =>
      control({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(
        vars.action === "pause"
          ? "Campaign paused"
          : vars.action === "resume"
            ? "Campaign resumed"
            : "Campaign stopped",
      );
      void queryClient.invalidateQueries({ queryKey: ["admin", "outreach"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = campaignsQuery.data?.rows ?? [];
  const totals = useMemo(
    () => sumKpis(rows.map((r) => ({ ...r, bounced: r.bounces, bouncedAfterSend: r.bouncesAfterSend }))),
    [rows],
  );
  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const paged = paginate(sorted, page, PAGE_SIZE);

  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.ownerId) map.set(r.ownerId, r.ownerEmail ?? r.ownerName ?? r.ownerId);
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIcon = (key: SortKey) =>
    key !== sortKey ? (
      <ArrowUpDown className="size-3 opacity-40" />
    ) : sortDir === "asc" ? (
      <ArrowUp className="size-3" />
    ) : (
      <ArrowDown className="size-3" />
    );

  const cell = (row: AdminCampaignRow, col: (typeof COLUMNS)[number]) => {
    const v = row[col.key];
    if (col.key === "status") return <Pill tone={statusTone(row.status)}>{row.status}</Pill>;
    if (col.key === "ownerEmail") return row.ownerEmail ?? row.ownerName ?? "—";
    if (col.key === "lastActivityAt") return fmtDate(row.lastActivityAt);
    if (col.key === "delivered") return row.sent ? num(row.delivered) : "—";
    if (col.rate) return v === null || v === undefined ? "—" : `${v}%`;
    if (col.numeric) return num(v as number);
    return (v as string) ?? "—";
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Campaigns"
        description="Every campaign across every workspace, from real sending-pipeline records. Sent, delivered (estimate), bounced, failed and unknown outcomes are counted separately. Admin controls change campaign state only and never trigger a send."
      />

      {campaignsQuery.isLoading ? (
        <LoadingRows rows={3} />
      ) : (
        <CampaignKpis
          totals={totals}
          trends={campaignsQuery.data?.trends ?? { sent: null, replies: null, bounces: null }}
        />
      )}

      <FilterBar>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search campaign name" />
        <FilterSelect
          value={workspace}
          onChange={(v) => { setWorkspace(v); setPage(1); }}
          allLabel="All workspaces"
          options={(options.data?.workspaces ?? []).map((w: { id: string; name: string }) => ({ value: w.id, label: w.name }))}
        />
        <FilterSelect value={owner} onChange={(v) => { setOwner(v); setPage(1); }} allLabel="All owners" width="w-52" options={ownerOptions} />
        <FilterSelect
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          allLabel="All statuses"
          width="w-40"
          options={STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          value={account}
          onChange={(v) => { setAccount(v); setPage(1); }}
          allLabel="All mailboxes"
          width="w-56"
          options={(options.data?.sendingAccounts ?? []).map((a: { id: string; email: string }) => ({
            value: a.id,
            label: a.email,
          }))}
        />
        <FilterSelect
          value={type}
          onChange={(v) => { setType(v); setPage(1); }}
          allLabel="All types"
          width="w-44"
          options={[
            { value: "standard", label: "Standard" },
            { value: "ai", label: "AI personalized" },
          ]}
        />
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9 w-40" aria-label="Created from" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9 w-40" aria-label="Created to" />
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <RotateCcw className="mr-1.5 size-3.5" /> Reset filters
        </Button>
      </FilterBar>

      <div className="rounded-xl border bg-card">
        {campaignsQuery.isLoading ? (
          <LoadingRows />
        ) : campaignsQuery.isError ? (
          <EmptyState message={(campaignsQuery.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState message="No campaigns match these filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-[1900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-56 bg-card">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("name")}>
                        Campaign {sortIcon("name")}
                      </button>
                    </TableHead>
                    {COLUMNS.map((col) => (
                      <TableHead key={col.key} className={`whitespace-nowrap ${col.numeric ? "text-right" : ""}`}>
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(col.key)}>
                          {col.label} {sortIcon(col.key)}
                        </button>
                      </TableHead>
                    ))}
                    <TableHead className="sticky right-0 z-10 bg-card text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.rows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => setOpenId(row.id)}>
                      <TableCell className="sticky left-0 z-10 bg-card font-medium">
                        <div className="max-w-64 truncate">{row.name}</div>
                        {row.type === "ai" ? <div className="text-xs text-muted-foreground">AI personalized</div> : null}
                      </TableCell>
                      {COLUMNS.map((col) => (
                        <TableCell
                          key={col.key}
                          className={`whitespace-nowrap ${col.numeric ? "text-right tabular-nums" : "text-muted-foreground"}`}
                        >
                          {cell(row, col)}
                        </TableCell>
                      ))}
                      <TableCell className="sticky right-0 z-10 bg-card text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {allowedActions(row.status).map((action) => (
                            <Button
                              key={action}
                              size="sm"
                              variant="outline"
                              aria-label={`${action} ${row.name}`}
                              disabled={mutation.isPending}
                              onClick={() =>
                                action === "resume"
                                  ? mutation.mutate({ campaignId: row.id, action })
                                  : setConfirm({ id: row.id, name: row.name, action })
                              }
                            >
                              {action === "pause" ? <Pause className="size-3.5" /> : action === "resume" ? <Play className="size-3.5" /> : <Square className="size-3.5" />}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
              <span>
                {num(rows.length)} campaign(s) · page {paged.page} of {paged.pages}
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={paged.page >= paged.pages} onClick={() => setPage(paged.page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Sheet open={Boolean(openId)} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>{detailQuery.data?.campaign.name ?? "Campaign"}</SheetTitle>
          </SheetHeader>
          {detailQuery.isLoading ? (
            <LoadingRows />
          ) : detailQuery.isError ? (
            <EmptyState message={(detailQuery.error as Error).message} />
          ) : detailQuery.data ? (
            <CampaignDetail
              data={detailQuery.data}
              insights={insightsQuery.data}
              insightsLoading={insightsQuery.isLoading}
              onAction={(action) => {
                const c = detailQuery.data!.campaign;
                if (action === "resume") mutation.mutate({ campaignId: c.id, action });
                else setConfirm({ id: c.id, name: c.name, action });
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "stop" ? "Stop" : "Pause"} “{confirm?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "stop"
                ? "This marks the campaign completed and cancels messages that have not been sent yet. Already-sent email is unaffected and no customer data is deleted."
                : "Sending stops until the campaign is resumed. Nothing is deleted and no email is sent by this action."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) mutation.mutate({ campaignId: confirm.id, action: confirm.action });
                setConfirm(null);
              }}
            >
              {confirm?.action === "stop" ? "Stop campaign" : "Pause campaign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CampaignDetail({
  data,
  insights,
  insightsLoading,
  onAction,
}: {
  data: NonNullable<Awaited<ReturnType<typeof adminGetCampaign>>>;
  insights?: Awaited<ReturnType<typeof adminGetCampaignInsights>> | undefined;
  insightsLoading: boolean;
  onAction: (action: "pause" | "resume" | "stop") => void;
}) {
  const c = data.campaign;
  const t = insights?.totals;
  return (
    <div className="mt-4 space-y-5 px-4 pb-8">
      <div className="flex flex-wrap gap-2">
        {allowedActions(c.status).map((action) => (
          <Button key={action} size="sm" variant="outline" className="capitalize" onClick={() => onAction(action)}>
            {action === "pause" ? <Pause className="mr-1.5 size-3.5" /> : action === "resume" ? <Play className="mr-1.5 size-3.5" /> : <Square className="mr-1.5 size-3.5" />}
            {action}
          </Button>
        ))}
      </div>
      <h3 className="text-sm font-semibold">Overview</h3>
      <DetailGrid
        items={[
          { label: "Created", value: fmtDate(c.createdAt) },
          { label: "Start date", value: fmtDate(insights?.overview.startAt ?? null) },
          { label: "Total leads", value: num(data.stats.recipients) },
          { label: "Sequence steps", value: num(data.steps.length) },
          { label: "Workspace", value: c.workspaceName },
          { label: "Owner", value: c.ownerEmail ?? "—" },
          { label: "Status", value: <Pill tone={statusTone(c.status)}>{c.status}</Pill> },
          { label: "Launched", value: fmtDate(c.launchedAt) },
          { label: "Daily cap", value: num(c.dailyCap) },
          { label: "Max per hour", value: num(c.maxPerHour) },
          { label: "Timezone", value: c.timezone ?? "—" },
          {
            label: "Sending window",
            value: `${c.sendStartHour ?? "—"}:00 – ${c.sendEndHour ?? "—"}:00`,
          },
        ]}
      />

      <h3 className="text-sm font-semibold">Sending performance</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Sent" value={t ? num(t.sent) : "…"} hint="Accepted by mailbox" />
        <StatCard
          label="Delivered"
          value={t ? num(t.delivered ?? 0) : "…"}
          hint="Delivery receipts only"
        />
        <StatCard label="Bounced" value={t ? num(t.bounced) : "…"} />
        <StatCard label="Failed" value={t ? num(t.failed) : "…"} hint="Excludes bounces and unknown" />
        <StatCard label="Held for review" value={t ? num(t.unknown) : "…"} hint="Not failed; never resent" />
        <StatCard label="Positive replies" value={num(data.stats.positiveReplies)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Recipients" value={num(data.stats.recipients)} />
        <StatCard label="Sent" value={num(data.stats.sent)} />
        <StatCard label="Queued" value={num(data.stats.queued)} />
        <StatCard label="Opens (unique)" value={num(data.stats.opens)} />
        <StatCard
          label="Open rate"
          value={data.stats.sent > 0 ? `${data.stats.openRate}%` : "—"}
        />
        <StatCard label="Clicks (unique)" value={num(data.stats.clicks)} />
        <StatCard
          label="Click rate"
          value={data.stats.sent > 0 ? `${data.stats.clickRate}%` : "—"}
        />
        <StatCard label="Unsubscribes" value={num(data.stats.unsubscribes)} />
        <StatCard label="Replies" value={num(data.stats.replies)} />
        <StatCard label="Queued" value={t ? num(t.queued) : "…"} hint="Pending, scheduled or processing" />
      </div>

      <p className="text-xs text-muted-foreground">
        Open and click rates count each contact once, however many times they open or click (raw
        loads: {num(data.stats.rawOpens)} opens, {num(data.stats.rawClicks)} clicks). Apple Mail
        Privacy Protection loads tracking images automatically on delivery;{" "}
        {num(data.stats.prefetchOpens)} such automatic loads were detected and left out of the rate.
        Detection is best-effort, so opens can still be slightly overstated.
      </p>


      <Tabs defaultValue="activity-chart">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="activity-chart">Sending activity</TabsTrigger>
          <TabsTrigger value="diagnostics">Problems</TabsTrigger>
          <TabsTrigger value="leads">Lead activity</TabsTrigger>
          <TabsTrigger value="sequence">Sequence</TabsTrigger>
          <TabsTrigger value="recipients">Recipients</TabsTrigger>
          <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
          <TabsTrigger value="activity">Recent sends</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

        <TabsContent value="activity-chart" className="pt-3">
          <SendingActivity data={insights} loading={insightsLoading} />
        </TabsContent>
        <TabsContent value="diagnostics" className="pt-3">
          <Diagnostics data={insights} loading={insightsLoading} />
        </TabsContent>
        <TabsContent value="leads" className="pt-3">
          <LeadActivity data={insights} loading={insightsLoading} />
        </TabsContent>

        <TabsContent value="sequence" className="space-y-2 pt-3">
          {data.steps.length === 0 ? (
            <EmptyState message="No steps configured." />
          ) : (
            data.steps.map((step: any) => (
              <div key={step.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">
                  Step {step.order}: {step.name ?? step.subject ?? step.type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {step.type} · wait {num(step.waitDays)}d {num(step.waitHours)}h ·{" "}
                  {step.variants.length} variant(s)
                </p>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="recipients" className="pt-3">
          {data.recipients.length === 0 ? (
            <EmptyState message="No recipients." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Last sent</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Clicked</TableHead>
                  <TableHead>Unsubscribed</TableHead>

                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recipients.slice(0, 50).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.email ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.company ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <Pill tone={r.status === "replied" ? "good" : "muted"}>{r.status}</Pill>
                    </TableCell>
                    <TableCell>{num(r.currentStep)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(r.lastSentAt)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.openedAt
                        ? `${fmtDate(r.openedAt)}${r.openCount > 1 ? ` (${num(r.openCount)}x)` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.clickedAt
                        ? `${fmtDate(r.clickedAt)}${r.clickCount > 1 ? ` (${num(r.clickCount)}x)` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.unsubscribedAt ? fmtDate(r.unsubscribedAt) : "—"}
                    </TableCell>

                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="mailboxes" className="space-y-2 pt-3">
          {data.sendingAccounts.length === 0 ? (
            <EmptyState message="No mailboxes attached." />
          ) : (
            data.sendingAccounts.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{a.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.provider} · daily limit {num(a.dailyLimit)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Pill tone={a.status === "verified" ? "good" : "warn"}>{a.status}</Pill>
                  <Pill tone={a.warmupStatus === "warming" ? "info" : "muted"}>
                    {a.warmupStatus ?? "no warmup"}
                  </Pill>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="activity" className="pt-3">
          {data.activity.length === 0 ? (
            <EmptyState message="No sending activity recorded yet." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.activity.map((a: any) => (
                <li key={a.id} className="rounded-lg border p-3">
                  <p className="font-medium">{a.subject ?? "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.email} · {fmtDate(a.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="errors" className="pt-3">
          {data.errors.length === 0 ? (
            <EmptyState message="No delivery errors recorded." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.errors.map((e: any) => (
                <li key={e.id} className="rounded-lg border border-destructive/30 p-3">
                  <p className="font-medium text-destructive">{e.error}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.email} · {fmtDate(e.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
