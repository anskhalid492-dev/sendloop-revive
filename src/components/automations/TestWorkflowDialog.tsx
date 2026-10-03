import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleSlash, Clock, Loader2, Play, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchSimulationLeads, simulateAutomation } from "@/lib/automations.functions";
import type { Workflow } from "@/lib/workflow-graph";
import type { SimStatus, SimulationResult } from "@/lib/workflow-simulator";

const STATUS_ICON: Record<SimStatus, { icon: typeof CheckCircle2; tone: string }> = {
  passed: { icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
  would_run: { icon: Clock, tone: "text-primary" },
  failed: { icon: XCircle, tone: "text-destructive" },
  stopped: { icon: CircleSlash, tone: "text-muted-foreground" },
  not_simulated: { icon: CircleSlash, tone: "text-amber-600 dark:text-amber-400" },
};

export function TestWorkflowDialog({
  open,
  onOpenChange,
  workspaceId,
  automationId,
  triggerType,
  workflow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  automationId: string;
  triggerType: string;
  workflow: Workflow;
}) {
  const search = useServerFn(searchSimulationLeads);
  const simulate = useServerFn(simulateAutomation);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
    }
  }, [open]);

  const leads = useQuery({
    queryKey: ["simulation-leads", workspaceId, debounced],
    queryFn: () => search({ data: { workspaceId, query: debounced } }),
    enabled: open,
  });

  const run = async () => {
    if (!leadId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await simulate({ data: { workspaceId, automationId, leadId, triggerType, workflow: workflow as never } });
      setResult(res as SimulationResult);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error && e.message.length < 140 ? e.message : "The simulation couldn't run. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test workflow</DialogTitle>
          <DialogDescription>
            A safe simulation. Nothing is sent, changed or created — you only see what would happen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-medium">Select a lead/contact</p>
          <Input placeholder="Search by name, email or company" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-48 overflow-y-auto rounded-md border">
            {leads.isLoading ? (
              <p className="p-3 text-xs text-muted-foreground">Loading leads…</p>
            ) : (leads.data ?? []).length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No leads found in this workspace.</p>
            ) : (
              (leads.data ?? []).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLeadId(l.id)}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted ${leadId === l.id ? "bg-primary/10" : ""}`}
                >
                  <span className="font-medium">{l.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {l.email}
                    {l.company ? ` · ${l.company}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
          <Button className="w-full" disabled={!leadId || running} onClick={run}>
            {running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />} Run simulation
          </Button>
        </div>

        {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-3">
            <ol className="space-y-2">
              {result.steps.map((step, i) => {
                const meta = STATUS_ICON[step.status];
                return (
                  <li key={i} className="flex gap-3 rounded-lg border p-3">
                    <meta.icon className={`mt-0.5 size-4 shrink-0 ${meta.tone}`} />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium">{step.title}</p>
                      {step.lines.map((line, j) => (
                        <p key={j} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{line.label}:</span> {line.value}
                        </p>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-semibold">Workflow simulation complete</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>Steps evaluated: {result.summary.stepsEvaluated}</li>
                <li>Branches evaluated: {result.summary.branchesEvaluated}</li>
                <li>Actions that would execute: {result.summary.actionsWouldExecute}</li>
                <li>Waits simulated: {result.summary.waitsSimulated}</li>
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
