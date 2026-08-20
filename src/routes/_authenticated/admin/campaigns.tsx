import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pause, Play, Square } from "lucide-react";

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
  adminListCampaigns,
  adminOutreachFilters,
} from "@/lib/admin-outreach.functions";

export const Route = createFileRoute("/_authenticated/admin/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — Sendloop Admin" },
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

function AdminCampaignsPage() {
  const queryClient = useQueryClient();
  const listCampaigns = useServerFn(adminListCampaigns);
  const getCampaign = useServerFn(adminGetCampaign);
  const control = useServerFn(adminCampaignControl);
  const loadFilters = useServerFn(adminOutreachFilters);

  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [status, setStatus] = useState("all");
  const [account, setAccount] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string; action: "stop" } | null>(null);

  const options = useQuery({
    queryKey: ["admin", "outreach", "filters"],
    queryFn: () => loadFilters(),
  });

  const filters = {
    workspaceId: workspace === "all" ? null : workspace,
    status: status === "all" ? null : status,
    sendingAccountId: account === "all" ? null : account,
    from: from ? new Date(from).toISOString() : null,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
    search: search.trim() || null,
  };

  const campaignsQuery = useQuery({
    queryKey: ["admin", "outreach", "campaigns", filters],
    queryFn: () => listCampaigns({ data: filters }),
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "outreach", "campaign", openId],
    queryFn: () => getCampaign({ data: { campaignId: openId! } }),
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

  const rows = campaignsQuery.data ?? [];
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          sent: acc.sent + r.sent,
          replies: acc.replies + r.replies,
          bounces: acc.bounces + r.bounces,
          active: acc.active + (r.status === "active" ? 1 : 0),
        }),
        { sent: 0, replies: 0, bounces: 0, active: 0 },
      ),
    [rows],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Campaigns"
        description="Every campaign across every workspace. Metrics come straight from the sending pipeline — admin controls change campaign state only and never force a send."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Campaigns" value={num(rows.length)} />
        <StatCard label="Active" value={num(totals.active)} />
        <StatCard label="Emails sent" value={num(totals.sent)} />
        <StatCard
          label="Reply rate"
          value={pct(totals.replies, totals.sent)}
          hint={`${num(totals.bounces)} bounces / failures`}
        />
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search campaign name" />
        <FilterSelect
          value={workspace}
          onChange={setWorkspace}
          allLabel="All workspaces"
          options={(options.data?.workspaces ?? []).map((w: { id: string; name: string }) => ({ value: w.id, label: w.name }))}
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          allLabel="All statuses"
          width="w-40"
          options={STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          value={account}
          onChange={setAccount}
          allLabel="All mailboxes"
          width="w-56"
          options={(options.data?.sendingAccounts ?? []).map((a: { id: string; email: string }) => ({
            value: a.id,
            label: a.email,
          }))}
        />
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 w-40"
          aria-label="Created from"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 w-40"
          aria-label="Created to"
        />
      </FilterBar>

      <div className="rounded-xl border bg-card">
        {campaignsQuery.isLoading ? (
          <LoadingRows />
        ) : campaignsQuery.isError ? (
          <EmptyState message={(campaignsQuery.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState message="No campaigns match these filters." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Opens</TableHead>
                <TableHead className="text-right">Replies</TableHead>
                <TableHead className="text-right">Bounces</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setOpenId(row.id)}
                >
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.workspaceName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.ownerEmail ?? row.ownerName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Pill tone={statusTone(row.status)}>{row.status}</Pill>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.leads)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.sent)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.opens)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.replies)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.bounces)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDate(row.lastActivityAt)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {row.status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mutation.mutate({ campaignId: row.id, action: "pause" })
                          }
                        >
                          <Pause className="size-3.5" />
                        </Button>
                      ) : null}
                      {row.status === "paused" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mutation.mutate({ campaignId: row.id, action: "resume" })
                          }
                        >
                          <Play className="size-3.5" />
                        </Button>
                      ) : null}
                      {row.status === "active" || row.status === "paused" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setConfirm({ id: row.id, name: row.name, action: "stop" })
                          }
                        >
                          <Square className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={Boolean(openId)} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{detailQuery.data?.campaign.name ?? "Campaign"}</SheetTitle>
          </SheetHeader>
          {detailQuery.isLoading ? (
            <LoadingRows />
          ) : detailQuery.isError ? (
            <EmptyState message={(detailQuery.error as Error).message} />
          ) : detailQuery.data ? (
            <CampaignDetail data={detailQuery.data} />
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the campaign completed and cancels messages that have not been sent yet.
              Already-delivered email is unaffected and no customer data is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) mutation.mutate({ campaignId: confirm.id, action: "stop" });
                setConfirm(null);
              }}
            >
              Stop campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CampaignDetail({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof adminGetCampaign>>>;
}) {
  const c = data.campaign;
  return (
    <div className="mt-4 space-y-5 px-4 pb-8">
      <DetailGrid
        items={[
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

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Recipients" value={num(data.stats.recipients)} />
        <StatCard label="Sent" value={num(data.stats.sent)} />
        <StatCard label="Queued" value={num(data.stats.queued)} />
        <StatCard label="Opens" value={num(data.stats.opens)} />
        <StatCard label="Replies" value={num(data.stats.replies)} />
        <StatCard label="Bounces / failed" value={num(data.stats.bounces + data.stats.failed)} />
      </div>

      <Tabs defaultValue="sequence">
        <TabsList>
          <TabsTrigger value="sequence">Sequence</TabsTrigger>
          <TabsTrigger value="recipients">Recipients</TabsTrigger>
          <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

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
