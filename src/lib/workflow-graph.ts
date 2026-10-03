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

export type WorkflowIssue = { nodeId: string | null; message: string };

/** What the activation check may verify against the workspace's real data. */
export type ValidationContext = {
  /** Current automation id (self-loop detection). */
  automationId?: string;
  triggerType?: string;
  /** Tag filter of a tag trigger, when set. */
  triggerTag?: string;
  supportedTriggers?: string[];
  campaignIds?: string[];
  stageIds?: string[];
  workflowIds?: string[];
  memberIds?: string[];
};

/** Config each action needs before it can run, with the customer-facing fix. */
export const ACTION_REQUIREMENTS: Record<string, { key: string; message: string }[]> = {
  "campaign.add": [{ key: "campaignId", message: "Select a campaign before activating this action." }],
  "campaign.remove": [{ key: "campaignId", message: "Select a campaign before activating this action." }],
  "crm.move_stage": [{ key: "stageId", message: "Select a pipeline stage before activating this action." }],
  "lead.add_tag": [{ key: "tag", message: "Enter the tag to add." }],
  "lead.remove_tag": [{ key: "tag", message: "Enter the tag to remove." }],
  "task.create": [{ key: "title", message: "Give the task a title." }],
  "lead.update_field": [{ key: "field", message: "Choose which lead field to update." }],
  "lead.assign_owner": [{ key: "ownerId", message: "Choose the owner to assign." }],
  "notify.slack": [{ key: "message", message: "Write the Slack message." }],
  "webhook.send": [{ key: "url", message: "Enter the webhook address." }],
  "lead.add_note": [{ key: "body", message: "Write the note." }],
  "workflow.start": [{ key: "automationId", message: "Choose the workflow to start." }],
};

const filled = (v: unknown) => v !== undefined && v !== null && String(v).trim().length > 0;

function ruleIssues(group: RuleGroup | undefined, requireRules: boolean): string[] {
  const out: string[] = [];
  const rules = group?.rules ?? [];
  if (requireRules && rules.length === 0) out.push("Add at least one rule to this path.");
  for (const r of rules) {
    if (!r.field) out.push("Every rule needs a field.");
    else if (!RULE_OPERATORS.some((o) => o.id === normalizeOperator(r.operator))) out.push("Choose a valid comparison.");
    else if (operatorNeedsValue(normalizeOperator(r.operator)) && !filled(r.value)) out.push("Enter a value for every rule.");
    else if (["gt", "lt", "gte", "lte"].includes(normalizeOperator(r.operator)) && !Number.isFinite(Number(r.value))) {
      out.push("Number comparisons need a number.");
    }
  }
  return Array.from(new Set(out));
}

export function validateWorkflowIssues(workflow: Workflow, knownActions: string[], ctx: ValidationContext = {}): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const add = (nodeId: string | null, message: string) => issues.push({ nodeId, message });
  if (ctx.supportedTriggers) {
    if (!ctx.triggerType) add(null, "Choose what starts this workflow.");
    else if (!ctx.supportedTriggers.includes(ctx.triggerType)) add(null, "This trigger can't fire yet. Choose a different trigger.");
  }
  if (workflow.nodes.length === 0) add(null, "Add at least one step.");
  if (countNodes(workflow.nodes) > MAX_WORKFLOW_NODES) add(null, `Workflows can have at most ${MAX_WORKFLOW_NODES} steps.`);
  let actions = 0;
  const walk = (nodes: WorkflowNode[]) => {
    nodes.forEach((n, i) => {
      const ends = n.type === "end" || (n.type === "action" && (n.action === "workflow.stop" || n.action === "workflow.end"));
      if (ends && i < nodes.length - 1) add(nodes[i + 1]!.id, "This step can never run because the workflow ends right before it.");
      if (n.type === "action") {
        if (!knownActions.includes(n.action)) {
          add(n.id, "Choose an action.");
          return;
        }
        if (n.action !== "workflow.stop") actions += 1;
        const cfg = n.config ?? {};
        for (const req of ACTION_REQUIREMENTS[n.action] ?? []) if (!filled(cfg[req.key])) add(n.id, req.message);
        const campaignId = cfg["campaignId"];
        if (filled(campaignId) && ctx.campaignIds && !ctx.campaignIds.includes(String(campaignId))) add(n.id, "The selected campaign no longer exists. Select another campaign.");
        const stageId = cfg["stageId"];
        if (n.action === "crm.move_stage" && filled(stageId) && ctx.stageIds && !ctx.stageIds.includes(String(stageId))) add(n.id, "The selected pipeline stage no longer exists. Select another stage.");
        const ownerId = cfg["ownerId"];
        if (n.action === "lead.assign_owner" && filled(ownerId) && ctx.memberIds && !ctx.memberIds.includes(String(ownerId))) add(n.id, "The selected owner is no longer in this workspace.");
        if (n.action === "workflow.start" && filled(cfg["automationId"])) {
          const target = String(cfg["automationId"]);
          if (ctx.automationId && target === ctx.automationId) add(n.id, "A workflow can't start itself. Choose a different workflow.");
          else if (ctx.workflowIds && !ctx.workflowIds.includes(target)) add(n.id, "The selected workflow no longer exists.");
        }
        if (n.action === "task.create" && filled(cfg["dueInDays"]) && !(Number(cfg["dueInDays"]) >= 0)) add(n.id, "Task due days must be zero or more.");
        if (n.action === "webhook.send" && filled(cfg["url"]) && !/^https:\/\//i.test(String(cfg["url"]))) add(n.id, "The webhook address must start with https://.");
      }
      if (n.type === "condition") for (const m of ruleIssues(n.group, true)) add(n.id, m);
      if (n.type === "wait") {
        const w = n.wait;
        if (["minutes", "hours", "days"].includes(w.mode)) {
          const amount = Number(w.amount);
          if (!(amount > 0) || !Number.isFinite(amount)) add(n.id, "Set how long to wait.");
          else if (w.mode === "days" && amount > 365) add(n.id, "Waits can be at most 365 days.");
        }
        if (w.mode === "until_datetime" && (!w.at || Number.isNaN(Date.parse(w.at)))) add(n.id, "Pick a valid date and time.");
        if (w.mode === "until_event") {
          if (!w.event) add(n.id, "Choose the event to wait for.");
          else if (ctx.supportedTriggers && !ctx.supportedTriggers.includes(w.event)) add(n.id, "This event can't happen yet. Choose a different event.");
          if (w.timeoutDays !== undefined && !(Number(w.timeoutDays) > 0)) add(n.id, "Set a timeout of at least 1 day.");
        }
      }
      if (n.type === "branch") {
        if (n.paths.length === 0) add(n.id, "Add at least one path.");
        for (const p of n.paths) for (const m of ruleIssues(p.when, true)) add(n.id, `${p.label || "Path"}: ${m}`);
        for (const p of n.paths) walk(p.steps);
        walk(n.otherwise.steps);
      }
    });
  };
  walk(workflow.nodes);
  if (workflow.nodes.length > 0 && actions === 0) add(null, "Add at least one action.");
  // Self-trigger loop: a workflow started by "another workflow" that starts
  // itself is already caught above; tag triggers re-fired by the same tag
  // change would loop and are blocked here.
  if (ctx.triggerType === "lead.tag_added" || ctx.triggerType === "lead.tag_removed") {
    const action = ctx.triggerType === "lead.tag_added" ? "lead.add_tag" : "lead.remove_tag";
    const find = (nodes: WorkflowNode[]): WorkflowNode | undefined => {
      for (const n of nodes) {
        if (n.type === "action" && n.action === action) {
          const tag = String(n.config?.["tag"] ?? "").trim().toLowerCase();
          const filter = (ctx.triggerTag ?? "").trim().toLowerCase();
          if (!filter || !tag || tag === filter) return n;
        }
        if (n.type === "branch") for (const p of [...n.paths, n.otherwise]) { const f = find(p.steps); if (f) return f; }
      }
      return undefined;
    };
    const hit = find(workflow.nodes);
    if (hit) add(hit.id, "This step changes the same tag that starts the workflow, which would retrigger it. Use a different tag or action.");
  }
  return issues;
}

export function validateWorkflow(workflow: Workflow, knownActions: string[], ctx: ValidationContext = {}): string[] {
  return Array.from(new Set(validateWorkflowIssues(workflow, knownActions, ctx).map((i) => i.message)));
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
