import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CircleStop,
  Clock,
  Copy,
  Filter,
  GitBranch,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONDITION_FIELDS, TRIGGERS, WORKFLOW_ACTIONS, actionLabel } from "@/lib/automation-model";
import {
  cloneNode,
  makeNode,
  newId,
  operatorNeedsValue,
  RULE_OPERATORS,
  type Cursor,
  type NodeType,
  type Rule,
  type RuleGroup,
  type WaitSpec,
  type Workflow,
  type WorkflowNode,
  type WorkflowPath,
} from "@/lib/workflow-graph";

export type BuilderOptions = {
  campaigns: { id: string; name: string }[];
  stages: { id: string; name: string }[];
  members: { id: string; label: string }[];
  workflows: { id: string; name: string }[];
};

/* ----------------------------------------------------------- tree edits */

/** Address of a step list: [] is the main flow, [i, pathKey, …] a branch path. */
type ListAddr = Cursor;

function listAt(nodes: WorkflowNode[], addr: ListAddr): WorkflowNode[] {
  let list = nodes;
  for (let i = 0; i < addr.length; i += 2) {
    const node = list[addr[i] as number];
    if (!node || node.type !== "branch") return [];
    const key = String(addr[i + 1]);
    list = key === node.otherwise.key ? node.otherwise.steps : (node.paths.find((p) => p.key === key)?.steps ?? []);
  }
  return list;
}

function edit(workflow: Workflow, fn: (nodes: WorkflowNode[]) => void): Workflow {
  const next = structuredClone(workflow);
  fn(next.nodes);
  return next;
}

/* ------------------------------------------------------------- display */

const NODE_META: Record<NodeType, { label: string; icon: typeof Zap; tone: string; hint: string }> = {
  condition: { label: "Check", icon: Filter, tone: "text-sky-600 dark:text-sky-400", hint: "Continue only if the lead matches" },
  branch: { label: "Branch", icon: GitBranch, tone: "text-violet-600 dark:text-violet-400", hint: "Split into different paths" },
  wait: { label: "Wait", icon: Clock, tone: "text-amber-600 dark:text-amber-400", hint: "Pause, then continue" },
  action: { label: "Action", icon: Zap, tone: "text-primary", hint: "Do something" },
  end: { label: "End", icon: CircleStop, tone: "text-muted-foreground", hint: "Stop the workflow here" },
};

const fieldLabel = (id: string) =>
  id.startsWith("custom.") && id.length > 7
    ? `Custom field "${id.slice(7)}"`
    : (CONDITION_FIELDS.find((f) => f.id === id)?.label ?? (id || "field"));

function describeRules(group: RuleGroup | undefined): string {
  const rules = group?.rules ?? [];
  if (!rules.length) return "Always";
  const op = (r: Rule) => RULE_OPERATORS.find((o) => o.id === r.operator)?.label ?? r.operator;
  return rules
    .map((r) => `${fieldLabel(r.field)} ${op(r)}${operatorNeedsValue(r.operator) ? ` "${r.value ?? ""}"` : ""}`)
    .join(group?.match === "any" ? " or " : " and ");
}

export function describeWaitSpec(w: WaitSpec): string {
  switch (w.mode) {
    case "until_datetime":
      return w.at ? `Until ${w.at.replace("T", " ")}${w.timezone ? ` (${w.timezone})` : ""}` : "Until a date and time";
    case "next_business_day":
      return "Until the next business day";
    case "until_event":
      return `Until ${TRIGGERS.find((t) => t.id === w.event)?.label.toLowerCase() ?? "an event"} (max ${w.timeoutDays ?? 7} days)`;
    default:
      return `${w.amount ?? 1} ${w.mode}`;
  }
}

function describeNode(node: WorkflowNode): string {
  switch (node.type) {
    case "condition":
      return describeRules(node.group);
    case "branch":
      return `${node.paths.length + 1} paths`;
    case "wait":
      return describeWaitSpec(node.wait);
    case "action":
      return actionLabel(node.action);
    case "end":
      return "End workflow";
  }
}

/* ------------------------------------------------------------ component */

export function WorkflowBuilder({
  workflow,
  onChange,
  options,
}: {
  workflow: Workflow;
  onChange: (next: Workflow) => void;
  options: BuilderOptions;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const insert = (addr: ListAddr, index: number, type: NodeType) => {
    const node = makeNode(type);
    onChange(edit(workflow, (nodes) => listAt(nodes, addr).splice(index, 0, node)));
    setSelected(node.id);
  };
  const remove = (addr: ListAddr, index: number) =>
    onChange(edit(workflow, (nodes) => listAt(nodes, addr).splice(index, 1)));
  const duplicate = (addr: ListAddr, index: number) =>
    onChange(
      edit(workflow, (nodes) => {
        const list = listAt(nodes, addr);
        list.splice(index + 1, 0, cloneNode(list[index]!));
      }),
    );
  const move = (addr: ListAddr, index: number, dir: -1 | 1) =>
    onChange(
      edit(workflow, (nodes) => {
        const list = listAt(nodes, addr);
        const target = index + dir;
        if (target < 0 || target >= list.length) return;
        const [item] = list.splice(index, 1);
        list.splice(target, 0, item!);
      }),
    );
  const replace = (addr: ListAddr, index: number, node: WorkflowNode) =>
    onChange(
      edit(workflow, (nodes) => {
        listAt(nodes, addr)[index] = node;
      }),
    );

  const renderList = (addr: ListAddr, list: WorkflowNode[]) => (
    <div className="flex flex-col items-stretch">
      <AddStep onAdd={(t) => insert(addr, 0, t)} />
      {list.map((node, index) => (
        <div key={node.id} className="flex flex-col items-stretch">
          <NodeCard
            node={node}
            selected={selected === node.id}
            onSelect={() => setSelected(selected === node.id ? null : node.id)}
            onDelete={() => remove(addr, index)}
            onDuplicate={() => duplicate(addr, index)}
            onUp={index > 0 ? () => move(addr, index, -1) : undefined}
            onDown={index < list.length - 1 ? () => move(addr, index, 1) : undefined}
            onChange={(next) => replace(addr, index, next)}
            options={options}
          />
          {node.type === "branch" && (
            <div className="mt-2 grid gap-3 border-l-2 border-dashed border-border pl-4 md:grid-cols-2 xl:grid-cols-3">
              {[...node.paths, node.otherwise].map((path) => (
                <div key={path.key} className="rounded-xl border border-dashed bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{path.label}</p>
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {path.key === node.otherwise.key ? "When no other path matches" : describeRules(path.when)}
                  </p>
                  {renderList([...addr, index, path.key], path.steps)}
                </div>
              ))}
            </div>
          )}
          <AddStep onAdd={(t) => insert(addr, index + 1, t)} />
        </div>
      ))}
    </div>
  );

  return <div className="mx-auto w-full max-w-3xl">{renderList([], workflow.nodes)}</div>;
}

function AddStep({ onAdd }: { onAdd: (type: NodeType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-center py-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add step"
            className="flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1">
          {(Object.keys(NODE_META) as NodeType[]).map((type) => {
            const meta = NODE_META[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onAdd(type);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted"
              >
                <meta.icon className={`mt-0.5 size-4 ${meta.tone}`} />
                <span>
                  <span className="block text-sm font-medium">{meta.label}</span>
                  <span className="block text-xs text-muted-foreground">{meta.hint}</span>
                </span>
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function NodeCard({
  node,
  selected,
  onSelect,
  onDelete,
  onDuplicate,
  onUp,
  onDown,
  onChange,
  options,
}: {
  node: WorkflowNode;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUp?: (() => void) | undefined;
  onDown?: (() => void) | undefined;
  onChange: (next: WorkflowNode) => void;
  options: BuilderOptions;
}) {
  const meta = NODE_META[node.type];
  return (
    <div className={`rounded-xl border bg-card shadow-sm transition ${selected ? "ring-2 ring-primary/40" : ""}`}>
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <meta.icon className={`size-4 ${meta.tone}`} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {node.label || meta.label}
            </span>
            <span className="block truncate text-sm font-medium">{describeNode(node)}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center">
          {onUp && (
            <Button variant="ghost" size="icon" className="size-7" aria-label="Move up" onClick={onUp}>
              <ArrowUp className="size-3.5" />
            </Button>
          )}
          {onDown && (
            <Button variant="ghost" size="icon" className="size-7" aria-label="Move down" onClick={onDown}>
              <ArrowDown className="size-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-7" aria-label="Duplicate step" onClick={onDuplicate}>
            <Copy className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Delete step" onClick={onDelete}>
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {selected && (
        <div className="space-y-3 border-t p-3">
          <div className="space-y-1">
            <Label className="text-xs">Step name (optional)</Label>
            <Input
              value={node.label ?? ""}
              placeholder={meta.label}
              onChange={(e) => onChange({ ...node, label: e.target.value || undefined })}
            />
          </div>
          <NodeEditor node={node} onChange={onChange} options={options} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- editors */

function NodeEditor({
  node,
  onChange,
  options,
}: {
  node: WorkflowNode;
  onChange: (next: WorkflowNode) => void;
  options: BuilderOptions;
}) {
  if (node.type === "condition") {
    return <RuleGroupEditor group={node.group} onChange={(group) => onChange({ ...node, group })} options={options} />;
  }
  if (node.type === "branch") return <BranchEditor node={node} onChange={onChange} options={options} />;
  if (node.type === "wait") return <WaitEditor wait={node.wait} onChange={(wait) => onChange({ ...node, wait })} />;
  if (node.type === "action") return <ActionEditor node={node} onChange={onChange} options={options} />;
  return <p className="text-xs text-muted-foreground">The workflow stops when it reaches this step.</p>;
}

function RuleGroupEditor({
  group,
  onChange,
  options,
}: {
  group: RuleGroup;
  onChange: (g: RuleGroup) => void;
  options: BuilderOptions;
}) {
  const setRule = (i: number, patch: Partial<Rule>) =>
    onChange({ ...group, rules: group.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Match</span>
        <Select value={group.match} onValueChange={(v) => onChange({ ...group, match: v as "all" | "any" })}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ALL of these</SelectItem>
            <SelectItem value="any">ANY of these</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {group.rules.map((rule, i) => {
        const isCustom = rule.field.startsWith("custom.");
        const def = CONDITION_FIELDS.find((f) => f.id === (isCustom ? "custom." : rule.field));
        const valueOptions =
          rule.field === "campaign.id" ? options.campaigns.map((c) => ({ value: c.id, label: c.name })) : (def?.options ?? []).map((o) => ({ value: o, label: o }));
        return (
          <div key={i} className="grid gap-2 rounded-lg border p-2 md:grid-cols-[1fr_1fr_1fr_auto]">
            <Select value={isCustom ? "custom." : rule.field} onValueChange={(v) => setRule(i, { field: v })}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {CONDITION_FIELDS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.group} · {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={rule.operator} onValueChange={(v) => setRule(i, { operator: v as Rule["operator"] })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_OPERATORS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {operatorNeedsValue(rule.operator) ? (
              valueOptions.length ? (
                <Select value={rule.value ?? ""} onValueChange={(v) => setRule(i, { value: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Value" />
                  </SelectTrigger>
                  <SelectContent>
                    {valueOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input className="h-9" value={rule.value ?? ""} placeholder="Value" onChange={(e) => setRule(i, { value: e.target.value })} />
              )
            ) : (
              <span />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Remove rule"
              onClick={() => onChange({ ...group, rules: group.rules.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-3.5" />
            </Button>
            {isCustom && (
              <Input
                className="h-9 md:col-span-4"
                placeholder="Custom field name, e.g. plan"
                value={rule.field.slice(7)}
                onChange={(e) => setRule(i, { field: `custom.${e.target.value.trim()}` })}
              />
            )}
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange({ ...group, rules: [...group.rules, { field: "lead.status", operator: "is", value: "" }] })}
      >
        <Plus className="mr-1 size-3.5" /> Add rule
      </Button>
    </div>
  );
}

function BranchEditor({
  node,
  onChange,
  options,
}: {
  node: Extract<WorkflowNode, { type: "branch" }>;
  onChange: (n: WorkflowNode) => void;
  options: BuilderOptions;
}) {
  const setPath = (i: number, patch: Partial<WorkflowPath>) =>
    onChange({ ...node, paths: node.paths.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Paths are checked top to bottom. The lead follows the first path that matches, otherwise “{node.otherwise.label}”.
      </p>
      {node.paths.map((path, i) => (
        <div key={path.key} className="space-y-2 rounded-lg border p-2">
          <div className="flex items-center gap-2">
            <Input className="h-8" value={path.label} onChange={(e) => setPath(i, { label: e.target.value })} />
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Remove path"
              disabled={node.paths.length <= 1}
              onClick={() => onChange({ ...node, paths: node.paths.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <RuleGroupEditor
            group={path.when ?? { match: "all", rules: [] }}
            onChange={(when) => setPath(i, { when })}
            options={options}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ...node,
              paths: [
                ...node.paths,
                { key: `p-${newId().slice(0, 8)}`, label: `Path ${node.paths.length + 1}`, when: { match: "all", rules: [] }, steps: [] },
              ],
            })
          }
        >
          <Plus className="mr-1 size-3.5" /> Add path
        </Button>
        <Label className="text-xs">Fallback path name</Label>
        <Input
          className="h-8 w-40"
          value={node.otherwise.label}
          onChange={(e) => onChange({ ...node, otherwise: { ...node.otherwise, label: e.target.value } })}
        />
      </div>
    </div>
  );
}

function WaitEditor({ wait, onChange }: { wait: WaitSpec; onChange: (w: WaitSpec) => void }) {
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      return [];
    }
  }, []);
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <Select value={wait.mode} onValueChange={(v) => onChange({ ...wait, mode: v as WaitSpec["mode"] })}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">Wait X minutes</SelectItem>
          <SelectItem value="hours">Wait X hours</SelectItem>
          <SelectItem value="days">Wait X days</SelectItem>
          <SelectItem value="until_datetime">Wait until a date and time</SelectItem>
          <SelectItem value="next_business_day">Wait until the next business day</SelectItem>
          <SelectItem value="until_event">Wait until something happens</SelectItem>
        </SelectContent>
      </Select>
      {["minutes", "hours", "days"].includes(wait.mode) && (
        <Input type="number" min={1} value={wait.amount ?? 1} onChange={(e) => onChange({ ...wait, amount: Number(e.target.value) })} />
      )}
      {wait.mode === "until_datetime" && (
        <Input type="datetime-local" value={wait.at ?? ""} onChange={(e) => onChange({ ...wait, at: e.target.value })} />
      )}
      {wait.mode === "until_event" && (
        <>
          <Select value={wait.event ?? ""} onValueChange={(v) => onChange({ ...wait, event: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Event" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {TRIGGERS.filter((t) => t.id !== "webhook.received").map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Stop waiting after (days)</Label>
            <Input type="number" min={1} value={wait.timeoutDays ?? 7} onChange={(e) => onChange({ ...wait, timeoutDays: Number(e.target.value) })} />
          </div>
        </>
      )}
      {(wait.mode === "until_datetime" || wait.mode === "next_business_day") && (
        <Select value={wait.timezone ?? "__workspace"} onValueChange={(v) => onChange({ ...wait, timezone: v === "__workspace" ? undefined : v })}>
          <SelectTrigger className="md:col-span-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="__workspace">Workspace sending timezone</SelectItem>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function ActionEditor({
  node,
  onChange,
  options,
}: {
  node: Extract<WorkflowNode, { type: "action" }>;
  onChange: (n: WorkflowNode) => void;
  options: BuilderOptions;
}) {
  const def = WORKFLOW_ACTIONS.find((a) => a.id === node.action);
  const groups = Array.from(new Set(WORKFLOW_ACTIONS.map((a) => a.group)));
  const setConfig = (patch: Record<string, unknown>) => onChange({ ...node, config: { ...node.config, ...patch } });
  const selectOptions = (fieldId: string) => {
    if (fieldId === "campaignId") return options.campaigns.map((c) => ({ value: c.id, label: c.name }));
    if (fieldId === "stageId") return options.stages.map((s) => ({ value: s.id, label: s.name }));
    if (fieldId === "ownerId" || fieldId === "assigneeId") return options.members.map((m) => ({ value: m.id, label: m.label }));
    if (fieldId === "automationId") return options.workflows.map((w) => ({ value: w.id, label: w.name }));
    return (def?.fields.find((f) => f.id === fieldId)?.options ?? []).map((o) => ({ value: o, label: o }));
  };
  return (
    <div className="space-y-2">
      <Select value={node.action} onValueChange={(v) => onChange({ ...node, action: v, config: {} })}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {groups.map((g) =>
            WORKFLOW_ACTIONS.filter((a) => a.group === g).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {g} · {a.label}
              </SelectItem>
            )),
          )}
        </SelectContent>
      </Select>
      {def && <p className="text-xs text-muted-foreground">{def.description}</p>}
      {node.action === "crm.move_stage" && typeof node.config["stageKey"] === "string" && !node.config["stageId"] && (
        <p className="text-xs text-muted-foreground">
          Uses the stage named “{String(node.config["stageKey"]).replace(/_/g, " ")}”. Pick one below to change it.
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {def?.fields.map((field) => (
          <div key={field.id} className={`space-y-1 ${field.type === "textarea" ? "md:col-span-2" : ""}`}>
            <Label className="text-xs">{field.label}</Label>
            {field.type === "select" ? (
              <Select value={String(node.config[field.id] ?? "")} onValueChange={(v) => setConfig({ [field.id]: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {selectOptions(field.id).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === "textarea" ? (
              <Textarea rows={3} value={String(node.config[field.id] ?? "")} placeholder={field.placeholder} onChange={(e) => setConfig({ [field.id]: e.target.value })} />
            ) : (
              <Input
                type={field.type === "number" ? "number" : "text"}
                value={String(node.config[field.id] ?? "")}
                placeholder={field.placeholder}
                onChange={(e) => setConfig({ [field.id]: field.type === "number" ? Number(e.target.value) : e.target.value })}
              />
            )}
          </div>
        ))}
      </div>
      <Badge variant="outline" className="text-[10px]">
        Runs on the server · never repeated on retry
      </Badge>
    </div>
  );
}
