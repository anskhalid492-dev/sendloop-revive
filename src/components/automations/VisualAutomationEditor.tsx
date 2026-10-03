import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, FlaskConical, Pause, Play, Save, Zap } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkflowBuilder } from "@/components/automations/WorkflowBuilder";
import { TestWorkflowDialog } from "@/components/automations/TestWorkflowDialog";
import {
  AUTOMATION_STATUS_TONE,
  AVAILABLE_TRIGGERS,
  TRIGGER_PRESETS,
  TRIGGERS,
  WORKFLOW_ACTIONS,
  type AutomationRow,
  type AutomationStatus,
} from "@/lib/automation-model";
import { getAutomationOptions, listAutomations, saveAutomation, setAutomationStatus } from "@/lib/automations.functions";
import { validateWorkflowIssues, workflowToStep, type Workflow } from "@/lib/workflow-graph";

const TRIGGER_GROUPS = ["Leads", "Email", "Inbox", "Campaigns", "Sales", "CRM", "Meetings", "Infrastructure", "Workflows", "Webhooks"];

/** Trigger value in the picker: plain trigger id, or "preset:<id>". */
function pickerValue(trigger: string, config: Record<string, unknown>): string {
  const preset = TRIGGER_PRESETS.find(
    (p) => p.trigger === trigger && Object.entries(p.config).every(([k, v]) => String(config[k] ?? "").toLowerCase() === v),
  );
  return preset ? `preset:${preset.id}` : trigger;
}

export function VisualAutomationEditor({
  workspaceId,
  automation,
  initialWorkflow,
  onSaved,
}: {
  workspaceId: string;
  automation: AutomationRow;
  initialWorkflow: Workflow;
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const save = useServerFn(saveAutomation);
  const setStatus = useServerFn(setAutomationStatus);
  const fetchOptions = useServerFn(getAutomationOptions);
  const fetchList = useServerFn(listAutomations);

  const [name, setName] = useState(automation.name);
  const [description, setDescription] = useState(automation.description ?? "");
  const [trigger, setTrigger] = useState(automation.trigger_type);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(automation.trigger_config ?? {});
  const [workflow, setWorkflow] = useState<Workflow>(initialWorkflow);
  const [status, setLocalStatus] = useState<AutomationStatus>(automation.status);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => setLocalStatus(automation.status), [automation.status]);

  const optionsQuery = useQuery({
    queryKey: ["automation-options", workspaceId],
    queryFn: () => fetchOptions({ data: { workspaceId } }),
  });
  const listQuery = useQuery({
    queryKey: ["automations", workspaceId],
    queryFn: () => fetchList({ data: { workspaceId } }),
  });

  const options = useMemo(
    () => ({
      campaigns: optionsQuery.data?.campaigns ?? [],
      stages: optionsQuery.data?.stages ?? [],
      members: optionsQuery.data?.members ?? [],
      workflows: (listQuery.data?.items ?? []).filter((a) => a.id !== automation.id).map((a) => ({ id: a.id, name: a.name })),
    }),
    [optionsQuery.data, listQuery.data, automation.id],
  );

  const [testOpen, setTestOpen] = useState(false);
  const issues = useMemo(
    () =>
      validateWorkflowIssues(workflow, WORKFLOW_ACTIONS.map((a) => a.id), {
        automationId: automation.id,
        triggerType: trigger,
        triggerTag: String(triggerConfig["tag"] ?? ""),
        supportedTriggers: AVAILABLE_TRIGGERS.map((t) => t.id),
        ...(optionsQuery.data
          ? {
              campaignIds: optionsQuery.data.campaigns.map((c) => c.id),
              stageIds: optionsQuery.data.stages.map((s) => s.id),
              memberIds: optionsQuery.data.members.map((m) => m.id),
            }
          : {}),
        ...(listQuery.data ? { workflowIds: listQuery.data.items.map((a) => a.id) } : {}),
      }),
    [workflow, trigger, triggerConfig, automation.id, optionsQuery.data, listQuery.data],
  );
  const errors = useMemo(() => Array.from(new Set(issues.map((i) => i.message))), [issues]);
  const issuesByNode = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const i of issues) if (i.nodeId) (map[i.nodeId] ??= []).includes(i.message) || map[i.nodeId]!.push(i.message);
    return map;
  }, [issues]);
  const generalErrors = useMemo(() => Array.from(new Set(issues.filter((i) => !i.nodeId).map((i) => i.message))), [issues]);

  const change = (next: Workflow) => {
    setWorkflow(next);
    setDirty(true);
  };

  const persist = async () => {
    await save({
      data: {
        workspaceId,
        automationId: automation.id,
        name: name.trim(),
        description: description.trim() || null,
        triggerType: trigger,
        triggerConfig,
        conditionLogic: "and",
        steps: [workflowToStep(workflow) as never],
      },
    });
    setDirty(false);
  };

  const handleSave = async () => {
    if (name.trim().length < 2) {
      toast.error("Give your workflow a name");
      return;
    }
    setSaving(true);
    try {
      await persist();
      toast.success("Draft saved");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (next: AutomationStatus) => {
    if (next === "active" && errors.length) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    try {
      if (dirty || next === "active") await persist();
      await setStatus({ data: { workspaceId, automationId: automation.id, status: next } });
      setLocalStatus(next);
      toast.success(next === "active" ? "Workflow is live" : next === "paused" ? "Workflow paused" : "Saved");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change status");
    } finally {
      setSaving(false);
    }
  };

  const triggerDef = TRIGGERS.find((t) => t.id === trigger);

  return (
    <AppShell
      title={name || "Workflow"}
      description="When this happens → check this → wait → do this. Every step runs on the server."
      actions={
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/automations" })}>
            <ArrowLeft className="mr-2 size-4" /> Back
          </Button>
          <Button variant="ghost" size="sm" disabled={saving} onClick={handleSave}>
            <Save className="mr-2 size-4" /> Save draft
          </Button>
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => setTestOpen(true)}>
            <FlaskConical className="mr-2 size-4" /> Test workflow
          </Button>
          {status === "active" ? (
            <Button size="sm" variant="outline" disabled={saving} onClick={() => changeStatus("paused")}>
              <Pause className="mr-2 size-4" /> Pause
            </Button>
          ) : (
            <Button size="sm" disabled={saving} onClick={() => changeStatus("active")}>
              <Play className="mr-2 size-4" /> {status === "paused" ? "Resume" : "Activate"}
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="mx-auto w-full max-w-md rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="size-4 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">When this happens</p>
                <Select
                  value={pickerValue(trigger, triggerConfig)}
                  onValueChange={(value) => {
                    const preset = value.startsWith("preset:") ? TRIGGER_PRESETS.find((p) => `preset:${p.id}` === value) : null;
                    setTrigger(preset ? preset.trigger : value);
                    setTriggerConfig(preset ? { ...preset.config } : {});
                    setDirty(true);
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-96">
                    {TRIGGER_GROUPS.map((group) => {
                      const items = AVAILABLE_TRIGGERS.filter((t) => t.group === group);
                      const presets = TRIGGER_PRESETS.filter((p) => p.group === group);
                      if (!items.length && !presets.length) return null;
                      return [
                        ...items.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {group} · {t.label}
                          </SelectItem>
                        )),
                        ...presets.map((p) => (
                          <SelectItem key={p.id} value={`preset:${p.id}`}>
                            {group} · {p.label}
                          </SelectItem>
                        )),
                      ];
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {triggerDef && <p className="mt-2 text-xs text-muted-foreground">{triggerDef.description}</p>}
            {(trigger === "lead.tag_added" || trigger === "lead.tag_removed") && (
              <Input
                className="mt-2"
                placeholder="Only for this tag (optional)"
                value={String(triggerConfig["tag"] ?? "")}
                onChange={(e) => {
                  setTriggerConfig({ ...triggerConfig, tag: e.target.value });
                  setDirty(true);
                }}
              />
            )}
          </section>

          <WorkflowBuilder workflow={workflow} onChange={change} options={options} issues={issuesByNode} />
          <TestWorkflowDialog
            open={testOpen}
            onOpenChange={setTestOpen}
            workspaceId={workspaceId}
            automationId={automation.id}
            triggerType={trigger}
            workflow={workflow}
          />

        </div>

        <aside className="space-y-4">
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Workflow</h2>
              <Badge variant="outline" className={AUTOMATION_STATUS_TONE[status]}>
                {status}
              </Badge>
            </div>
            <div className="space-y-1">
              <Label htmlFor="wf-name">Name</Label>
              <Input id="wf-name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wf-desc">Description</Label>
              <Textarea id="wf-desc" rows={2} value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} />
            </div>
            <div className="space-y-2 border-t pt-3 text-sm">
            <h2 className="font-semibold">Ready to activate?</h2>
            {errors.length === 0 ? (
              <p className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" /> Everything looks good.
              </p>
            ) : (
              <div className="space-y-1 text-xs text-muted-foreground">
                {generalErrors.length > 0 && (
                  <ul className="list-disc space-y-1 pl-4">
                    {generalErrors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
                {errors.length > generalErrors.length && (
                  <p className="text-destructive">
                    {Object.keys(issuesByNode).length} step{Object.keys(issuesByNode).length === 1 ? " needs" : "s need"} attention — open the steps marked with a red dot to fix them.
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Edits never change runs already in progress. A workflow can’t retrigger itself, and chains of workflows
              stop automatically after a few hops.
            </p>
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
