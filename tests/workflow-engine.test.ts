import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import {
  advance,
  enterPath,
  evaluateGroup,
  evaluateRule,
  legacyToWorkflow,
  nodeAt,
  validateWorkflow,
  workflowFromSteps,
  workflowToStep,
  type Workflow,
  type WorkflowNode,
} from "@/lib/workflow-graph";
import { executeWorkflow, type HopStatus, type WorkflowDeps, type WorkflowState } from "@/lib/workflow-runner";
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-templates";
import { WORKFLOW_ACTIONS } from "@/lib/automation-model";
import {
  automationsAllowedByChain,
  chainForRun,
  computeWorkflowResume,
  customerError,
  triggerMatches,
  zonedLocalToUtc,
} from "@/lib/automation-engine.server";

const A = "6f1c2f0e-1111-4c1a-9d2e-000000000001";
const B = "6f1c2f0e-1111-4c1a-9d2e-000000000002";

const act = (id: string, action = "lead.add_tag"): WorkflowNode => ({ id, type: "action", action, config: {} });

function harness(fields: Record<string, unknown>, overrides: Partial<WorkflowDeps> = {}) {
  const hops = new Map<number, HopStatus>();
  const executed: string[] = [];
  const deps: WorkflowDeps = {
    getField: (f) => fields[f],
    priorHop: async (h) => hops.get(h) ?? null,
    recordHop: async (h, _n, status) => void hops.set(h, status),
    saveState: async () => undefined,
    executeAction: async (action, _c, hop) => {
      executed.push(`${hop}:${action}`);
      return {};
    },
    computeResume: () => "2030-01-01T00:00:00.000Z",
    isRetryable: (m) => m.includes("timeout"),
    ...overrides,
  };
  return { deps, hops, executed };
}

describe("rules", () => {
  const get = (f: string) => ({ "lead.tags": ["SaaS", "Startup"], "lead.company": "Acme Inc", "activity.opens": 3, "lead.title": "" })[f];
  it("supports every operator", () => {
    expect(evaluateRule({ field: "lead.company", operator: "contains", value: "inc" }, get)).toBe(true);
    expect(evaluateRule({ field: "lead.company", operator: "starts_with", value: "acme" }, get)).toBe(true);
    expect(evaluateRule({ field: "lead.company", operator: "ends_with", value: "inc" }, get)).toBe(true);
    expect(evaluateRule({ field: "lead.tags", operator: "is", value: "saas" }, get)).toBe(true);
    expect(evaluateRule({ field: "lead.tags", operator: "not_contains", value: "agency" }, get)).toBe(true);
    expect(evaluateRule({ field: "lead.title", operator: "not_exists" }, get)).toBe(true);
    expect(evaluateRule({ field: "activity.opens", operator: "gt", value: "2" }, get)).toBe(true);
    expect(evaluateRule({ field: "activity.opens", operator: "gte", value: "3" }, get)).toBe(true);
    expect(evaluateRule({ field: "activity.opens", operator: "lte", value: "2" }, get)).toBe(false);
    expect(evaluateRule({ field: "missing", operator: "lt", value: "5" }, get)).toBe(false);
  });
  it("ALL vs ANY", () => {
    const rules = [
      { field: "lead.tags", operator: "is" as const, value: "saas" },
      { field: "lead.tags", operator: "is" as const, value: "enterprise" },
    ];
    expect(evaluateGroup({ match: "all", rules }, get)).toBe(false);
    expect(evaluateGroup({ match: "any", rules }, get)).toBe(true);
  });
});

describe("tree navigation", () => {
  const wf: WorkflowNode[] = [
    act("a"),
    {
      id: "b",
      type: "branch",
      paths: [{ key: "yes", label: "Yes", when: { match: "all", rules: [] }, steps: [act("y1"), act("y2")] }],
      otherwise: { key: "otherwise", label: "No", steps: [] },
    },
    act("c"),
  ];
  it("walks into and out of paths", () => {
    expect(enterPath(wf, [1], "yes")).toEqual([1, "yes", 0]);
    expect(advance(wf, [1, "yes", 0])).toEqual([1, "yes", 1]);
    expect(advance(wf, [1, "yes", 1])).toEqual([2]);
    expect(enterPath(wf, [1], "otherwise")).toEqual([2]);
    expect(advance(wf, [2])).toBeNull();
    expect(nodeAt(wf, [1, "yes", 1])?.id).toBe("y2");
  });
});

describe("executeWorkflow", () => {
  const branchWf = (): Workflow => ({
    version: 2,
    nodes: [
      {
        id: "br",
        type: "branch",
        paths: [
          { key: "pos", label: "Interested", when: { match: "all", rules: [{ field: "reply.sentiment", operator: "is", value: "positive" }] }, steps: [act("p", "task.create")] },
          { key: "ooo", label: "OOO", when: { match: "all", rules: [{ field: "reply.sentiment", operator: "is", value: "out_of_office" }] }, steps: [act("o", "lead.add_tag")] },
        ],
        otherwise: { key: "otherwise", label: "Other", steps: [act("x", "crm.activity")] },
      },
      act("after", "notify.internal"),
    ],
  });

  it("routes multi-way branches", async () => {
    for (const [sentiment, expected] of [["positive", "task.create"], ["out_of_office", "lead.add_tag"], ["neutral", "crm.activity"]] as const) {
      const h = harness({ "reply.sentiment": sentiment });
      const out = await executeWorkflow(branchWf(), { cursor: null, hop: 0 }, h.deps);
      expect(out.status).toBe("completed");
      expect(h.executed).toEqual([`1:${expected}`, "2:notify.internal"]);
    }
  });

  it("stops when a condition fails", async () => {
    const wf: Workflow = { version: 2, nodes: [{ id: "c", type: "condition", group: { match: "all", rules: [{ field: "x", operator: "exists" }] } }, act("a")] };
    const h = harness({});
    const out = await executeWorkflow(wf, { cursor: null, hop: 0 }, h.deps);
    expect(out).toMatchObject({ status: "completed", result: "Conditions not met" });
    expect(h.executed).toEqual([]);
  });

  it("persists waits and resumes after them without repeating earlier actions", async () => {
    const wf: Workflow = { version: 2, nodes: [act("a"), { id: "w", type: "wait", wait: { mode: "days", amount: 2 } }, act("b", "task.create")] };
    const h = harness({});
    const first = await executeWorkflow(wf, { cursor: null, hop: 0 }, h.deps);
    expect(first.status).toBe("waiting");
    expect(h.executed).toEqual(["0:lead.add_tag"]);
    const second = await executeWorkflow(wf, (first as { state: WorkflowState }).state, h.deps);
    expect(second.status).toBe("completed");
    expect(h.executed).toEqual(["0:lead.add_tag", "2:task.create"]);
  });

  it("is idempotent: a completed hop is never executed again", async () => {
    const wf: Workflow = { version: 2, nodes: [act("a"), act("b", "task.create")] };
    const h = harness({});
    h.hops.set(0, "completed");
    await executeWorkflow(wf, { cursor: [0], hop: 0, started: true }, h.deps);
    expect(h.executed).toEqual(["1:task.create"]);
  });

  it("never repeats an action whose outcome is unknown after a crash", async () => {
    const wf: Workflow = { version: 2, nodes: [act("a", "webhook.send")] };
    const h = harness({});
    h.hops.set(0, "running");
    const out = await executeWorkflow(wf, { cursor: [0], hop: 0, started: true }, h.deps);
    expect(out.status).toBe("failed");
    expect(h.executed).toEqual([]);
  });

  it("retries transient failures at the same step and fails permanent ones", async () => {
    const wf: Workflow = { version: 2, nodes: [act("a")] };
    let calls = 0;
    const h = harness({}, {
      executeAction: async () => {
        calls += 1;
        if (calls === 1) throw new Error("network timeout");
        return {};
      },
    });
    const first = await executeWorkflow(wf, { cursor: null, hop: 0 }, h.deps);
    expect(first.status).toBe("retry");
    const second = await executeWorkflow(wf, (first as { state: WorkflowState }).state, h.deps);
    expect(second.status).toBe("completed");
    const bad = harness({}, { executeAction: async () => { throw new Error("Email action failed: mailbox unavailable"); } });
    expect((await executeWorkflow(wf, { cursor: null, hop: 0 }, bad.deps)).status).toBe("failed");
  });

  it("enforces the per-run safety limit", async () => {
    const wf: Workflow = { version: 2, nodes: Array.from({ length: 10 }, (_, i) => act(`a${i}`)) };
    const h = harness({}, { maxHops: 5 });
    const out = await executeWorkflow(wf, { cursor: null, hop: 0 }, h.deps);
    expect(out.status).toBe("failed");
    expect(h.executed).toHaveLength(5);
  });

  it("stop/end actions end the run", async () => {
    const wf: Workflow = { version: 2, nodes: [act("s", "workflow.stop"), act("never")] };
    const h = harness({});
    expect((await executeWorkflow(wf, { cursor: null, hop: 0 }, h.deps)).status).toBe("completed");
    expect(h.executed).toEqual([]);
  });
});

describe("loop protection", () => {
  it("blocks self re-trigger and deep chains", () => {
    const chain = chainForRun({ automation_id: A, metadata: {} });
    expect(automationsAllowedByChain([{ id: A }, { id: B }], chain).map((a) => a.id)).toEqual([B]);
    const deep = chainForRun({ automation_id: B, metadata: { chain: { depth: 2, automationIds: [A] } } });
    expect(deep.depth).toBe(3);
    expect(automationsAllowedByChain([{ id: B }, { id: "c" }], deep)).toEqual([]);
    expect(automationsAllowedByChain([{ id: A }], undefined)).toHaveLength(1);
  });
});

describe("triggers and waits", () => {
  it("filters stage / tag presets", () => {
    expect(triggerMatches({ stage: "interested" }, { payload: { stageKey: "interested" } })).toBe(true);
    expect(triggerMatches({ stage: "interested" }, { payload: { stageName: "Won" } })).toBe(false);
    expect(triggerMatches({ tag: "vip" }, { payload: { tag: "VIP" } })).toBe(true);
    expect(triggerMatches({}, { payload: {} })).toBe(true);
  });
  it("computes resume times", () => {
    const now = Date.UTC(2026, 9, 2, 12, 0); // Friday
    const win = { days: [1, 2, 3, 4, 5], start: 9, end: 17 };
    expect(computeWorkflowResume({ mode: "hours", amount: 2 }, "UTC", win, now)).toBe(new Date(now + 7_200_000).toISOString());
    expect(computeWorkflowResume({ mode: "next_business_day" }, "UTC", win, now)).toBe("2026-10-05T09:00:00.000Z");
    expect(zonedLocalToUtc("2026-10-10T09:00", "America/New_York")).toBe(Date.UTC(2026, 9, 10, 13, 0));
    expect(computeWorkflowResume({ mode: "until_event", event: "lead.replied", timeoutDays: 3 }, "UTC", win, now)).toBe(new Date(now + 3 * 86_400_000).toISOString());
  });
  it("hides stack traces from customers", () => {
    expect(customerError("Mailbox unavailable\n    at foo (x.ts:1)")).toBe("Mailbox unavailable");
  });
});

describe("compatibility and templates", () => {
  it("round-trips storage and leaves legacy steps on the legacy path", () => {
    const wf: Workflow = { version: 2, nodes: [act("a")] };
    expect(workflowFromSteps([workflowToStep(wf)])).toEqual(wf);
    expect(workflowFromSteps([{ kind: "action", config: { type: "campaign.stop_followups" } }])).toBeNull();
  });
  it("converts legacy automations equivalently", () => {
    const wf = legacyToWorkflow(
      [
        { kind: "condition", config: { field: "reply.sentiment", operator: "equals", value: "positive" } },
        { kind: "action", config: { type: "campaign.stop_followups" } },
        { kind: "branch", config: { field: "lead.company", operator: "is_not_empty" } },
        { kind: "action", branch: "yes", config: { type: "lead.add_tag", tag: "x" } },
        { kind: "action", branch: "no", config: { type: "end" } },
      ],
      "and",
    );
    expect(wf.nodes.map((n) => n.type)).toEqual(["condition", "action", "branch"]);
    const br = wf.nodes[2] as Extract<WorkflowNode, { type: "branch" }>;
    expect(br.paths[0]!.steps[0]).toMatchObject({ action: "lead.add_tag", config: { tag: "x" } });
    expect(br.otherwise.steps[0]!.type).toBe("end");
    expect((wf.nodes[0] as Extract<WorkflowNode, { type: "condition" }>).group.rules[0]!.operator).toBe("is");
  });
  it("every template builds a valid workflow using real actions", () => {
    const ids = WORKFLOW_ACTIONS.map((a) => a.id);
    for (const t of WORKFLOW_TEMPLATES) {
      const errors = validateWorkflow(t.build(), ids);
      expect(errors, t.id).toEqual([]);
    }
  });
});
