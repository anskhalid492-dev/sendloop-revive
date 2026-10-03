import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { WorkflowBuilder } from "@/components/automations/WorkflowBuilder";
import { makeAiDecisionNode, type Workflow, type WorkflowNode } from "@/lib/workflow-graph";

export const Route = createFileRoute("/zz-wf-preview")({ component: P });
function P() {
  const [wf, setWf] = useState<Workflow>(() => {
    const d = makeAiDecisionNode(["High Intent", "Medium Intent", "Low Intent", "Unclear"]) as Extract<WorkflowNode, { type: "branch" }>;
    d.ai!.question = "What is the lead's intent?";
    d.paths[0]!.steps = [
      { id: "a", type: "action", action: "lead.add_tag", config: { tag: "hot" } },
      { id: "b", type: "action", action: "ai.generate_reply", config: { mode: "draft" } },
    ] as WorkflowNode[];
    d.paths[1]!.steps = [{ id: "c", type: "wait", wait: { mode: "days", amount: 2 } }, { id: "e", type: "action", action: "ai.generate_reply", config: { mode: "draft" } }, { id: "f", type: "action", action: "lead.add_tag", config: { tag: "warm" } }] as WorkflowNode[];
    d.otherwise.steps = [{ id: "h", type: "action", action: "human.review", config: {} }] as WorkflowNode[];
    return { version: 2, nodes: [d] } as Workflow;
  });
  return <div className="p-6"><WorkflowBuilder workflow={wf} onChange={setWf} options={{ campaigns: [], stages: [], members: [], workflows: [] }} issues={{ e: ["Pick a tone"] }} /></div>;
}
