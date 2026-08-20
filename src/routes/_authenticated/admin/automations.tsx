import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { describeStep, triggerLabel } from "@/lib/automation-model";
import {
  adminAutomationControl,
  adminGetAutomation,
  adminListAutomations,
} from "@/lib/admin-phase5.functions";
import { adminOutreachFilters } from "@/lib/admin-outreach.functions";

export const Route = createFileRoute("/_authenticated/admin/automations")({
  head: () => ({
    meta: [
      { title: "Automations — MunchReach Admin" },
      {
        name: "description",
        content:
          "Every customer automation with real execution statistics, workflow steps, run history and errors from the live automation engine.",
      },
      { property: "og:title", content: "Automations — MunchReach Admin" },
      {
        property: "og:description",
        content: "Cross-workspace automation monitoring with safe enable, pause and disable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAutomationsPage,
});

const STATUSES = ["draft", "active", "paused", "archived"];

function statusTone(status: string) {
  if (status === "active") return "good" as const;
  if (status === "paused") return "warn" as const;
  if (status === "archived") return "bad" as const;
  return "muted" as const;
}

function AdminAutomationsPage() {
  const queryClient = useQueryClient();
  const listAutomations = useServerFn(adminListAutomations);
  const getAutomation = useServerFn(adminGetAutomation);
  const control = useServerFn(adminAutomationControl);
  const loadFilters = useServerFn(adminOutreachFilters);

  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [status, setStatus] = useState("all");
  const [trigger, setTrigger] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const options = useQuery({
    queryKey: ["admin", "outreach", "filters"],
    queryFn: () => loadFilters(),
  });

  const filters = {
    workspaceId: workspace === "all" ? null : workspace,
    status: status === "all" ? null : status,
    trigger: trigger === "all" ? null : trigger,
    search: search.trim() || null,
  };

  const list = useQuery({
    queryKey: ["admin", "automations", filters],
    queryFn: () => listAutomations({ data: filters }),
    refetchOnWindowFocus: true,
  });

  const detail = useQuery({
    queryKey: ["admin", "automations", "detail", openId],
    queryFn: () => getAutomation({ data: { automationId: openId! } }),
    enabled: Boolean(openId),
    // Runs move through the existing worker; refresh while a run is in flight.
    refetchInterval: (query) =>
      (query.state.data as any)?.runs?.some((r: any) =>
        ["queued", "running", "waiting"].includes(r.status),
      )
        ? 15000
        : false,
  });

  const act = useMutation({
    mutationFn: (input: { automationId: string; action: "enable" | "disable" | "pause" }) =>
      control({ data: input }),
    onSuccess: () => {
      toast.success("Automation updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "automations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = list.data ?? [];
  const triggers = Array.from(new Set(rows.map((r: any) => r.triggerType)));
  const totals = rows.reduce(
    (acc: any, r: any) => ({
      runs: acc.runs + r.runs,
      ok: acc.ok + r.successful,
      failed: acc.failed + r.failed,
      active: acc.active + (r.status === "active" ? 1 : 0),
    }),
    { runs: 0, ok: 0, failed: 0, active: 0 },
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Automations"
        description="Every workflow customers have built, with statistics straight from the automation runs table. Admin controls only change status — the existing engine, queue and worker keep all safety controls."
        actions={
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Automations" value={num(rows.length)} />
        <StatCard label="Active" value={num(totals.active)} />
        <StatCard label="Total runs" value={num(totals.runs)} />
        <StatCard label="Successful runs" value={num(totals.ok)} />
        <StatCard label="Failed runs" value={num(totals.failed)} />
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search automation name" />
        <FilterSelect
          value={workspace}
          onChange={setWorkspace}
          allLabel="All workspaces"
          options={(options.data?.workspaces ?? []).map((w: any) => ({
            value: w.id,
            label: w.name,
          }))}
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          allLabel="All statuses"
          options={STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          value={trigger}
          onChange={setTrigger}
          allLabel="All triggers"
          width="w-56"
          options={triggers.map((t: string) => ({ value: t, label: triggerLabel(t) }))}
        />
      </FilterBar>

      <div className="rounded-xl border bg-card">
        {list.isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Automation</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead>Last execution</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: any) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setOpenId(row.id)}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.workspaceName}</TableCell>
                  <TableCell>
                    <Pill tone={statusTone(row.status)}>{row.status}</Pill>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {triggerLabel(row.triggerType)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.runs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.successful)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.failed)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(row.lastRunAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(row.createdAt)}</TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          act.isPending || row.status === "active" || row.status === "archived"
                        }
                        onClick={() => act.mutate({ automationId: row.id, action: "enable" })}
                      >
                        Enable
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          act.isPending || row.status !== "active"
                        }
                        onClick={() => act.mutate({ automationId: row.id, action: "pause" })}
                      >
                        Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          act.isPending || row.status === "draft" || row.status === "archived"
                        }
                        onClick={() => act.mutate({ automationId: row.id, action: "disable" })}
                      >
                        Disable
                      </Button>
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
            <SheetTitle>{detail.data?.automation.name ?? "Automation"}</SheetTitle>
          </SheetHeader>
          {detail.isLoading ? (
            <LoadingRows />
          ) : detail.data ? (
            <div className="mt-4 space-y-5">
              <DetailGrid
                items={[
                  { label: "Workspace", value: detail.data.automation.workspaceName },
                  {
                    label: "Status",
                    value: <Pill tone={statusTone(detail.data.automation.status)}>{detail.data.automation.status}</Pill>,
                  },
                  { label: "Trigger", value: triggerLabel(detail.data.automation.triggerType) },
                  { label: "Condition logic", value: detail.data.automation.conditionLogic },
                  { label: "Version", value: num(detail.data.automation.version) },
                  { label: "Last run", value: fmtDate(detail.data.automation.lastRunAt) },
                  { label: "Created", value: fmtDate(detail.data.automation.createdAt) },
                  { label: "Updated", value: fmtDate(detail.data.automation.updatedAt) },
                ]}
              />

              <Tabs defaultValue="workflow">
                <TabsList>
                  <TabsTrigger value="workflow">Workflow</TabsTrigger>
                  <TabsTrigger value="runs">Runs</TabsTrigger>
                  <TabsTrigger value="errors">Errors</TabsTrigger>
                </TabsList>

                <TabsContent value="workflow" className="pt-3">
                  {detail.data.steps.length === 0 ? (
                    <EmptyState message="No steps configured" />
                  ) : (
                    <ol className="space-y-2 text-sm">
                      {detail.data.steps.map((s: any) => (
                        <li key={s.id} className="rounded-lg border bg-muted/30 p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium capitalize">
                              {s.position + 1}. {s.kind}
                              {s.branch ? ` (${s.branch})` : ""}
                            </span>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {describeStep({ kind: s.kind, config: s.config })}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>

                <TabsContent value="runs" className="pt-3">
                  {detail.data.runs.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <ul className="space-y-3 text-sm">
                      {detail.data.runs.map((r: any) => (
                        <li key={r.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                              <Pill
                                tone={
                                  r.status === "completed"
                                    ? "good"
                                    : r.status === "failed"
                                      ? "bad"
                                      : "info"
                                }
                              >
                                {r.status}
                              </Pill>
                              <span className="text-muted-foreground">
                                {r.leadEmail ?? "—"} · step {r.currentStep}
                              </span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {fmtDate(r.completedAt ?? r.createdAt)}
                            </span>
                          </div>
                          {r.error ? (
                            <p className="mt-1 text-xs text-destructive">{r.error}</p>
                          ) : null}
                          {r.steps.length ? (
                            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {r.steps.map((s: any) => (
                                <li key={s.id}>
                                  {s.position + 1}. {s.label} — {s.status}
                                  {s.error ? ` · ${s.error}` : ""}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="errors" className="pt-3">
                  {detail.data.errors.length === 0 ? (
                    <EmptyState message="No failed runs" />
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {detail.data.errors.map((e: any) => (
                        <li key={e.id} className="rounded-lg border border-destructive/40 p-3">
                          <p className="text-destructive">{e.error}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{fmtDate(e.at)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
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
