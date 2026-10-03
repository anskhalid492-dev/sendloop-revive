import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown as { from: unknown; rpc: unknown } }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: new Proxy({}, { get: (_t, key) => (holder.db as Record<string | symbol, unknown>)[key] }),
}));

import { fakeDb } from "./helpers/fake-db";
import { assertNotSimulation, emitAutomationEvent } from "@/lib/automation-engine.server";
import { AVAILABLE_TRIGGERS, TRIGGERS, WORKFLOW_ACTIONS, isSupportedTrigger } from "@/lib/automation-model";
import {
  campaignCompletedEventKey,
  emailSentEventKey,
  emitCampaignCompletedAutomation,
  emitEmailSentAutomation,
} from "@/lib/automation-emit.server";
import { completeActiveCampaign, finalizeCampaignIfDrained } from "@/lib/dispatch.server";
import {
  convertLegacyAutomation,
  validateWorkflow,
  validateWorkflowIssues,
  type Workflow,
  type WorkflowNode,
} from "@/lib/workflow-graph";
import { executeWorkflow, type HopStatus } from "@/lib/workflow-runner";
import { simulateWorkflow, describeSimulatedWait } from "@/lib/workflow-simulator";
import { runWorkflowSimulation } from "@/lib/workflow-simulation.server";

const WS_A = "a0000000-0000-4000-8000-000000000001";
const WS_B = "b0000000-0000-4000-8000-000000000002";
const LEAD_A = "a0000000-0000-4000-8000-0000000000a1";
const LEAD_B = "b0000000-0000-4000-8000-0000000000b1";
const AUTO_A = "a0000000-0000-4000-8000-0000000000f1";
const AUTO_B = "b0000000-0000-4000-8000-0000000000f2";
const CAMP_A = "a0000000-0000-4000-8000-0000000000c1";
const STAGE_A = "a0000000-0000-4000-8000-0000000000d1";
const KNOWN = WORKFLOW_ACTIONS.map((a) => a.id);

/* ----------------------------------------------- legacy reference engine */

type Legacy = { kind: "condition" | "action" | "wait" | "branch"; branch?: "yes" | "no" | null; position: number; config: Record<string, unknown> };

/** Mirrors automation-engine `executeRun` step selection exactly. */
function legacyOrder(steps: Legacy[], fields: Record<string, unknown>): string[] {
  const sorted = [...steps].sort((a, b) => a.position - b.position);
  const out: string[] = [];
  const conds = sorted.filter((s) => s.kind === "condition");
  if (conds.length && !conds.every((c) => String(fields[String(c.config["field"])] ?? "") === String(c.config["value"] ?? ""))) return out;
  let branch: string | null = null;
  for (const s of sorted.filter((x) => x.kind !== "condition")) {
    if (s.kind === "branch") {
      branch = String(fields[String(s.config["field"])] ?? "") === String(s.config["value"] ?? "") ? "yes" : "no";
      continue;
    }
    if (s.branch && branch && s.branch !== branch) continue;
    if (s.branch && !branch) continue;
    if (s.kind === "wait") {
      out.push("wait");
      continue;
    }
    if (s.config["type"] === "end") return out;
    out.push(String(s.config["note"]));
  }
  return out;
}

async function treeOrder(workflow: Workflow, fields: Record<string, unknown>): Promise<string[]> {
  const out: string[] = [];
  const hops = new Map<number, HopStatus>();
  let state = { cursor: null as (number | string)[] | null, hop: 0, started: false };
  for (let guard = 0; guard < 20; guard += 1) {
    const result = await executeWorkflow(workflow, state, {
      getField: (f) => fields[f],
      priorHop: async (h) => hops.get(h) ?? null,
      recordHop: async (h, node, status) => {
        hops.set(h, status);
        if (node.type === "wait" && status === "waiting") out.push("wait");
      },
      saveState: async () => undefined,
      executeAction: async (_a, config) => (out.push(String(config["note"])), {}),
      computeResume: () => "2030-01-01T00:00:00.000Z",
      isRetryable: () => false,
    });
    if (result.status !== "waiting") break;
    state = result.state as typeof state;
  }
  return out;
}

const a = (note: string, position: number, branch: "yes" | "no" | null = null): Legacy => ({ kind: "action", position, branch, config: { type: "lead.add_tag", tag: note, note } });
const br = (position: number): Legacy => ({ kind: "branch", position, config: { field: "lead.status", operator: "equals", value: "interested" } });
const yes = { "lead.status": "interested" };
const no = { "lead.status": "cold" };

async function expectSameOrder(steps: Legacy[], extraFields: Record<string, unknown> = {}) {
  const { workflow, notes } = convertLegacyAutomation(steps, "and");
  for (const fields of [{ ...yes, ...extraFields }, { ...no, ...extraFields }]) {
    expect(await treeOrder(workflow, fields)).toEqual(legacyOrder(steps, fields));
  }
  return { workflow, notes };
}

describe("legacy automation conversion preserves execution order", () => {
  it("linear automation with multiple actions", async () => {
    const { workflow } = await expectSameOrder([a("A", 0), a("B", 1), a("C", 2)]);
    expect(workflow.nodes.map((n) => n.type)).toEqual(["action", "action", "action"]);
  });
  it("condition with YES/NO paths and multiple steps on each", async () => {
    await expectSameOrder([br(0), a("A", 1, "yes"), a("B", 2, "yes"), a("C", 3, "no"), a("D", 4, "no")]);
  });
  it("steps before and after a branch", async () => {
    const { workflow } = await expectSameOrder([a("pre", 0), br(1), a("Y", 2, "yes"), a("N", 3, "no"), a("post1", 4), a("post2", 5)]);
    expect(workflow.nodes.map((n) => n.type)).toEqual(["action", "branch", "action", "action"]);
  });
  it("an untagged step BETWEEN yes and no steps keeps its exact position", async () => {
    // Legacy: yes → A, M ; no → M, C. The old converter moved M after the branch.
    await expectSameOrder([br(0), a("A", 1, "yes"), a("M", 2), a("C", 3, "no")]);
    await expectSameOrder([br(0), a("A", 1, "yes"), a("M", 2), a("B", 3, "yes"), a("C", 4, "no"), a("T", 5)]);
  });
  it("positions out of array order are sorted like the engine", async () => {
    await expectSameOrder([a("C", 3, "no"), br(0), a("A", 1, "yes"), a("M", 2)]);
  });
  it("multiple sequential branches (later branch overrides)", async () => {
    await expectSameOrder([br(0), a("A", 1, "yes"), a("B", 2, "no"), a("mid", 3), br(4), a("C", 5, "yes"), a("D", 6, "no")]);
  });
  it("gating conditions, waits and end steps", async () => {
    const steps: Legacy[] = [
      { kind: "condition", position: 0, config: { field: "lead.country", operator: "equals", value: "US" } },
      a("A", 1),
      { kind: "wait", position: 2, config: { mode: "days", amount: 2 } },
      br(3),
      { kind: "action", position: 4, branch: "no", config: { type: "end" } },
      a("Y", 5, "yes"),
    ];
    await expectSameOrder(steps, { "lead.country": "US" });
    await expectSameOrder(steps, { "lead.country": "DE" });
  });
  it("never silently drops steps that could never run", () => {
    const { notes } = convertLegacyAutomation([a("orphan", 0, "yes"), a("B", 1)], "and");
    expect(notes).toHaveLength(1);
  });
  it("action config is unchanged", () => {
    const { workflow } = convertLegacyAutomation([{ kind: "action", position: 0, config: { type: "campaign.add", campaignId: CAMP_A } }], "and");
    expect(workflow.nodes[0]).toMatchObject({ type: "action", action: "campaign.add", config: { campaignId: CAMP_A } });
  });
});

/* ----------------------------------------------------------- validation */

const act = (action: string, config: Record<string, unknown> = {}, id = crypto.randomUUID()): WorkflowNode => ({ id, type: "action", action, config });
const wf = (...nodes: WorkflowNode[]): Workflow => ({ version: 2, nodes });
const supported = AVAILABLE_TRIGGERS.map((t) => t.id);

describe("activation validation", () => {
  it("requires a supported trigger", () => {
    expect(validateWorkflow(wf(act("lead.add_tag", { tag: "x" })), KNOWN, { supportedTriggers: supported })).toContain("Choose what starts this workflow.");
    expect(validateWorkflow(wf(act("lead.add_tag", { tag: "x" })), KNOWN, { supportedTriggers: supported, triggerType: "campaign.started" }).join()).toMatch(/can't fire yet/);
  });
  it("flags invalid conditions next to the step", () => {
    const issues = validateWorkflowIssues(wf({ id: "c1", type: "condition", group: { match: "all", rules: [{ field: "lead.status", operator: "is", value: "" }] } }, act("lead.add_tag", { tag: "x" })), KNOWN);
    expect(issues).toContainEqual({ nodeId: "c1", message: "Enter a value for every rule." });
  });
  it("flags missing and invalid campaign / stage / unknown action", () => {
    const issues = validateWorkflowIssues(
      wf(act("campaign.add", {}, "n1"), act("campaign.add", { campaignId: "gone" }, "n2"), act("crm.move_stage", { stageId: "gone" }, "n3"), act("nope", {}, "n4")),
      KNOWN,
      { campaignIds: [CAMP_A], stageIds: [STAGE_A] },
    );
    expect(issues).toContainEqual({ nodeId: "n1", message: "Select a campaign before activating this action." });
    expect(issues.find((i) => i.nodeId === "n2")?.message).toMatch(/no longer exists/);
    expect(issues.find((i) => i.nodeId === "n3")?.message).toMatch(/stage no longer exists/);
    expect(issues.find((i) => i.nodeId === "n4")?.message).toBe("Choose an action.");
  });
  it("flags invalid waits", () => {
    const issues = validateWorkflowIssues(wf({ id: "w", type: "wait", wait: { mode: "days", amount: 0 } }, act("lead.add_tag", { tag: "x" })), KNOWN);
    expect(issues).toContainEqual({ nodeId: "w", message: "Set how long to wait." });
  });
  it("blocks self-start and same-tag retrigger loops, and unreachable steps", () => {
    expect(validateWorkflow(wf(act("workflow.start", { automationId: AUTO_A })), KNOWN, { automationId: AUTO_A }).join()).toMatch(/can't start itself/);
    expect(validateWorkflow(wf(act("lead.add_tag", { tag: "hot" })), KNOWN, { triggerType: "lead.tag_added", triggerTag: "hot" }).join()).toMatch(/retrigger/);
    expect(validateWorkflow(wf(act("lead.add_tag", { tag: "cold" })), KNOWN, { triggerType: "lead.tag_added", triggerTag: "hot" })).toEqual([]);
    expect(validateWorkflow(wf({ id: "e", type: "end" }, act("lead.add_tag", { tag: "x" })), KNOWN).join()).toMatch(/can never run/);
  });
  it("hides triggers that nothing emits; keeps Email sent and Campaign completed", () => {
    expect(isSupportedTrigger("email.sent")).toBe(true);
    expect(isSupportedTrigger("campaign.completed")).toBe(true);
    for (const t of TRIGGERS.filter((x) => x.available === false)) expect(AVAILABLE_TRIGGERS).not.toContain(t);
  });
});

/* -------------------------------------------------------------- dry run */

describe("workflow simulation", () => {
  const fields = { "lead.status": "interested", "lead.country": "US", "activity.replies": 0 };
  const get = (f: string) => (fields as Record<string, unknown>)[f];
  const full = wf(
    { id: "c", type: "condition", group: { match: "any", rules: [{ field: "lead.status", operator: "is", value: "interested" }, { field: "lead.country", operator: "is", value: "DE" }] } },
    {
      id: "b",
      type: "branch",
      paths: [{ key: "p1", label: "Interested", when: { match: "all", rules: [{ field: "lead.status", operator: "is", value: "interested" }] }, steps: [{ id: "w", type: "wait", wait: { mode: "days", amount: 3 } }, act("crm.move_stage", { stageId: STAGE_A })] }],
      otherwise: { key: "otherwise", label: "No", steps: [act("lead.add_tag", { tag: "cold" })] },
    },
    { id: "w2", type: "wait", wait: { mode: "until_event", event: "lead.replied", timeoutDays: 5 } },
    act("ai.decide"),
    act("webhook.send", { url: "https://example.com" }),
  );

  it("evaluates trigger, ANY condition, branch, waits and actions in order without waiting", () => {
    const r = simulateWorkflow({ workflow: full, triggerType: "lead.replied", getField: get, labels: { stages: { [STAGE_A]: "Interested" } } });
    expect(r.mode).toBe("simulation");
    expect(r.steps.map((s) => s.title)).toEqual([
      "Trigger matched",
      "Condition evaluated",
      "Interested branch selected",
      "Wait would be scheduled",
      "Action would execute",
      "Wait would be scheduled",
      "Not simulated",
      "Action would execute",
      "Workflow completed",
    ]);
    expect(r.steps[4]!.lines).toContainEqual({ label: "Simulation", value: "Lead would move to Interested" });
    expect(r.steps[3]!.lines[0]!.value).toBe("Would wait 3 days");
    expect(r.steps[5]!.lines[0]!.value).toMatch(/until the lead replies, or until the configured timeout/);
    expect(r.steps[6]!.lines[0]!.value).toBe("AI simulation is not available yet.");
    expect(r.summary).toEqual({ stepsEvaluated: 7, branchesEvaluated: 1, actionsWouldExecute: 2, waitsSimulated: 2 });
  });

  it("ALL condition not matched stops the simulation", () => {
    const r = simulateWorkflow({
      workflow: wf({ id: "c", type: "condition", group: { match: "all", rules: [{ field: "lead.status", operator: "is", value: "interested" }, { field: "lead.country", operator: "is", value: "DE" }] } }, act("lead.add_tag", { tag: "x" })),
      triggerType: "lead.created",
      getField: get,
    });
    expect(r.outcome).toMatch(/conditions not met/);
    expect(r.summary.actionsWouldExecute).toBe(0);
  });

  it("describes waits in plain language", () => {
    expect(describeSimulatedWait({ mode: "days", amount: 1 })).toBe("Would wait 1 day");
  });

  it("the real action layer refuses simulation runs", () => {
    expect(() => assertNotSimulation({ simulation: true })).toThrow(/never perform real actions/);
    expect(() => assertNotSimulation({})).not.toThrow();
  });

  function workspaceDb() {
    return fakeDb({
      automations: [{ id: AUTO_A, workspace_id: WS_A, name: "A flow" }, { id: AUTO_B, workspace_id: WS_B, name: "B flow" }],
      leads: [
        { id: LEAD_A, workspace_id: WS_A, email: "a@example.com", status: "interested", stage_id: null },
        { id: LEAD_B, workspace_id: WS_B, email: "b@example.com", status: "interested", stage_id: null },
      ],
      workspaces: [{ id: WS_A, timezone: "UTC" }],
      campaigns: [{ id: CAMP_A, workspace_id: WS_A, name: "Q4 outreach" }],
      crm_stages: [{ id: STAGE_A, workspace_id: WS_A, name: "Interested" }],
      workspace_members: [],
      campaign_messages: [],
      email_engagement_events: [],
      campaign_replies: [],
      lead_tasks: [],
    });
  }
  const req = (over: Partial<Parameters<typeof runWorkflowSimulation>[1]> = {}) => ({
    workspaceId: WS_A,
    automationId: AUTO_A,
    leadId: LEAD_A,
    triggerType: "lead.replied",
    workflow: wf(
      act("campaign.add", { campaignId: CAMP_A }),
      act("crm.move_stage", { stageId: STAGE_A }),
      act("task.create", { title: "Call" }),
      act("lead.update_field", { field: "status", value: "won" }),
      act("workflow.start", { automationId: AUTO_A }),
      act("webhook.send", { url: "https://example.com" }),
      act("notify.slack", { message: "hi" }),
    ) as never,
    ...over,
  });

  it("runs a full simulation and writes nothing (no emails, campaigns, pipeline, tasks, webhooks)", async () => {
    const db = workspaceDb();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await runWorkflowSimulation(db.client, req());
    expect(r.summary.actionsWouldExecute).toBe(7);
    expect(r.steps.some((s) => s.lines.some((l) => l.value === "Lead would be added to Q4 outreach"))).toBe(true);
    expect(db.writes).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("Customer A cannot test Customer B's lead or workflow", async () => {
    const db = workspaceDb();
    await expect(runWorkflowSimulation(db.client, req({ leadId: LEAD_B }))).rejects.toThrow("This lead isn't available in your workspace.");
    await expect(runWorkflowSimulation(db.client, req({ automationId: AUTO_B }))).rejects.toThrow("This workflow isn't available in your workspace.");
    await expect(runWorkflowSimulation(db.client, req({ workspaceId: WS_B }))).rejects.toThrow(/isn't available/);
    expect(db.writes).toEqual([]);
  });

  it("never reveals another workspace's campaign names", async () => {
    const db = workspaceDb();
    db.tables["campaigns"]!.push({ id: "c-b", workspace_id: WS_B, name: "Secret B campaign" });
    const r = await runWorkflowSimulation(db.client, req({ workflow: wf(act("campaign.add", { campaignId: "c-b" })) as never }));
    expect(JSON.stringify(r)).not.toContain("Secret B campaign");
  });
});

/* ------------------------------------------------ events + idempotency */

function engineDb(triggerType: string) {
  return fakeDb(
    {
      automation_runs: [],
      automations: [{ id: AUTO_A, workspace_id: WS_A, name: "A", trigger_type: triggerType, trigger_config: {}, condition_logic: "and", version: 1, status: "active" }],
      automation_events: [],
      automation_steps: [{ id: crypto.randomUUID(), automation_id: AUTO_A, position: 0, kind: "action", branch: null, config: { type: "lead.add_tag", tag: "x" } }],
    },
    { automation_events: ["idempotency_key"] },
  );
}

describe("Email sent / Campaign completed through the existing event system", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

  it("Email sent starts a run once even if delivered twice", async () => {
    const db = engineDb("email.sent");
    holder.db = db.client as never;
    const msg = { id: "msg-uuid", workspace_id: WS_A, campaign_id: CAMP_A, lead_id: LEAD_A };
    await emitEmailSentAutomation(msg, { mailboxId: "m", sentAt: "2026-10-03T00:00:00Z" }, emitAutomationEvent as never);
    await emitEmailSentAutomation(msg, { mailboxId: "m", sentAt: "2026-10-03T00:00:00Z" }, emitAutomationEvent as never);
    expect(db.tables["automation_events"]).toHaveLength(1);
    expect(db.tables["automation_events"]![0]!["idempotency_key"]).toBe(emailSentEventKey("msg-uuid"));
    expect(db.tables["automation_runs"]).toHaveLength(1);
  });

  it("Campaign completed starts a run once even if processed twice", async () => {
    const db = engineDb("campaign.completed");
    holder.db = db.client as never;
    const rows = [{ id: CAMP_A, workspace_id: WS_A }];
    await emitCampaignCompletedAutomation(rows, "drained", emitAutomationEvent as never);
    await emitCampaignCompletedAutomation(rows, "drained", emitAutomationEvent as never);
    expect(db.tables["automation_events"]).toHaveLength(1);
    expect(db.tables["automation_events"]![0]!["idempotency_key"]).toBe(campaignCompletedEventKey(CAMP_A));
    expect(db.tables["automation_runs"]).toHaveLength(1);
  });

  it("finalizeCampaignIfDrained emits only when the campaign actually flips to completed", async () => {
    const db = fakeDb({
      campaign_messages: [{ id: "m1", campaign_id: CAMP_A, status: "sent", sent_at: "x" }],
      campaign_recipients: [{ id: "r1", campaign_id: CAMP_A, status: "completed" }],
      campaigns: [{ id: CAMP_A, workspace_id: WS_A, status: "active" }],
    });
    const emit = vi.fn(async () => ({ runs: 1 }));
    expect(await finalizeCampaignIfDrained(db.client as never, CAMP_A, emit)).toBe(true);
    expect(db.tables["campaigns"]![0]!["status"]).toBe("completed");
    await finalizeCampaignIfDrained(db.client as never, CAMP_A, emit); // second pass: already completed
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "campaign.completed", campaignId: CAMP_A, workspaceId: WS_A }));
  });

  it("does not complete or emit while sends are still queued", async () => {
    const db = fakeDb({
      campaign_messages: [{ id: "m1", campaign_id: CAMP_A, status: "scheduled" }],
      campaign_recipients: [],
      campaigns: [{ id: CAMP_A, workspace_id: WS_A, status: "active" }],
    });
    const emit = vi.fn(async () => ({ runs: 1 }));
    expect(await finalizeCampaignIfDrained(db.client as never, CAMP_A, emit)).toBe(false);
    expect(emit).not.toHaveBeenCalled();
    expect(await completeActiveCampaign(db.client as never, "missing")).toEqual([]);
  });
});

/* ---------------------------------------------- existing automations */

describe("existing automations behave exactly as before", () => {
  const cases: [string, Legacy[], Record<string, unknown>, string[]][] = [
    ["Reply → Stop follow-ups", [{ kind: "action", position: 0, config: { type: "campaign.stop_followups", note: "stop" } }], {}, ["stop"]],
    ["Positive reply → Move to Interested", [{ kind: "action", position: 0, config: { type: "crm.move_stage", stageId: STAGE_A, note: "move" } }], {}, ["move"]],
    ["New lead → Add to campaign", [{ kind: "action", position: 0, config: { type: "campaign.add", campaignId: CAMP_A, note: "add" } }], {}, ["add"]],
    ["Meeting booked → Move to Meeting Booked", [{ kind: "action", position: 0, config: { type: "crm.move_stage", stageId: STAGE_A, note: "meeting" } }], {}, ["meeting"]],
  ];
  it.each(cases)("%s", async (_name, steps, fields, expected) => {
    expect(legacyOrder(steps, fields)).toEqual(expected);
    const { workflow } = convertLegacyAutomation(steps, "and");
    expect(await treeOrder(workflow, fields)).toEqual(expected);
  });
});
