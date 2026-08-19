import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAutomationRealtime } from "@/hooks/useAutomationRealtime";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  AUTOMATION_STATUS_TONE,
  AUTOMATION_TEMPLATES,
  RUN_STATUS_TONE,
  TRIGGERS,
  triggerLabel,
} from "@/lib/automation-model";
import {
  createAutomation,
  deleteAutomation,
  duplicateAutomation,
  listAutomationRuns,
  listAutomations,
  retryAutomationRun,
  setAutomationStatus,
} from "@/lib/automations.functions";

export const Route = createFileRoute("/_authenticated/automations/workflows")({
  head: () => ({
    meta: [
      { title: "Automations — Sendloop" },
      {
        name: "description",
        content:
          "Build real outbound workflows: trigger on replies, bookings and campaign events, then move contacts, enroll sequences and alert your team automatically.",
      },
      { property: "og:title", content: "Automations — Sendloop" },
      {
        property: "og:description",
        content: "Production workflow automation for cold email: triggers, conditions, waits and real actions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationsPage,
});

function relative(value: string | null) {
  if (!value) return "Never";
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function AutomationsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // The worker mutates runs server-side, so the dashboard listens instead of polling.
  useAutomationRealtime(workspaceId);

  const fetchList = useServerFn(listAutomations);
  const fetchRuns = useServerFn(listAutomationRuns);
  const create = useServerFn(createAutomation);
  const setStatus = useServerFn(setAutomationStatus);
  const duplicate = useServerFn(duplicateAutomation);
  const remove = useServerFn(deleteAutomation);
  const retry = useServerFn(retryAutomationRun);

  const [tab, setTab] = useState<"workflows" | "activity">("workflows");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "draft" | "archived">("all");
  const [runFilter, setRunFilter] = useState<"all" | "completed" | "failed" | "waiting" | "running">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState(TRIGGERS[0]!.id);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const listQuery = useQuery({
    queryKey: ["automations", workspaceId],
    queryFn: () => fetchList({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  const runsQuery = useQuery({
    queryKey: ["automation-runs", workspaceId, runFilter],
    queryFn: () => fetchRuns({ data: { workspaceId: workspaceId!, status: runFilter, limit: 80 } }),
    enabled: Boolean(workspaceId) && tab === "activity",
  });

  const stats = listQuery.data?.stats;
  const limit = listQuery.data?.limit;
  const items = useMemo(() => {
    const rows = listQuery.data?.items ?? [];
    return statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);
  }, [listQuery.data, statusFilter]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["automations", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["automation-runs", workspaceId] });
  };

  const handleCreate = async (templateId?: string) => {
    if (!workspaceId) return;
    const template = AUTOMATION_TEMPLATES.find((t) => t.id === templateId);
    const name = template ? template.name : newName.trim();
    if (!template && name.length < 2) {
      toast.error("Give your automation a name");
      return;
    }
    setBusy(true);
    try {
      const created = await create({
        data: {
          workspaceId,
          name,
          ...(template ? { description: template.description } : {}),
          triggerType: template ? template.trigger : newTrigger,
          steps: (template?.steps ?? []).map((s) => ({
            kind: s.kind,
            branch: s.branch ?? null,
            config: s.config,
          })),
        },
      });
      toast.success("Automation created as a draft");
      setCreateOpen(false);
      setNewName("");
      refresh();
      void navigate({ to: "/automations/$id", params: { id: created.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create automation");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (id: string, status: "active" | "paused" | "archived" | "draft") => {
    if (!workspaceId) return;
    try {
      await setStatus({ data: { workspaceId, automationId: id, status } });
      toast.success(
        status === "active" ? "Automation is live" : status === "paused" ? "Automation paused" : "Automation updated",
      );
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update automation");
    }
  };

  return (
    <AppShell
      title="Automations"
      description="Real workflows that keep running on the server — replies stop follow-ups, bookings move deals, and your team gets notified without anyone watching a dashboard."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-2 size-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" /> New automation
          </Button>
        </div>
      }
    >
      <div className="space-y-8">


        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Active workflows", value: stats?.active ?? 0, icon: Workflow },
            { label: "Runs (all time)", value: stats?.runs ?? 0, icon: Activity },
            { label: "Completed", value: stats?.successful ?? 0, icon: CheckCircle2 },
            { label: "Failed", value: stats?.failed ?? 0, icon: AlertTriangle },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</span>
                <card.icon className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {listQuery.isLoading ? <Skeleton className="h-7 w-14" /> : card.value}
              </p>
            </div>
          ))}
        </div>

        {limit?.max != null && (() => {
          const used = limit.used;
          const max = limit.max!;
          const reached = used >= max;
          const pct = Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
          return (
            <div
              className={`rounded-xl border p-4 ${reached ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {used} of {max} automations used on the {limit.planName} plan
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {reached
                      ? "You have reached your plan limit — publishing or creating another workflow is blocked until you upgrade or archive one."
                      : `${max - used} workflow slot${max - used === 1 ? "" : "s"} remaining.`}
                  </p>
                </div>
                {reached && (
                  <Button size="sm" asChild>
                    <Link to="/settings">
                      Upgrade plan
                    </Link>
                  </Button>
                )}
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${reached ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })()}

        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="workflows">Workflows</TabsTrigger>
              <TabsTrigger value="activity">Activity log</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/automations/activity">Open full activity</Link>
            </Button>
            {tab === "workflows" ? (
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="draft">Drafts</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={runFilter} onValueChange={(v) => setRunFilter(v as typeof runFilter)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All runs</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="waiting">Waiting</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </Tabs>

        {tab === "workflows" ? (
          <section className="space-y-6">
            {listQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <Workflow className="mx-auto size-8 text-muted-foreground" />
                <h2 className="mt-3 text-lg font-medium">No automations yet</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Start from a proven template below, or build your own trigger → condition → action workflow.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Automation</th>
                      <th className="px-4 py-3 font-medium">Trigger</th>
                      <th className="px-4 py-3 font-medium">Steps</th>
                      <th className="px-4 py-3 font-medium">Runs</th>
                      <th className="px-4 py-3 font-medium">Last run</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link
                            to="/automations/$id"
                            params={{ id: item.id }}
                            className="font-medium hover:underline"
                          >
                            {item.name}
                          </Link>
                          {item.description && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{triggerLabel(item.trigger_type)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.steps}</td>
                        <td className="px-4 py-3">
                          <span className="text-foreground">{item.runs}</span>
                          {item.failed > 0 && (
                            <span className="ml-2 text-xs text-destructive">{item.failed} failed</span>
                          )}
                          {item.waiting > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">{item.waiting} waiting</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{relative(item.last_run_at)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={AUTOMATION_STATUS_TONE[item.status]}>
                            {item.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${item.name}`}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {item.status === "active" ? (
                                <DropdownMenuItem onClick={() => changeStatus(item.id, "paused")}>
                                  <Pause className="mr-2 size-4" /> Pause
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => changeStatus(item.id, "active")}>
                                  <Play className="mr-2 size-4" /> Activate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={async () => {
                                  if (!workspaceId) return;
                                  try {
                                    const copy = await duplicate({ data: { workspaceId, automationId: item.id } });
                                    toast.success("Automation duplicated");
                                    refresh();
                                    void navigate({ to: "/automations/$id", params: { id: copy.id } });
                                  } catch (error) {
                                    toast.error(error instanceof Error ? error.message : "Could not duplicate");
                                  }
                                }}
                              >
                                <Copy className="mr-2 size-4" /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteTarget({ id: item.id, name: item.name })}
                              >
                                <Trash2 className="mr-2 size-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Start from a template
              </h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {AUTOMATION_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={busy}
                    onClick={() => handleCreate(template.id)}
                    className="rounded-xl border bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-sm disabled:opacity-60"
                  >
                    <p className="font-medium">{template.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                    <p className="mt-3 text-xs font-medium text-primary">{triggerLabel(template.trigger)}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border">
            {runsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (runsQuery.data ?? []).length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                No runs recorded yet. Activate an automation and the log will fill as real events arrive.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Automation</th>
                    <th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium">Trigger</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Detail</th>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(runsQuery.data ?? []).map((run) => (
                    <tr key={run.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{run.automationName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{run.leadEmail ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{triggerLabel(run.trigger_type)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={RUN_STATUS_TONE[run.status]}>
                          {run.status}
                        </Badge>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                        {run.error ? (
                          <span className="text-destructive">{run.error}</span>
                        ) : run.status === "waiting" && run.resume_at ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" /> Resumes {new Date(run.resume_at).toLocaleString()}
                          </span>
                        ) : (
                          (run.result ?? "—")
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{relative(run.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {(run.status === "failed" || run.status === "cancelled") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (!workspaceId) return;
                              try {
                                await retry({ data: { workspaceId, runId: run.id } });
                                toast.success("Run queued for retry");
                                refresh();
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : "Could not retry run");
                              }
                            }}
                          >
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New automation</DialogTitle>
            <DialogDescription>
              Pick the real event that starts this workflow. You can add conditions, waits and actions next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="automation-name">Name</Label>
              <Input
                id="automation-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Positive reply → book meeting"
              />
            </div>
            <div className="space-y-2">
              <Label>Trigger</Label>
              <Select value={newTrigger} onValueChange={setNewTrigger}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {TRIGGERS.map((trigger) => (
                    <SelectItem key={trigger.id} value={trigger.id}>
                      {trigger.group} · {trigger.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {TRIGGERS.find((t) => t.id === newTrigger)?.description}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => handleCreate()}>
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete automation</DialogTitle>
            <DialogDescription>
              {deleteTarget?.name} and its run history will be permanently removed. Contacts and campaigns are not
              affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!workspaceId || !deleteTarget) return;
                try {
                  await remove({ data: { workspaceId, automationId: deleteTarget.id } });
                  toast.success("Automation deleted");
                  setDeleteTarget(null);
                  refresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not delete automation");
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
