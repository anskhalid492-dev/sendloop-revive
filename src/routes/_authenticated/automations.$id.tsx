import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowUp, ArrowDown, Clock, Filter, Plus, Save, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  ACTIONS,
  AUTOMATION_STATUS_TONE,
  CONDITION_FIELDS,
  describeStep,
  needsValue,
  OPERATORS,
  TRIGGERS,
  AVAILABLE_TRIGGERS,
  WAIT_MODES,
  type AutomationStatus,
  type JsonObject,
  type StepKind,
} from "@/lib/automation-model";
import {
  getAutomation,
  getAutomationOptions,
  getAutomationWebhook,
  saveAutomation,
  setAutomationStatus,
} from "@/lib/automations.functions";
import { VisualAutomationEditor } from "@/components/automations/VisualAutomationEditor";
import { convertLegacyAutomation, workflowFromSteps, workflowToStep } from "@/lib/workflow-graph";

export const Route = createFileRoute("/_authenticated/automations/$id")({
  head: () => ({
    meta: [
      { title: "Automation builder — MunchReach" },
      {
        name: "description",
        content: "Configure triggers, conditions, waits and actions for a MunchReach automation workflow.",
      },
      { property: "og:title", content: "Automation builder — MunchReach" },
      { property: "og:description", content: "Design real outbound workflows that run server-side." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationRoutePage,
});

/**
 * Visual workflows open in the node builder; older linear automations keep
 * their original editor (and keep executing unchanged) until the customer
 * chooses to convert them.
 */
function AutomationRoutePage() {
  const { id } = Route.useParams();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? null;
  const fetchAutomation = useServerFn(getAutomation);
  const save = useServerFn(saveAutomation);
  const detailQuery = useQuery({
    queryKey: ["automation", workspaceId, id],
    queryFn: () => fetchAutomation({ data: { workspaceId: workspaceId!, automationId: id } }),
    enabled: Boolean(workspaceId),
  });
  const data = detailQuery.data;
  const workflow = data ? workflowFromSteps(data.steps) : null;

  if (data && workflow && workspaceId) {
    return (
      <VisualAutomationEditor
        key={`${data.automation.id}:${data.automation.version}`}
        workspaceId={workspaceId}
        automation={data.automation}
        initialWorkflow={workflow}
        onSaved={() => void detailQuery.refetch()}
      />
    );
  }

  const upgrade = async () => {
    if (!data || !workspaceId) return;
    try {
      const { workflow: converted, notes } = convertLegacyAutomation(data.steps, data.automation.condition_logic);
      for (const note of notes) toast.warning(note);
      await save({
        data: {
          workspaceId,
          automationId: id,
          name: data.automation.name,
          description: data.automation.description,
          triggerType: data.automation.trigger_type,
          triggerConfig: data.automation.trigger_config ?? {},
          conditionLogic: "and",
          steps: [workflowToStep(converted) as never],
        },
      });
      toast.success("Opened in the visual builder");
      void detailQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not convert this automation");
    }
  };

  return <AutomationBuilderPage onUpgrade={data ? upgrade : undefined} />;
}

type DraftStep = { kind: StepKind; branch: "yes" | "no" | null; config: JsonObject };

const KIND_META: Record<StepKind, { label: string; icon: typeof Zap }> = {
  condition: { label: "Condition", icon: Filter },
  branch: { label: "Branch", icon: Filter },
  action: { label: "Action", icon: Zap },
  wait: { label: "Wait", icon: Clock },
};

function AutomationBuilderPage({ onUpgrade }: { onUpgrade?: (() => void) | undefined }) {
  const { id } = Route.useParams();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? null;
  const navigate = useNavigate();

  const fetchAutomation = useServerFn(getAutomation);
  const fetchOptions = useServerFn(getAutomationOptions);
  const fetchWebhook = useServerFn(getAutomationWebhook);
  const save = useServerFn(saveAutomation);
  const setStatus = useServerFn(setAutomationStatus);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState(TRIGGERS[0]!.id);
  const [logic, setLogic] = useState<"and" | "or">("and");
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [status, setLocalStatus] = useState<AutomationStatus>("draft");
  const [saving, setSaving] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["automation", workspaceId, id],
    queryFn: () => fetchAutomation({ data: { workspaceId: workspaceId!, automationId: id } }),
    enabled: Boolean(workspaceId),
  });

  const optionsQuery = useQuery({
    queryKey: ["automation-options", workspaceId],
    queryFn: () => fetchOptions({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  const webhookQuery = useQuery({
    queryKey: ["automation-webhook", workspaceId, id],
    queryFn: () => fetchWebhook({ data: { workspaceId: workspaceId!, automationId: id } }),
    enabled: Boolean(workspaceId) && trigger === "webhook.received",
  });

  useEffect(() => {
    const data = detailQuery.data;
    if (!data) return;
    setName(data.automation.name);
    setDescription(data.automation.description ?? "");
    setTrigger(data.automation.trigger_type);
    setLogic(data.automation.condition_logic);
    setLocalStatus(data.automation.status);
    setSteps(data.steps.map((s) => ({ kind: s.kind, branch: s.branch, config: s.config ?? {} })));
  }, [detailQuery.data]);

  const campaigns = optionsQuery.data?.campaigns ?? [];
  const stages = optionsQuery.data?.stages ?? [];
  const members = optionsQuery.data?.members ?? [];

  const hasAction = useMemo(() => steps.some((s) => s.kind === "action" || s.kind === "wait"), [steps]);

  const updateStep = (index: number, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)));

  const updateConfig = (index: number, patch: JsonObject) =>
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, config: { ...step.config, ...patch } } : step)),
    );

  const addStep = (kind: StepKind) => {
    const defaults: Record<StepKind, JsonObject> = {
      condition: { field: "lead.email", operator: "is_not_empty" },
      branch: { field: "lead.email", operator: "is_not_empty" },
      action: { type: ACTIONS[0]!.id },
      wait: { mode: "hours", amount: 1 },
    };
    setSteps((prev) => [...prev, { kind, branch: null, config: defaults[kind] }]);
  };

  const move = (index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
  };

  const handleSave = async () => {
    if (!workspaceId) return;
    if (name.trim().length < 2) {
      toast.error("Give your automation a name");
      return;
    }
    setSaving(true);
    try {
      await save({
        data: {
          workspaceId,
          automationId: id,
          name: name.trim(),
          description: description.trim() || null,
          triggerType: trigger,
          triggerConfig: {},
          conditionLogic: logic,
          steps: steps.map((s) => ({ kind: s.kind, branch: s.branch, config: s.config })),
        },
      });
      toast.success("Automation saved");
      void detailQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save automation");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    if (!workspaceId) return;
    const next = status === "active" ? "paused" : "active";
    try {
      await handleSave();
      await setStatus({ data: { workspaceId, automationId: id, status: next } });
      setLocalStatus(next);
      toast.success(next === "active" ? "Automation is live" : "Automation paused");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change status");
    }
  };

  const selectOptionsFor = (actionType: string, fieldId: string) => {
    if (fieldId === "campaignId") return campaigns.map((c) => ({ value: c.id, label: c.name }));
    if (fieldId === "stageId") return stages.map((s) => ({ value: s.id, label: s.name }));
    if (fieldId === "assigneeId") return members.map((m) => ({ value: m.id, label: m.label }));
    const def = ACTIONS.find((a) => a.id === actionType);
    const field = def?.fields.find((f) => f.id === fieldId);
    return (field?.options ?? []).map((option) => ({ value: option, label: option }));
  };

  return (
    <AppShell
      title={name || "Automation"}
      description="Every step below is executed server-side by the automation worker."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/automations" })}>
            <ArrowLeft className="mr-2 size-4" /> Back
          </Button>
          {onUpgrade && (
            <Button variant="outline" size="sm" onClick={onUpgrade}>
              Open in visual builder
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={saving} onClick={handleSave}>
            <Save className="mr-2 size-4" /> Save
          </Button>
          <Button size="sm" disabled={!hasAction} onClick={togglePublish}>
            {status === "active" ? "Pause" : "Publish"}
          </Button>
        </div>
      }
    >
      {detailQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Workflow</h2>
                <Badge variant="outline" className={AUTOMATION_STATUS_TONE[status]}>
                  {status}
                </Badge>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Trigger</Label>
                  <Select value={trigger} onValueChange={setTrigger}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {AVAILABLE_TRIGGERS.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.group} · {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    rows={2}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What should this workflow do?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Condition logic</Label>
                  <Select value={logic} onValueChange={(value) => setLogic(value as "and" | "or")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="and">All conditions must match (AND)</SelectItem>
                      <SelectItem value="or">Any condition can match (OR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {trigger === "webhook.received" && webhookQuery.data && (
                <div className="mt-4 rounded-lg border border-dashed bg-muted/40 p-3 text-xs">
                  <p className="font-medium">Webhook endpoint</p>
                  <code className="mt-1 block break-all text-muted-foreground">{webhookQuery.data.path}</code>
                  <p className="mt-2 text-muted-foreground">
                    POST JSON here with an <code>email</code> field. Requests must be signed with your workspace
                    signing secret in the <code>x-sendloop-signature</code> header.
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-3">
              {steps.length === 0 && (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Add a condition, wait or action to build the workflow.
                </div>
              )}

              {steps.map((step, index) => {
                const Meta = KIND_META[step.kind];
                const actionType = String(step.config["type"] ?? "");
                const def = ACTIONS.find((a) => a.id === actionType);
                // A step can only sit on a Yes/No path when a branch runs before it.
                const afterBranch = steps.slice(0, index).some((s) => s.kind === "branch");
                const path = step.branch;
                return (
                  <div
                    key={index}
                    className={`rounded-xl border bg-card p-4 ${
                      path === "yes"
                        ? "border-l-4 border-l-emerald-500/70 md:ml-6"
                        : path === "no"
                          ? "border-l-4 border-l-destructive/60 md:ml-6"
                          : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {index + 1}
                        </span>
                        <Meta.icon className="size-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{Meta.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {describeStep({ kind: step.kind, config: step.config })}
                        </span>
                        {path && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              path === "yes"
                                ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                                : "bg-destructive/12 text-destructive"
                            }`}
                          >
                            {path === "yes" ? "Yes path" : "No path"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" aria-label="Move up" onClick={() => move(index, -1)}>
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Move down" onClick={() => move(index, 1)}>
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove step"
                          onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {(step.kind === "condition" || step.kind === "branch") && (
                        <>
                          <Select
                            value={String(step.config["field"] ?? "")}
                            onValueChange={(value) => updateConfig(index, { field: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Field" />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              {CONDITION_FIELDS.map((field) => (
                                <SelectItem key={field.id} value={field.id}>
                                  {field.group} · {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={String(step.config["operator"] ?? "equals")}
                            onValueChange={(value) => updateConfig(index, { operator: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {OPERATORS.map((operator) => (
                                <SelectItem key={operator.id} value={operator.id}>
                                  {operator.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {needsValue(String(step.config["operator"] ?? "equals") as never) && (
                            <Input
                              value={String(step.config["value"] ?? "")}
                              placeholder="Value"
                              onChange={(event) => updateConfig(index, { value: event.target.value })}
                            />
                          )}
                        </>
                      )}

                      {step.kind === "wait" && (
                        <>
                          <Select
                            value={String(step.config["mode"] ?? "hours")}
                            onValueChange={(value) => updateConfig(index, { mode: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {WAIT_MODES.map((mode) => (
                                <SelectItem key={mode.id} value={mode.id}>
                                  {mode.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {["minutes", "hours", "days"].includes(String(step.config["mode"] ?? "hours")) && (
                            <Input
                              type="number"
                              min={1}
                              value={String(step.config["amount"] ?? 1)}
                              onChange={(event) => updateConfig(index, { amount: Number(event.target.value) })}
                            />
                          )}
                          {String(step.config["mode"]) === "until_time" && (
                            <Input
                              type="time"
                              value={String(step.config["time"] ?? "09:00")}
                              onChange={(event) => updateConfig(index, { time: event.target.value })}
                            />
                          )}
                        </>
                      )}

                      {step.kind === "action" && (
                        <>
                          <Select value={actionType} onValueChange={(value) => updateConfig(index, { type: value })}>
                            <SelectTrigger className="md:col-span-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-80">
                              {ACTIONS.map((action) => (
                                <SelectItem key={action.id} value={action.id}>
                                  {action.group} · {action.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(def?.fields ?? []).map((field) => {
                            if (field.type === "select") {
                              const options = selectOptionsFor(actionType, field.id);
                              return (
                                <Select
                                  key={field.id}
                                  value={String(step.config[field.id] ?? "")}
                                  onValueChange={(value) => updateConfig(index, { [field.id]: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder={field.label} />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-72">
                                    {options.length === 0 ? (
                                      <SelectItem value="__none" disabled>
                                        Nothing available yet
                                      </SelectItem>
                                    ) : (
                                      options.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              );
                            }
                            if (field.type === "textarea") {
                              return (
                                <Textarea
                                  key={field.id}
                                  className="md:col-span-2"
                                  rows={2}
                                  placeholder={field.placeholder ?? field.label}
                                  value={String(step.config[field.id] ?? "")}
                                  onChange={(event) => updateConfig(index, { [field.id]: event.target.value })}
                                />
                              );
                            }
                            return (
                              <Input
                                key={field.id}
                                type={field.type === "number" ? "number" : "text"}
                                placeholder={field.placeholder ?? field.label}
                                value={String(step.config[field.id] ?? "")}
                                onChange={(event) =>
                                  updateConfig(index, {
                                    [field.id]:
                                      field.type === "number" ? Number(event.target.value) : event.target.value,
                                  })
                                }
                              />
                            );
                          })}
                        </>
                      )}
                    </div>

                    {def?.description && step.kind === "action" && (
                      <p className="mt-3 text-xs text-muted-foreground">{def.description}</p>
                    )}

                    {step.kind === "branch" && (
                      <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        Steps below can be placed on the <span className="font-medium text-foreground">Yes</span> or
                        <span className="font-medium text-foreground"> No</span> path. Steps left on “Both paths”
                        always run.
                      </p>
                    )}

                    {afterBranch && step.kind !== "branch" && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                        <span className="text-xs text-muted-foreground">Runs on</span>
                        <Select
                          value={step.branch ?? "both"}
                          onValueChange={(value) =>
                            updateStep(index, { branch: value === "both" ? null : (value as "yes" | "no") })
                          }
                        >
                          <SelectTrigger className="h-8 w-44 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="both">Both paths</SelectItem>
                            <SelectItem value="yes">Yes path (condition true)</SelectItem>
                            <SelectItem value="no">No path (condition false)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => addStep("condition")}>
                  <Plus className="mr-2 size-4" /> Condition
                </Button>
                <Button variant="outline" size="sm" onClick={() => addStep("branch")}>
                  <Plus className="mr-2 size-4" /> Branch
                </Button>
                <Button variant="outline" size="sm" onClick={() => addStep("wait")}>
                  <Plus className="mr-2 size-4" /> Wait
                </Button>
                <Button variant="outline" size="sm" onClick={() => addStep("action")}>
                  <Plus className="mr-2 size-4" /> Action
                </Button>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border bg-card p-4 text-sm">
              <h3 className="font-medium">Trigger source</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {TRIGGERS.find((t) => t.id === trigger)?.description}
              </p>
              <p className="mt-2 text-xs">
                Emitted by:{" "}
                <span className="font-medium">{TRIGGERS.find((t) => t.id === trigger)?.source}</span>
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-sm">
              <h3 className="font-medium">Safety rules</h3>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>• Each contact enters a workflow once per real event (idempotency keys).</li>
                <li>• Waits survive restarts — runs resume from the exact step.</li>
                <li>• Unsubscribed, bounced and suppressed leads are never enrolled.</li>
                <li>• Failed runs stop safely and can be retried from the activity log.</li>
              </ul>
            </div>
            {!hasAction && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300">
                Add at least one action before publishing.
              </div>
            )}
          </aside>
        </div>
      )}
    </AppShell>
  );
}
