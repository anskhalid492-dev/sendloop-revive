/**
 * Workflow dry run (pure, client-safe, no IO).
 *
 * Walks the same tree with the same rule evaluator, branch chooser and cursor
 * helpers as the real runner, but in explicit simulation mode: every action
 * and wait is only DESCRIBED. This module has no database, network, email or
 * queue access at all, so a simulation cannot write data or perform an action
 * even by mistake — the only input is a read-only field lookup.
 */
import { actionLabel, CONDITION_FIELDS, TRIGGERS } from "./automation-model";
import {
  advance,
  chooseBranch,
  enterPath,
  evaluateRule,
  MAX_WORKFLOW_HOPS,
  nodeAt,
  normalizeOperator,
  operatorNeedsValue,
  RULE_OPERATORS,
  type Cursor,
  type Rule,
  type RuleGroup,
  type WaitSpec,
  type Workflow,
  type WorkflowNode,
} from "./workflow-graph";

export type SimulationMode = "simulation";

export type SimStepKind = "trigger" | "condition" | "branch" | "wait" | "action" | "end";
export type SimStatus = "passed" | "failed" | "would_run" | "not_simulated" | "stopped";

export type SimStep = {
  kind: SimStepKind;
  title: string;
  lines: { label: string; value: string }[];
  status: SimStatus;
};

export type SimulationResult = {
  mode: SimulationMode;
  steps: SimStep[];
  summary: {
    stepsEvaluated: number;
    branchesEvaluated: number;
    actionsWouldExecute: number;
    waitsSimulated: number;
  };
  outcome: string;
};

export type SimulationInput = {
  workflow: Workflow;
  triggerType: string;
  getField: (field: string) => unknown;
  labels?: { campaigns?: Record<string, string>; stages?: Record<string, string>; workflows?: Record<string, string>; members?: Record<string, string> };
};

const fieldLabel = (id: string) =>
  id.startsWith("custom.") ? `Custom field "${id.slice(7)}"` : (CONDITION_FIELDS.find((f) => f.id === id)?.label ?? id);

function describeRule(r: Rule): string {
  const op = normalizeOperator(r.operator);
  const opLabel = RULE_OPERATORS.find((o) => o.id === op)?.label ?? op;
  return `${fieldLabel(r.field)} ${opLabel}${operatorNeedsValue(op) ? ` ${r.value ?? ""}` : ""}`.trim();
}

function describeGroup(group: RuleGroup | undefined): string {
  const rules = group?.rules ?? [];
  if (!rules.length) return "Always";
  return rules.map(describeRule).join(group?.match === "any" ? " OR " : " AND ");
}

const eventLabel = (id?: string) => (TRIGGERS.find((t) => t.id === id)?.label ?? "the event").toLowerCase();

export function describeSimulatedWait(w: WaitSpec): string {
  switch (w.mode) {
    case "minutes":
    case "hours":
    case "days": {
      const n = Number(w.amount ?? 1);
      const unit = n === 1 ? w.mode.slice(0, -1) : w.mode;
      return `Would wait ${n} ${unit}`;
    }
    case "until_datetime":
      return `Would wait until ${String(w.at ?? "").replace("T", " ")}${w.timezone ? ` (${w.timezone})` : ""}`;
    case "next_business_day":
      return "Would wait until the next business day";
    case "until_event":
      return w.event === "lead.replied"
        ? `Would wait until the lead replies, or until the configured timeout (${w.timeoutDays ?? 7} days).`
        : `Would wait until ${eventLabel(w.event)}, or until the configured timeout (${w.timeoutDays ?? 7} days).`;
  }
}

/** Plain-language description of what an action WOULD do. Never executes. */
export function describeSimulatedAction(action: string, config: Record<string, unknown>, labels: SimulationInput["labels"] = {}): string {
  const str = (k: string) => String(config[k] ?? "").trim();
  const campaign = labels.campaigns?.[str("campaignId")] ?? "the selected campaign";
  switch (action) {
    case "campaign.add":
      return `Lead would be added to ${campaign}`;
    case "campaign.remove":
      return `Lead would be removed from ${campaign}`;
    case "campaign.stop_followups":
      return "Campaign follow-ups for this lead would stop";
    case "campaign.pause_enrollment":
      return "Campaign enrollment for this lead would pause";
    case "crm.move_stage":
      return `Lead would move to ${labels.stages?.[str("stageId")] ?? "the selected stage"}`;
    case "lead.add_tag":
      return `Tag "${str("tag")}" would be added`;
    case "lead.remove_tag":
      return `Tag "${str("tag")}" would be removed`;
    case "task.create":
      return `Task "${str("title") || "Follow up"}" would be created`;
    case "lead.update_field":
      return `Lead ${str("field") || "field"} would be set to "${str("value")}"`;
    case "lead.assign_owner":
      return `Lead would be assigned to ${labels.members?.[str("ownerId")] ?? "the selected owner"}`;
    case "crm.activity":
      return "An activity would be added to the lead's timeline";
    case "lead.add_note":
      return "A note would be added to the lead";
    case "notify.internal":
      return "Your team would get an in-app notification";
    case "notify.slack":
      return "A Slack message would be sent";
    case "webhook.send":
      return "Your webhook would be called";
    case "workflow.start":
      return `Workflow "${labels.workflows?.[str("automationId")] ?? "selected workflow"}" would start`;
    default:
      return "Would execute";
  }
}

const isAiAction = (action: string) => action.startsWith("ai.") || action.startsWith("ai_");

export type SimAiRequest =
  | { kind: "decision"; node: Extract<WorkflowNode, { type: "branch" }> }
  | { kind: "reply"; config: Record<string, unknown> };

export type SimDecisionAnswer = { pathKey: string; output: Record<string, unknown> };
export type SimReplyAnswer =
  | { ok: true; text: string; mode: "draft" | "auto_send"; forcedDraft: string[] }
  | { ok: false; error: string };
type SimAiAnswer = SimDecisionAnswer | SimReplyAnswer | null;

/** Pure dry run; AI nodes are reported as not simulated. */
export function simulateWorkflow(input: SimulationInput): SimulationResult {
  const gen = simulateCore(input);
  let next = gen.next(null);
  while (!next.done) next = gen.next(null);
  return next.value;
}

/**
 * Dry run with AI: the caller answers AI requests (read-only MunchReach AI
 * calls). Still writes nothing and performs no action.
 */
export async function simulateWorkflowWithAi(
  input: SimulationInput,
  ai: { decide: (node: Extract<WorkflowNode, { type: "branch" }>) => Promise<SimDecisionAnswer>; reply: (config: Record<string, unknown>) => Promise<SimReplyAnswer> },
): Promise<SimulationResult> {
  const gen = simulateCore(input);
  let next = gen.next(null);
  while (!next.done) {
    const req = next.value;
    const answer: SimAiAnswer = req.kind === "decision" ? await ai.decide(req.node) : await ai.reply(req.config);
    next = gen.next(answer);
  }
  return next.value;
}

const pct = (n: unknown) => (typeof n === "number" ? `${Math.round(n * 100)}%` : "—");

function* simulateCore(input: SimulationInput): Generator<SimAiRequest, SimulationResult, SimAiAnswer> {
  const { workflow, getField } = input;
  const labels = input.labels ?? {};
  const nodes = workflow.nodes;
  const steps: SimStep[] = [];
  const summary = { stepsEvaluated: 0, branchesEvaluated: 0, actionsWouldExecute: 0, waitsSimulated: 0 };
  const trigger = TRIGGERS.find((t) => t.id === input.triggerType);
  steps.push({
    kind: "trigger",
    title: "Trigger matched",
    lines: [{ label: "Trigger", value: trigger?.label ?? "Unknown trigger" }, { label: "Simulation", value: "Assumed to happen for this lead" }],
    status: "passed",
  });

  let cursor: Cursor | null = nodes.length ? [0] : null;
  let hops = 0;
  let outcome = "Workflow completed";

  const known = (action: string) => actionLabel(action) !== action;

  while (cursor) {
    if (hops >= MAX_WORKFLOW_HOPS) {
      outcome = "Stopped for safety: too many steps";
      break;
    }
    hops += 1;
    const node: WorkflowNode | undefined = nodeAt(nodes, cursor);
    if (!node) break;
    summary.stepsEvaluated += 1;

    if (node.type === "condition") {
      const rules = node.group.rules ?? [];
      const results = rules.map((r) => evaluateRule(r, getField));
      const pass = rules.length === 0 ? true : node.group.match === "any" ? results.some(Boolean) : results.every(Boolean);
      steps.push({
        kind: "condition",
        title: "Condition evaluated",
        lines: [
          { label: "Condition", value: describeGroup(node.group) },
          ...rules.map((r, i) => ({ label: describeRule(r), value: results[i] ? "Matched" : "Not matched" })),
          { label: "Result", value: pass ? "Matched" : "Not matched — the workflow would stop here" },
        ],
        status: pass ? "passed" : "stopped",
      });
      if (!pass) {
        outcome = "Workflow would stop: conditions not met";
        cursor = null;
        break;
      }
      cursor = advance(nodes, cursor);
      continue;
    }

    if (node.type === "branch" && node.ai) {
      summary.branchesEvaluated += 1;
      const answer = (yield { kind: "decision", node }) as SimDecisionAnswer | null;
      if (!answer) {
        steps.push({ kind: "branch", title: "AI Decision not simulated", lines: [{ label: "Reason", value: "AI simulation is not available here." }, { label: "Path", value: `Would take the ${node.otherwise.label} path` }], status: "not_simulated" });
        cursor = enterPath(nodes, cursor, node.otherwise.key);
        continue;
      }
      const o = answer.output;
      const label = String(o["pathLabel"] ?? node.otherwise.label);
      steps.push({
        kind: "branch",
        title: "SIMULATION · AI Decision",
        lines: [
          { label: "Outcome", value: String(o["outcome"] ?? "No valid decision") },
          { label: "Confidence", value: pct(o["confidence"]) },
          ...(o["reason"] ? [{ label: "Reason", value: `"${String(o["reason"])}"` }] : []),
          ...(o["fallbackReason"] ? [{ label: "Fallback", value: String(o["fallbackReason"]) }] : []),
          { label: "Result", value: `Would take the ${label} path.` },
        ],
        status: "passed",
      });
      cursor = enterPath(nodes, cursor, answer.pathKey);
      continue;
    }

    if (node.type === "branch") {
      summary.branchesEvaluated += 1;
      const path = chooseBranch(node, getField);
      steps.push({
        kind: "branch",
        title: `${path.label} branch selected`,
        lines: [
          { label: "Selected path", value: path.label },
          { label: "Because", value: path.key === node.otherwise.key ? "No other path matched" : describeGroup(path.when) },
        ],
        status: "passed",
      });
      cursor = enterPath(nodes, cursor, path.key);
      continue;
    }

    if (node.type === "wait") {
      summary.waitsSimulated += 1;
      steps.push({
        kind: "wait",
        title: "Wait would be scheduled",
        lines: [{ label: "Simulation", value: describeSimulatedWait(node.wait) }],
        status: "would_run",
      });
      cursor = advance(nodes, cursor); // never actually waits
      continue;
    }

    if (node.type === "end" || node.action === "workflow.stop" || node.action === "workflow.end") {
      steps.push({ kind: "end", title: "Workflow would end here", lines: [], status: "stopped" });
      outcome = "Workflow completed";
      cursor = null;
      break;
    }

    // action
    if (node.action === "ai.generate_reply") {
      const answer = (yield { kind: "reply", config: node.config ?? {} }) as SimReplyAnswer | null;
      if (!answer) {
        steps.push({ kind: "action", title: "Not simulated", lines: [{ label: "Reason", value: "AI simulation is not available here." }], status: "not_simulated" });
      } else if (!answer.ok) {
        steps.push({ kind: "action", title: "SIMULATION · AI reply not generated", lines: [{ label: "Reason", value: answer.error }, { label: "Result", value: "No email would be sent. The lead would be handed to a person for review." }], status: "stopped" });
      } else {
        summary.actionsWouldExecute += 1;
        steps.push({
          kind: "action",
          title: "SIMULATION · AI would generate",
          lines: [
            { label: "Reply preview", value: answer.text },
            { label: "Mode", value: answer.mode === "auto_send" ? "Would send automatically" : "Would be saved as a draft" },
            ...answer.forcedDraft.map((r) => ({ label: "Kept as draft", value: r })),
            { label: "Simulation", value: "No real email is sent." },
          ],
          status: "would_run",
        });
      }
    } else if (node.action === "human.review") {
      summary.actionsWouldExecute += 1;
      steps.push({ kind: "action", title: "Action would execute", lines: [{ label: "Action", value: "Request Human Review" }, { label: "Simulation", value: "A review task would be created and automated replies paused for this lead" }], status: "would_run" });
    } else if (isAiAction(node.action)) {
      steps.push({ kind: "action", title: "Not simulated", lines: [{ label: "Reason", value: "AI simulation is not available yet." }], status: "not_simulated" });
    } else if (!known(node.action)) {
      steps.push({ kind: "action", title: "Not simulated", lines: [{ label: "Reason", value: "This step type isn't recognised." }], status: "not_simulated" });
    } else {
      summary.actionsWouldExecute += 1;
      steps.push({
        kind: "action",
        title: "Action would execute",
        lines: [
          { label: "Action", value: node.label || actionLabel(node.action) },
          { label: "Simulation", value: describeSimulatedAction(node.action, node.config ?? {}, labels) },
        ],
        status: "would_run",
      });
    }
    cursor = advance(nodes, cursor);
  }

  steps.push({ kind: "end", title: outcome, lines: [], status: outcome.startsWith("Workflow completed") ? "passed" : "stopped" });
  return { mode: "simulation", steps, summary, outcome };
}
