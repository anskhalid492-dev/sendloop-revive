/**
 * Visual workflow model (client-safe, pure).
 *
 * A workflow is a tree of nodes: a sequence of steps where a branch node owns
 * one nested sequence per path. The tree is what the builder renders and what
 * the engine walks, so "When this happens → check this → wait → do this" reads
 * the same on screen as it executes on the server.
 *
 * Storage: the whole tree is saved as ONE `automation_steps` row
 * (kind "action", config.type = WORKFLOW_STEP_TYPE). This reuses the existing
 * tables, RLS, run snapshotting and worker without any schema change, and
 * legacy linear automations keep running through the old path untouched.
 */

export const WORKFLOW_STEP_TYPE = "workflow.graph";
export const MAX_WORKFLOW_HOPS = 100;
export const MAX_WORKFLOW_NODES = 60;
/** Cross-workflow event chain depth after which no further runs are started. */
export const MAX_CHAIN_DEPTH = 3;

/* --------------------------------------------------------------- rules */

export const RULE_OPERATORS = [
  { id: "is", label: "is" },
  { id: "is_not", label: "is not" },
  { id: "contains", label: "contains" },
  { id: "not_contains", label: "does not contain" },
  { id: "starts_with", label: "starts with" },
  { id: "ends_with", label: "ends with" },
  { id: "exists", label: "exists" },
  { id: "not_exists", label: "does not exist" },
  { id: "gt", label: "greater than" },
  { id: "lt", label: "less than" },
  { id: "gte", label: "greater than or equal" },
  { id: "lte", label: "less than or equal" },
] as const;

export type RuleOperator = (typeof RULE_OPERATORS)[number]["id"];

export type Rule = { field: string; operator: RuleOperator; value?: string | undefined };
export type RuleGroup = { match: "all" | "any"; rules: Rule[] };

const LEGACY_OPERATORS: Record<string, RuleOperator> = {
  equals: "is",
  not_equals: "is_not",
  is_empty: "not_exists",
  is_not_empty: "exists",
  greater_than: "gt",
  less_than: "lt",
};

export function normalizeOperator(op: string): RuleOperator {
  if (RULE_OPERATORS.some((o) => o.id === op)) return op as RuleOperator;
  return LEGACY_OPERATORS[op] ?? "is";
}

export function operatorNeedsValue(op: RuleOperator) {
  return op !== "exists" && op !== "not_exists";
}

export function evaluateRule(rule: Rule, get: (field: string) => unknown): boolean {
  const raw = get(rule.field);
  const op = normalizeOperator(rule.operator);
  const expected = String(rule.value ?? "").trim().toLowerCase();
  const list = Array.isArray(raw) ? raw.map((v) => String(v).toLowerCase()) : null;
  const text = raw === null || raw === undefined ? "" : list ? list.join(",") : String(raw).toLowerCase();
  const present = list ? list.length > 0 : text.trim().length > 0;
  const num = Number(raw);
  const want = Number(rule.value);
  const numeric = raw !== null && raw !== undefined && raw !== "" && Number.isFinite(num) && Number.isFinite(want);

  switch (op) {
    case "is":
      return list ? list.includes(expected) : text === expected;
    case "is_not":
      return list ? !list.includes(expected) : text !== expected;
    case "contains":
      return list ? list.some((v) => v.includes(expected)) : text.includes(expected);
    case "not_contains":
      return list ? !list.some((v) => v.includes(expected)) : !text.includes(expected);
    case "starts_with":
      return list ? list.some((v) => v.startsWith(expected)) : text.startsWith(expected);
    case "ends_with":
      return list ? list.some((v) => v.endsWith(expected)) : text.endsWith(expected);
    case "exists":
      return present;
    case "not_exists":
      return !present;
    case "gt":
      return numeric && num > want;
    case "lt":
      return numeric && num < want;
    case "gte":
      return numeric && num >= want;
    case "lte":
      return numeric && num <= want;
    default:
      return false;
  }
}

export function evaluateGroup(group: RuleGroup | undefined, get: (field: string) => unknown): boolean {
  const rules = group?.rules ?? [];
  if (rules.length === 0) return true;
  const results = rules.map((r) => evaluateRule(r, get));
  return group?.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

/* --------------------------------------------------------------- nodes */

export type WaitSpec = {
  mode: "minutes" | "hours" | "days" | "until_datetime" | "next_business_day" | "until_event";
  amount?: number;
  /** Local wall-clock "YYYY-MM-DDTHH:mm" for until_datetime. */
  at?: string;
  /** IANA zone; defaults to the workspace sending timezone. */
  timezone?: string | undefined;
  /** Event type for until_event. */
  event?: string;
  /** Give up waiting for the event after this many days (default 7). */
  timeoutDays?: number;
};

export type WorkflowPath = { key: string; label: string; when?: RuleGroup; steps: WorkflowNode[] };

export type WorkflowNode =
  | { id: string; type: "condition"; label?: string | undefined; group: RuleGroup }
  | { id: string; type: "branch"; label?: string | undefined; paths: WorkflowPath[]; otherwise: WorkflowPath }
  | { id: string; type: "wait"; label?: string | undefined; wait: WaitSpec }
  | { id: string; type: "action"; label?: string | undefined; action: string; config: Record<string, unknown> }
  | { id: string; type: "end"; label?: string | undefined };

export type Workflow = { version: 2; nodes: WorkflowNode[] };

export type NodeType = WorkflowNode["type"];

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function makeNode(type: NodeType): WorkflowNode {
  const id = newId();
  switch (type) {
    case "condition":
      return { id, type, group: { match: "all", rules: [{ field: "lead.status", operator: "is", value: "" }] } };
    case "branch":
      return {
        id,
        type,
        paths: [{ key: "yes", label: "Yes", when: { match: "all", rules: [{ field: "activity.replies", operator: "gt", value: "0" }] }, steps: [] }],
        otherwise: { key: "otherwise", label: "No", steps: [] },
      };
    case "wait":
      return { id, type, wait: { mode: "days", amount: 1 } };
    case "action":
      return { id, type, action: "lead.add_tag", config: { tag: "" } };
    case "end":
      return { id, type };
  }
}

/** Deep copy with fresh ids (used by Duplicate step). */
export function cloneNode(node: WorkflowNode): WorkflowNode {
  const copy = JSON.parse(JSON.stringify(node)) as WorkflowNode;
  const refresh = (n: WorkflowNode) => {
    n.id = newId();
    if (n.type === "branch") {
      for (const p of [...n.paths, n.otherwise]) p.steps.forEach(refresh);
    }
  };
  refresh(copy);
  return copy;
}

export function countNodes(nodes: WorkflowNode[]): number {
  let total = 0;
  for (const n of nodes) {
    total += 1;
    if (n.type === "branch") for (const p of [...n.paths, n.otherwise]) total += countNodes(p.steps);
  }
  return total;
}

/* -------------------------------------------------------------- cursor */

/** Alternating [index, pathKey, index, pathKey, index …]. */
export type Cursor = (number | string)[];

function pathOf(node: WorkflowNode, key: string): WorkflowPath | undefined {
  if (node.type !== "branch") return undefined;
  if (key === node.otherwise.key || key === "otherwise") return node.otherwise;
  return node.paths.find((p) => p.key === key);
}

export function nodeAt(nodes: WorkflowNode[], cursor: Cursor): WorkflowNode | undefined {
  let list = nodes;
  let node: WorkflowNode | undefined;
  for (let i = 0; i < cursor.length; i += 2) {
    node = list[cursor[i] as number];
    if (!node) return undefined;
    if (i + 1 < cursor.length) {
      const path = pathOf(node, String(cursor[i + 1]));
      if (!path) return undefined;
      list = path.steps;
    }
  }
  return node;
}

function listLength(nodes: WorkflowNode[], prefix: Cursor): number {
  if (prefix.length === 0) return nodes.length;
  const parent = nodeAt(nodes, prefix.slice(0, -1));
  return parent ? (pathOf(parent, String(prefix[prefix.length - 1]))?.steps.length ?? 0) : 0;
}

/** The step that runs after the node at `cursor` finishes; null = end. */
export function advance(nodes: WorkflowNode[], cursor: Cursor): Cursor | null {
  let current = [...cursor];
  while (current.length > 0) {
    const index = current[current.length - 1] as number;
    const prefix = current.slice(0, -1);
    if (index + 1 < listLength(nodes, prefix)) return [...prefix, index + 1];
    // End of this path: continue after the branch node that owns it.
    if (prefix.length === 0) return null;
    current = prefix.slice(0, -1);
  }
  return null;
}

/** Enter the chosen path of the branch at `cursor`. */
export function enterPath(nodes: WorkflowNode[], cursor: Cursor, key: string): Cursor | null {
  const node = nodeAt(nodes, cursor);
  const path = node ? pathOf(node, key) : undefined;
  if (path && path.steps.length > 0) return [...cursor, path.key, 0];
  return advance(nodes, cursor);
}

export function chooseBranch(
  node: Extract<WorkflowNode, { type: "branch" }>,
  get: (field: string) => unknown,
): WorkflowPath {
  for (const path of node.paths) if (evaluateGroup(path.when, get)) return path;
  return node.otherwise;
}

/* ---------------------------------------------------------- validation */

export function validateWorkflow(workflow: Workflow, knownActions: string[]): string[] {
  const errors: string[] = [];
  if (workflow.nodes.length === 0) errors.push("Add at least one step.");
  if (countNodes(workflow.nodes) > MAX_WORKFLOW_NODES) errors.push(`Workflows can have at most ${MAX_WORKFLOW_NODES} steps.`);
  let actions = 0;
  const walk = (nodes: WorkflowNode[], where: string) => {
    nodes.forEach((n, i) => {
      const label = `${where}step ${i + 1}`;
      if (n.type === "action") {
        actions += 1;
        if (!knownActions.includes(n.action)) errors.push(`${label}: choose an action.`);
      }
      if (n.type === "condition" && n.group.rules.some((r) => !r.field)) errors.push(`${label}: every rule needs a field.`);
      if (n.type === "wait") {
        const w = n.wait;
        if (["minutes", "hours", "days"].includes(w.mode) && !(Number(w.amount) > 0)) errors.push(`${label}: set how long to wait.`);
        if (w.mode === "until_datetime" && !w.at) errors.push(`${label}: pick a date and time.`);
        if (w.mode === "until_event" && !w.event) errors.push(`${label}: choose the event to wait for.`);
      }
      if (n.type === "branch") {
        if (n.paths.length === 0) errors.push(`${label}: add at least one path.`);
        for (const p of n.paths) walk(p.steps, `${label} › ${p.label} › `);
        walk(n.otherwise.steps, `${label} › ${n.otherwise.label} › `);
      }
    });
  };
  walk(workflow.nodes, "");
  if (workflow.nodes.length > 0 && actions === 0) errors.push("Add at least one action.");
  return errors;
}

/* ------------------------------------------------- storage + migration */

type StoredStep = { kind: string; branch?: string | null; config: Record<string, unknown> };

export function workflowFromSteps(steps: StoredStep[]): Workflow | null {
  const row = steps.find((s) => s.config?.["type"] === WORKFLOW_STEP_TYPE);
  const graph = row?.config?.["workflow"] as Workflow | undefined;
  return graph && Array.isArray(graph.nodes) ? graph : null;
}

export function workflowToStep(workflow: Workflow): StoredStep {
  return { kind: "action", branch: null, config: { type: WORKFLOW_STEP_TYPE, workflow } };
}

const LEGACY_WAIT: Record<string, WaitSpec["mode"]> = {
  minutes: "minutes",
  hours: "hours",
  days: "days",
  business_hours: "next_business_day",
};

export type LegacyConversion = { workflow: Workflow; notes: string[] };

/**
 * Converts a legacy linear automation (conditions + steps tagged yes/no) into
 * an equivalent tree, so customers can open old automations in the visual
 * builder with EXACTLY the same execution order.
 *
 * Legacy semantics (automation-engine `executeRun`): steps run in position
 * order; a branch step sets the active side; a step tagged "yes"/"no" runs
 * only when that side is active; untagged steps always run; tagged steps
 * before any branch never run.
 *
 * Tree mapping per branch segment (branch → steps up to the next branch):
 *  - the trailing run of untagged steps goes after the branch (runs on both);
 *  - everything before it is copied, in order, into each path: Yes gets the
 *    yes + untagged steps, No gets the no + untagged steps. Untagged steps
 *    interleaved with tagged ones therefore keep their exact position on
 *    whichever side runs, instead of being moved after the branch.
 * Steps that could never run are reported in `notes`, never dropped silently.
 */
export function convertLegacyAutomation(
  steps: (StoredStep & { position?: number })[],
  logic: "and" | "or",
): LegacyConversion {
  const ordered = steps.some((s) => typeof s.position === "number")
    ? [...steps].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    : [...steps];
  const notes: string[] = [];
  const nodes: WorkflowNode[] = [];
  const conditions = ordered.filter((s) => s.kind === "condition");
  if (conditions.length) {
    nodes.push({
      id: newId(),
      type: "condition",
      group: {
        match: logic === "or" ? "any" : "all",
        rules: conditions.map((c) => ({
          field: String(c.config["field"] ?? ""),
          operator: normalizeOperator(String(c.config["operator"] ?? "is")),
          value: c.config["value"] === undefined ? undefined : String(c.config["value"]),
        })),
      },
    });
  }

  const convert = (s: StoredStep): WorkflowNode => {
    if (s.kind === "wait") {
      const mode = String(s.config["mode"] ?? "hours");
      if (mode === "until_time") {
        return { id: newId(), type: "wait", label: `Wait until ${String(s.config["time"] ?? "09:00")}`, wait: { mode: "next_business_day" } };
      }
      return { id: newId(), type: "wait", wait: { mode: LEGACY_WAIT[mode] ?? "hours", amount: Number(s.config["amount"] ?? 1) } };
    }
    const type = String(s.config["type"] ?? "");
    if (type === "end") return { id: newId(), type: "end" };
    const { type: _t, ...config } = s.config;
    return { id: newId(), type: "action", action: type, config };
  };

  const executable = ordered.filter((x) => x.kind !== "condition");
  let i = 0;
  // Before the first branch: untagged steps run, tagged ones never do.
  for (; i < executable.length && executable[i]!.kind !== "branch"; i += 1) {
    const s = executable[i]!;
    if (s.branch === "yes" || s.branch === "no") {
      notes.push(`A step on the ${s.branch === "yes" ? "Yes" : "No"} path before any branch never ran, so it was left out.`);
      continue;
    }
    nodes.push(convert(s));
  }
  while (i < executable.length) {
    const b = executable[i]!;
    i += 1;
    const segment: StoredStep[] = [];
    for (; i < executable.length && executable[i]!.kind !== "branch"; i += 1) segment.push(executable[i]!);
    let cut = segment.length;
    while (cut > 0 && !segment[cut - 1]!.branch) cut -= 1;
    const inside = segment.slice(0, cut);
    const after = segment.slice(cut);
    nodes.push({
      id: newId(),
      type: "branch",
      paths: [{
        key: "yes",
        label: "Yes",
        when: { match: "all", rules: [{ field: String(b.config["field"] ?? ""), operator: normalizeOperator(String(b.config["operator"] ?? "is")), value: b.config["value"] === undefined ? undefined : String(b.config["value"]) }] },
        steps: inside.filter((s) => s.branch !== "no").map(convert),
      }],
      otherwise: { key: "otherwise", label: "No", steps: inside.filter((s) => s.branch !== "yes").map(convert) },
    });
    for (const s of after) nodes.push(convert(s));
  }
  return { workflow: { version: 2, nodes }, notes };
}

export function legacyToWorkflow(steps: (StoredStep & { position?: number })[], logic: "and" | "or"): Workflow {
  return convertLegacyAutomation(steps, logic).workflow;
}
