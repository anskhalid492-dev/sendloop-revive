import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Maximize2,
  ZoomIn,
  ZoomOut,
  ArrowUp,
  CircleStop,
  Clock,
  Copy,
  Filter,
  GitBranch,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AVAILABLE_TRIGGERS, CONDITION_FIELDS, TRIGGERS, WORKFLOW_ACTIONS, actionLabel } from "@/lib/automation-model";
import {
  cloneNode,
  makeAiDecisionNode,
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
      return node.ai ? `${node.paths.length} outcomes · min ${Math.round(node.ai.threshold * 100)}% confidence` : `${node.paths.length + 1} paths`;
    case "wait":
      return describeWaitSpec(node.wait);
    case "action":
      return actionLabel(node.action);
    case "end":
      return "End workflow";
  }
}

/* ------------------------------------------------------------ component */

type Located = { node: WorkflowNode; addr: ListAddr; index: number; size: number };

function locate(nodes: WorkflowNode[], id: string, addr: ListAddr = []): Located | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (n.id === id) return { node: n, addr, index: i, size: nodes.length };
    if (n.type === "branch") {
      for (const p of [...n.paths, n.otherwise]) {
        const hit = locate(p.steps, id, [...addr, i, p.key]);
        if (hit) return hit;
      }
    }
  }
  return null;
}

function countSteps(list: WorkflowNode[]): number {
  return list.reduce((sum, n) => sum + 1 + (n.type === "branch" ? [...n.paths, n.otherwise].reduce((s, p) => s + countSteps(p.steps), 0) : 0), 0);
}

function issueCount(list: WorkflowNode[], issues: Record<string, string[]>): number {
  return list.reduce(
    (sum, n) => sum + (issues[n.id]?.length ? 1 : 0) + (n.type === "branch" ? [...n.paths, n.otherwise].reduce((s, p) => s + issueCount(p.steps, issues), 0) : 0),
    0,
  );
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;

export function WorkflowBuilder({
  workflow,
  onChange,
  options,
  issues = {},
}: {
  workflow: Workflow;
  onChange: (next: Workflow) => void;
  options: BuilderOptions;
  /** Activation problems keyed by step id, shown on that step. */
  issues?: Record<string, string[]>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  /** Expanded lanes ("nodeId:pathKey"). Lanes with 0–1 steps are always open. */
  const [openLanes, setOpenLanes] = useState<Set<string>>(() => new Set());
  const [focusLane, setFocusLane] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const insert = (addr: ListAddr, index: number, type: AddKind) => {
    const node =
      type === "ai_decision"
        ? makeAiDecisionNode()
        : type === "ai_reply"
          ? ({ id: newId(), type: "action", action: "ai.generate_reply", config: { tone: "Friendly and concise", maxWords: 120, mode: "draft" } } as WorkflowNode)
          : type === "human_review"
            ? ({ id: newId(), type: "action", action: "human.review", config: { reason: "" } } as WorkflowNode)
            : makeNode(type);
    onChange(edit(workflow, (nodes) => listAt(nodes, addr).splice(index, 0, node)));
    setSelected(node.id);
  };
  const remove = (addr: ListAddr, index: number) => {
    const id = listAt(workflow.nodes, addr)[index]?.id;
    onChange(edit(workflow, (nodes) => listAt(nodes, addr).splice(index, 1)));
    if (id && id === selected) setSelected(null);
  };
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

  const current = useMemo(() => (selected ? locate(workflow.nodes, selected) : null), [workflow, selected]);

  const toggleLane = (key: string) => {
    setOpenLanes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        if (focusLane === key) setFocusLane(null);
      } else {
        next.add(key);
        setFocusLane(key);
      }
      return next;
    });
  };
  const backToWorkflow = () => {
    setFocusLane(null);
    setOpenLanes(new Set());
  };

  const fit = () => {
    const vp = viewportRef.current;
    const el = contentRef.current;
    if (!vp || !el) return;
    const natural = el.scrollWidth / zoom;
    const scale = Math.min(1, Math.max(ZOOM_MIN, (vp.clientWidth - 48) / natural));
    setZoom(Number(scale.toFixed(2)));
  };

  const renderList = (addr: ListAddr, list: WorkflowNode[], laneKey?: string): React.ReactNode => (
    <div className="flex flex-col items-center">
      <AddStep onAdd={(t) => insert(addr, 0, t)} />
      {list.map((node, index) => (
        <div key={node.id} className="flex flex-col items-center">
          <NodeChip
            node={node}
            selected={selected === node.id}
            onSelect={() => setSelected(node.id)}
            onDelete={() => remove(addr, index)}
            onDuplicate={() => duplicate(addr, index)}
            onUp={index > 0 ? () => move(addr, index, -1) : undefined}
            onDown={index < list.length - 1 ? () => move(addr, index, 1) : undefined}
            issues={issues[node.id]}
          />
          {node.type === "branch" && renderLanes(addr, index, node, laneKey)}
          <AddStep onAdd={(t) => insert(addr, index + 1, t)} />
        </div>
      ))}
      {list.length === 0 && <span className="rounded-full border border-dashed px-2.5 py-0.5 text-[11px] text-muted-foreground">End</span>}
    </div>
  );

  const renderLanes = (addr: ListAddr, index: number, node: Extract<WorkflowNode, { type: "branch" }>, parentLane?: string) => {
    const paths = [...node.paths, node.otherwise];
    return (
      <div className="flex flex-col items-center">
        <span className="h-5 w-px bg-border" />
        <div className="relative flex items-start gap-6 px-2">
          {paths.length > 1 && <span className="pointer-events-none absolute left-[calc(7rem+0.5rem)] right-[calc(7rem+0.5rem)] top-0 h-px bg-border" />}
          {paths.map((path) => {
            const key = `${node.id}:${path.key}`;
            const steps = countSteps(path.steps);
            const open = steps <= 1 || openLanes.has(key);
            const focused = focusLane === key;
            const dimmed = focusLane !== null && !focused && focusLane !== parentLane && !focusLane.startsWith(`${node.id}:`) === false && !focused;
            const isFallback = path.key === node.otherwise.key;
            const problems = issueCount(path.steps, issues);
            return (
              <div key={path.key} className={`flex min-w-56 flex-col items-center transition-opacity ${dimmed ? "opacity-50" : ""}`}>
                <span className="h-4 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => (steps > 1 ? toggleLane(key) : setFocusLane(focused ? null : key))}
                  aria-expanded={open}
                  className={`flex w-56 items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-left text-xs transition hover:border-primary/60 ${focused ? "border-primary ring-2 ring-primary/30" : ""}`}
                  title={
                    node.ai
                      ? isFallback
                        ? "Low confidence, invalid answer or AI unavailable"
                        : "When AI chooses this outcome"
                      : isFallback
                        ? "When no other path matches"
                        : describeRules(path.when)
                  }
                >
                  <span className={`size-2 shrink-0 rounded-full ${isFallback ? "bg-muted-foreground" : node.ai ? "bg-primary" : "bg-violet-500"}`} />
                  <span className="min-w-0 flex-1 truncate font-semibold uppercase tracking-wide">{path.label}</span>
                  {problems > 0 && <span className="size-1.5 rounded-full bg-destructive" aria-label="Needs attention" />}
                  <span className="shrink-0 text-muted-foreground">
                    {steps === 0 ? "End" : `${steps} step${steps === 1 ? "" : "s"}`}
                  </span>
                  {steps > 1 && (open ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />)}
                </button>
                {open ? (
                  <div className={`mt-1 rounded-2xl px-2 pb-2 ${focused ? "bg-primary/5" : ""}`}>{renderList([...addr, index, path.key], path.steps, key)}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleLane(key)}
                    className="mt-2 w-48 truncate rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    {path.steps.map((s) => s.label || (s.type === "action" ? actionLabel(s.action) : NODE_META[s.type].label)).join(" → ")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-muted/20">
      {focusLane && (
        <div className="absolute left-3 top-3 z-10">
          <Button size="sm" variant="secondary" onClick={backToWorkflow}>
            <ArrowLeft className="mr-1.5 size-3.5" /> Back to workflow
          </Button>
        </div>
      )}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border bg-background/95 p-0.5 shadow-sm">
        <Button variant="ghost" size="icon" className="size-7" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Number((z - 0.1).toFixed(2))))}>
          <ZoomOut className="size-3.5" />
        </Button>
        <button type="button" className="w-11 text-center text-[11px] tabular-nums text-muted-foreground hover:text-foreground" aria-label="Reset zoom" onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Number((z + 0.1).toFixed(2))))}>
          <ZoomIn className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Fit workflow to screen" onClick={fit}>
          <Maximize2 className="size-3.5" />
        </Button>
      </div>
      <div
        ref={viewportRef}
        className="max-h-[75vh] min-h-80 overflow-auto bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:20px_20px]"
      >
        <div ref={contentRef} className="mx-auto w-max min-w-full px-6 pb-10 pt-14" style={{ zoom }}>
          {renderList([], workflow.nodes)}
        </div>
      </div>

      <Sheet open={Boolean(current)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {current && (
            <Inspector
              located={current}
              options={options}
              issues={issues[current.node.id]}
              onChange={(next) => replace(current.addr, current.index, next)}
              onDelete={() => remove(current.addr, current.index)}
              onDuplicate={() => duplicate(current.addr, current.index)}
              onMove={(dir) => move(current.addr, current.index, dir)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type AddKind = NodeType | "ai_decision" | "ai_reply" | "human_review";

const AI_ADD: { kind: AddKind; label: string; hint: string; icon: typeof Zap }[] = [
  { kind: "ai_decision", label: "AI Decision", hint: "Let AI understand the lead or conversation and choose a path.", icon: Sparkles },
  { kind: "ai_reply", label: "Generate AI Reply", hint: "Create a personalized reply using the conversation context.", icon: Sparkles },
  { kind: "human_review", label: "Request Human Review", hint: "Stop automated handling and notify a team member.", icon: UserRound },
];

function AddStep({ onAdd }: { onAdd: (type: AddKind) => void }) {
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
          <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">AI</p>
          {AI_ADD.map((item) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => {
                onAdd(item.kind);
                setOpen(false);
              }}
              className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted"
            >
              <item.icon className="mt-0.5 size-4 text-primary" />
              <span>
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.hint}</span>
              </span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function chipTitle(node: WorkflowNode): string {
  if (node.label) return node.label;
  if (node.type === "branch" && node.ai) return "AI Decision";
  if (node.type === "action") return actionLabel(node.action);
  return NODE_META[node.type].label;
}

function chipSubtitle(node: WorkflowNode): string {
  if (node.type === "branch" && node.ai) {
    const q = node.ai.question.trim();
    return `${q ? `${q.length > 40 ? `${q.slice(0, 40)}…` : q} · ` : ""}${node.paths.length} outcomes · ${Math.round(node.ai.threshold * 100)}%`;
  }
  if (node.type === "action") {
    const c = (node.config ?? {}) as Record<string, unknown>;
    if (typeof c["mode"] === "string") return OPTION_LABELS[c["mode"]] ?? String(c["mode"]);
    for (const k of ["tag", "stage_name", "status", "subject", "url"]) if (typeof c[k] === "string" && c[k]) return String(c[k]);
    return node.label ? actionLabel(node.action) : "";
  }
  return describeNode(node);
}

function NodeChip({
  node,
  selected,
  onSelect,
  onDelete,
  onDuplicate,
  onUp,
  onDown,
  issues,
}: {
  issues?: string[] | undefined;
  node: WorkflowNode;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUp?: (() => void) | undefined;
  onDown?: (() => void) | undefined;
}) {
  const meta = NODE_META[node.type];
  const isAi = (node.type === "branch" && node.ai) || (node.type === "action" && (node.action === "ai.generate_reply" || node.action === "human.review"));
  const Icon = node.type === "branch" && node.ai ? Sparkles : node.type === "action" && node.action === "ai.generate_reply" ? Sparkles : node.type === "action" && node.action === "human.review" ? UserRound : meta.icon;
  const hasIssues = Boolean(issues && issues.length);
  const sub = chipSubtitle(node);
  return (
    <div
      className={`group relative w-56 rounded-xl border bg-card shadow-sm transition hover:shadow-md ${
        selected ? "border-primary ring-2 ring-primary/30" : hasIssues ? "border-destructive/60" : ""
      } ${node.type === "end" ? "w-auto rounded-full" : ""}`}
    >
      <button type="button" onClick={onSelect} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left" aria-label={`Edit ${chipTitle(node)}`}>
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${isAi ? "bg-primary/10" : "bg-muted"}`}>
          <Icon className={`size-3.5 ${isAi ? "text-primary" : meta.tone}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold uppercase tracking-wide">{chipTitle(node)}</span>
          {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
        </span>
        {hasIssues && <span className="size-2 shrink-0 rounded-full bg-destructive" aria-label={issues!.join(" ")} title={issues!.join("\n")} />}
      </button>
      <div className="absolute -right-2 -top-3 flex items-center rounded-md border bg-background opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100">
        {onUp && (
          <Button variant="ghost" size="icon" className="size-6" aria-label="Move up" onClick={onUp}>
            <ArrowUp className="size-3" />
          </Button>
        )}
        {onDown && (
          <Button variant="ghost" size="icon" className="size-6" aria-label="Move down" onClick={onDown}>
            <ArrowDown className="size-3" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-6" aria-label="Duplicate step" onClick={onDuplicate}>
          <Copy className="size-3" />
        </Button>
        <Button variant="ghost" size="icon" className="size-6" aria-label="Delete step" onClick={onDelete}>
          <Trash2 className="size-3 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function Inspector({
  located,
  options,
  issues,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
}: {
  located: Located;
  options: BuilderOptions;
  issues?: string[] | undefined;
  onChange: (next: WorkflowNode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { node, index, size } = located;
  const meta = NODE_META[node.type];
  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle>{chipTitle(node)}</SheetTitle>
        <SheetDescription>{node.type === "branch" && node.ai ? "Let AI choose one outcome path." : meta.hint}</SheetDescription>
      </SheetHeader>
      {issues && issues.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Step name (optional)</Label>
        <Input value={node.label ?? ""} placeholder={meta.label} onChange={(e) => onChange({ ...node, label: e.target.value || undefined })} />
      </div>
      <NodeEditor node={node} onChange={onChange} options={options} />
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button variant="outline" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="mr-1 size-3.5" /> Move up
        </Button>
        <Button variant="outline" size="sm" disabled={index >= size - 1} onClick={() => onMove(1)}>
          <ArrowDown className="mr-1 size-3.5" /> Move down
        </Button>
        <Button variant="outline" size="sm" onClick={onDuplicate}>
          <Copy className="mr-1 size-3.5" /> Duplicate
        </Button>
        <Button variant="outline" size="sm" className="text-destructive" onClick={onDelete}>
          <Trash2 className="mr-1 size-3.5" /> Delete
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Changes apply to the canvas right away. Use Save draft to keep them.</p>
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
  if (node.type === "branch" && node.ai) return <AiDecisionEditor node={node} onChange={onChange} />;
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

function AiDecisionEditor({ node, onChange }: { node: Extract<WorkflowNode, { type: "branch" }>; onChange: (n: WorkflowNode) => void }) {
  const ai = node.ai ?? { question: "", threshold: 0.8 };
  const setPaths = (paths: WorkflowPath[]) => onChange({ ...node, paths });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= node.paths.length) return;
    const next = [...node.paths];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setPaths(next);
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Let AI understand the lead or conversation and choose the right path. AI can only pick one of these outcomes.</p>
      <div className="space-y-1">
        <Label className="text-xs">Decision question</Label>
        <Textarea rows={2} value={ai.question} onChange={(e) => onChange({ ...node, ai: { ...ai, question: e.target.value } })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Minimum confidence (%)</Label>
        <Input
          type="number"
          min={50}
          max={100}
          className="h-8 w-28"
          value={Math.round(ai.threshold * 100)}
          onChange={(e) => onChange({ ...node, ai: { ...ai, threshold: Math.min(100, Math.max(50, Number(e.target.value) || 80)) / 100 } })}
        />
        <p className="text-[11px] text-muted-foreground">Below this, the lead takes the “{node.otherwise.label}” path and nothing is sent automatically.</p>
      </div>
      <Label className="text-xs">Possible outcomes</Label>
      {node.paths.map((path, i) => (
        <div key={path.key} className="flex items-center gap-1">
          <Input className="h-8" value={path.label} onChange={(e) => setPaths(node.paths.map((p, k) => (k === i ? { ...p, label: e.target.value } : p)))} />
          <Button variant="ghost" size="icon" className="size-8" aria-label="Move outcome up" disabled={i === 0} onClick={() => move(i, -1)}>
            <ArrowUp className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Move outcome down" disabled={i === node.paths.length - 1} onClick={() => move(i, 1)}>
            <ArrowDown className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Delete outcome" disabled={node.paths.length <= 2} onClick={() => setPaths(node.paths.filter((_, k) => k !== i))}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setPaths([...node.paths, { key: `ai-${newId().slice(0, 8)}`, label: `Outcome ${node.paths.length + 1}`, steps: [] }])}>
          <Plus className="mr-1 size-3.5" /> Add outcome
        </Button>
        <Label className="text-xs">Fallback path name</Label>
        <Input className="h-8 w-40" value={node.otherwise.label} onChange={(e) => onChange({ ...node, otherwise: { ...node.otherwise, label: e.target.value } })} />
      </div>
    </div>
  );
}

const OPTION_LABELS: Record<string, string> = { draft: "Create draft", auto_send: "Send automatically" };

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
              {AVAILABLE_TRIGGERS.filter((t) => t.id !== "webhook.received").map((t) => (
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
    return (def?.fields.find((f) => f.id === fieldId)?.options ?? []).map((o) => ({ value: o, label: OPTION_LABELS[o] ?? o }));
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
      {node.action === "ai.generate_reply" && node.config["mode"] === "auto_send" && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          AI-generated emails can be sent automatically when this workflow is active.
        </p>
      )}
      <Badge variant="outline" className="text-[10px]">
        Runs on the server · never repeated on retry
      </Badge>
    </div>
  );
}
