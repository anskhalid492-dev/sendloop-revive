import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  SkipForward,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutomationRealtime } from "@/hooks/useAutomationRealtime";
import { useWorkspace } from "@/hooks/useWorkspace";
import { RUN_STATUS_TONE, type RunStatus } from "@/lib/automation-model";
import {
  getAutomationRun,
  listAutomationRuns,
  listAutomations,
  retryAutomationRun,
} from "@/lib/automations.functions";

export const Route = createFileRoute("/_authenticated/automations/activity")({
  head: () => ({
    meta: [
      { title: "Automation activity — MunchReach" },
      {
        name: "description",
        content:
          "Inspect every automation run: filter by workflow, status and time, then open a full execution timeline with per-step output and errors.",
      },
      { property: "og:title", content: "Automation activity — MunchReach" },
      {
        property: "og:description",
        content: "Run-level observability for MunchReach automations, including step errors and safe retries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationActivityPage,
});

type StatusFilter = "all" | "completed" | "failed" | "waiting" | "running" | "cancelled";
type RangeFilter = "24h" | "7d" | "30d" | "all";

const RANGES: { id: RangeFilter; label: string; hours: number | null }[] = [
  { id: "24h", label: "Last 24 hours", hours: 24 },
  { id: "7d", label: "Last 7 days", hours: 24 * 7 },
  { id: "30d", label: "Last 30 days", hours: 24 * 30 },
  { id: "all", label: "All time", hours: null },
];

function stamp(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${Math.max(ms, 0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

const STEP_ICON: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  failed: XCircle,
  skipped: SkipForward,
  waiting: Clock,
  running: Loader2,
};

const STEP_TONE: Record<string, string> = {
  completed: "text-emerald-600 dark:text-emerald-400",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
  waiting: "text-amber-600 dark:text-amber-400",
  running: "text-primary",
};

function AutomationActivityPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? null;
  const queryClient = useQueryClient();

  const fetchRuns = useServerFn(listAutomationRuns);
  const fetchList = useServerFn(listAutomations);
  const fetchRun = useServerFn(getAutomationRun);
  const retry = useServerFn(retryAutomationRun);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [automationId, setAutomationId] = useState<string>("all");
  const [range, setRange] = useState<RangeFilter>("7d");
  const [search, setSearch] = useState("");
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Realtime keeps this page honest: the worker runs server-side, so status
  // changes arrive over the socket instead of needing a reload.
  useAutomationRealtime(workspaceId);

  const since = useMemo(() => {
    const hours = RANGES.find((r) => r.id === range)?.hours ?? null;
    return hours === null ? undefined : new Date(Date.now() - hours * 3_600_000).toISOString();
  }, [range]);

  const workflows = useQuery({
    queryKey: ["automations", workspaceId],
    queryFn: () => fetchList({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  const runsQuery = useQuery({
    queryKey: ["automation-runs", workspaceId, status, automationId, range],
    queryFn: () =>
      fetchRuns({
        data: {
          workspaceId: workspaceId!,
          status,
          limit: 200,
          ...(automationId === "all" ? {} : { automationId }),
          ...(since ? { since } : {}),
        },
      }),
    enabled: Boolean(workspaceId),
  });

  const runDetail = useQuery({
    queryKey: ["automation-run", workspaceId, openRun],
    queryFn: () => fetchRun({ data: { workspaceId: workspaceId!, runId: openRun! } }),
    enabled: Boolean(workspaceId && openRun),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = runsQuery.data ?? [];
    if (!term) return all;
    return all.filter((r) =>
      [r.automationName, r.leadEmail, r.trigger_type, r.error, r.result]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [runsQuery.data, search]);

  const counts = useMemo(() => {
    const all = runsQuery.data ?? [];
    return {
      total: all.length,
      failed: all.filter((r) => r.status === "failed").length,
      waiting: all.filter((r) => ["waiting", "queued", "running"].includes(r.status)).length,
      completed: all.filter((r) => r.status === "completed").length,
    };
  }, [runsQuery.data]);

  const handleRetry = async (runId: string) => {
    if (!workspaceId) return;
    setRetrying(runId);
    try {
      await retry({ data: { workspaceId, runId } });
      toast.success("Run re-queued — it resumes at the failed step");
      void queryClient.invalidateQueries({ queryKey: ["automation-runs"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-run"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retry this run");
    } finally {
      setRetrying(null);
    }
  };

  return (
    <AppShell
      title="Automation activity"
      description="Every execution the engine has processed, with the exact step that ran, what it returned and why it failed."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/automations/workflows">
              <ArrowLeft className="mr-2 size-4" /> Workflows
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["automation-runs"] })}
          >
            <RefreshCw className="mr-2 size-4" /> Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Runs in range", value: counts.total },
            { label: "Completed", value: counts.completed },
            { label: "In progress", value: counts.waiting },
            { label: "Failed", value: counts.failed },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border bg-card p-4">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</span>
              <p className="mt-2 text-2xl font-semibold">
                {runsQuery.isLoading ? <Skeleton className="h-7 w-14" /> : card.value}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by contact, workflow, trigger or error"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select value={automationId} onValueChange={setAutomationId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All workflows" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All workflows</SelectItem>
              {(workflows.data?.items ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(value) => setRange(value as RangeFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {runsQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <AlertTriangle className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-medium">No runs match these filters</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Runs appear here the moment a trigger fires — a reply landing in the inbox, a delivery webhook or a CRM
              stage change.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Workflow</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Trigger</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((run) => (
                  <tr key={run.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <button className="text-left font-medium hover:underline" onClick={() => setOpenRun(run.id)}>
                        {run.automationName}
                      </button>
                      {run.error && <p className="mt-0.5 line-clamp-1 text-xs text-destructive">{run.error}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{run.leadEmail ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{run.trigger_type}</td>
                    <td className="px-4 py-3 text-muted-foreground">{stamp(run.started_at ?? run.created_at)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={RUN_STATUS_TONE[run.status as RunStatus]}>
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {(run.status === "failed" || run.status === "cancelled") && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={retrying === run.id}
                            onClick={() => void handleRetry(run.id)}
                          >
                            <RotateCcw className="mr-2 size-3.5" /> Retry
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setOpenRun(run.id)}>
                          Timeline
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={Boolean(openRun)} onOpenChange={(open) => !open && setOpenRun(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Execution timeline</SheetTitle>
            <SheetDescription>
              Each row is a step the engine actually executed, in order, with its output or error.
            </SheetDescription>
          </SheetHeader>

          {runDetail.isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : runDetail.data ? (
            <div className="space-y-5 p-4">
              <div className="rounded-xl border bg-card p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary" className={RUN_STATUS_TONE[runDetail.data.run.status]}>
                    {runDetail.data.run.status}
                  </Badge>
                  {(runDetail.data.run.status === "failed" || runDetail.data.run.status === "cancelled") && (
                    <Button
                      size="sm"
                      disabled={retrying === runDetail.data.run.id}
                      onClick={() => void handleRetry(runDetail.data!.run.id)}
                    >
                      <RotateCcw className="mr-2 size-3.5" /> Retry failed step
                    </Button>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt>Trigger</dt>
                    <dd className="text-foreground">{runDetail.data.run.trigger_type}</dd>
                  </div>
                  <div>
                    <dt>Attempts</dt>
                    <dd className="text-foreground">{runDetail.data.run.attempts}</dd>
                  </div>
                  <div>
                    <dt>Started</dt>
                    <dd className="text-foreground">
                      {stamp(runDetail.data.run.started_at ?? runDetail.data.run.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt>Finished</dt>
                    <dd className="text-foreground">{stamp(runDetail.data.run.completed_at)}</dd>
                  </div>
                  {runDetail.data.run.resume_at && (
                    <div className="col-span-2">
                      <dt>Resumes at</dt>
                      <dd className="text-foreground">{stamp(runDetail.data.run.resume_at)}</dd>
                    </div>
                  )}
                </dl>
                {runDetail.data.run.error && (
                  <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {runDetail.data.run.error}
                  </p>
                )}
              </div>

              <ol className="space-y-3">
                {runDetail.data.steps.map((step) => {
                  const Icon = STEP_ICON[step.status] ?? Clock;
                  const took = duration(step.started_at, step.finished_at);
                  return (
                    <li key={step.id} className="rounded-xl border bg-card p-4">
                      <div className="flex items-start gap-3">
                        <Icon
                          className={`mt-0.5 size-4 shrink-0 ${STEP_TONE[step.status] ?? "text-muted-foreground"} ${
                            step.status === "running" ? "animate-spin" : ""
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{step.label}</span>
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {step.kind}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {stamp(step.started_at)}
                              {took ? ` · ${took}` : ""}
                            </span>
                          </div>
                          {step.error ? (
                            <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                              {step.error}
                            </p>
                          ) : summarizeOutput(step.output ?? {}) ? (
                            <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                              {summarizeOutput(step.output ?? {})}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {runDetail.data.steps.length === 0 && (
                  <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    This run has not executed a step yet.
                  </li>
                )}
              </ol>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

/** Plain-language summary of a run step's output for the timeline. */
function summarizeOutput(output: Record<string, unknown>): string {
  if (output["kind"] === "ai_decision") {
    const conf = typeof output["confidence"] === "number" ? `${Math.round((output["confidence"] as number) * 100)}%` : "—";
    const parts = [
      `AI Decision · Outcome: ${output["outcome"] ?? "none"}`,
      `Confidence: ${conf}`,
      output["reason"] ? `Reason: ${String(output["reason"])}` : "",
      `Selected path: ${String(output["pathLabel"] ?? "")}`,
      output["fallbackReason"] ? `(${String(output["fallbackReason"])})` : "",
    ];
    return parts.filter(Boolean).join(" · ");
  }
  if (output["kind"] === "ai_reply") {
    if (!output["generated"]) return `AI reply not generated: ${String(output["error"] ?? "")}${output["handedOff"] ? " · handed to a person" : ""}`;
    const mode = output["mode"] === "auto_send" ? "Auto-send" : "Draft";
    const forced = Array.isArray(output["forcedDraft"]) && (output["forcedDraft"] as string[]).length ? ` · kept as draft: ${(output["forcedDraft"] as string[]).join(" ")}` : "";
    return `AI reply generated · ${mode}${forced}`;
  }
  if (output["humanReview"]) return `Human review requested: ${String(output["reason"] ?? "")}`;
  if (typeof output["skipped"] === "string") return `Skipped: ${output["skipped"]}`;
  if (typeof output["pathLabel"] === "string") return `Took the “${output["pathLabel"]}” path`;
  if (typeof output["passed"] === "boolean") return output["passed"] ? "Condition met" : "Condition not met — workflow stopped here";
  if (typeof output["resume_at"] === "string") return `Waiting until ${new Date(output["resume_at"]).toLocaleString()}`;
  if (output["eventHappened"] === true) return "The awaited event happened";
  if (output["eventHappened"] === false) return "Stopped waiting: the event did not happen in time";
  if (output["resumed"]) return "Wait finished";
  if (output["ended"]) return "Workflow ended";
  const parts = Object.entries(output)
    .filter(([k, v]) => k !== "nodeId" && v !== null && typeof v !== "object")
    .map(([k, v]) => `${k}: ${String(v)}`);
  return parts.join(" · ");
}
