/**
 * "Test workflow" server logic: authorisation + read-only context + the pure
 * simulator. Everything goes through the caller's RLS-scoped client and is
 * also explicitly filtered by workspace, so a lead, workflow, campaign or
 * member from another workspace can never be read. Nothing is written.
 */
import { countNodes, type Workflow } from "@/lib/workflow-graph";
import { simulateWorkflowWithAi, type SimulationResult } from "@/lib/workflow-simulator";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;
const sel = (s: string) => s;

export type SimulationRequest = {
  workspaceId: string;
  automationId: string;
  leadId: string;
  triggerType: string;
  workflow: { version: 2; nodes: unknown[] };
};

export async function runWorkflowSimulation(client: Client, data: SimulationRequest): Promise<SimulationResult> {
    const [{ data: automation }, { data: lead }] = await Promise.all([
      client.from("automations").select(sel("id")).eq("id", data.automationId).eq("workspace_id", data.workspaceId).maybeSingle(),
      client.from("leads").select(sel("id")).eq("id", data.leadId).eq("workspace_id", data.workspaceId).maybeSingle(),
    ]);
    if (!automation) throw new Error("This workflow isn't available in your workspace.");
    if (!lead) throw new Error("This lead isn't available in your workspace.");
    const workflow = data.workflow as unknown as Workflow;
    if (countNodes(workflow.nodes) > 60) throw new Error("Workflows can have at most 60 steps.");

    const { loadSimulationContext } = await import("@/lib/automation-engine.server");
    const [{ getField }, { data: campaigns }, { data: stages }, { data: workflows }, { data: members }] = await Promise.all([
      loadSimulationContext(client, { workspaceId: data.workspaceId, leadId: data.leadId }),
      client.from("campaigns").select(sel("id, name")).eq("workspace_id", data.workspaceId).limit(500),
      client.from("crm_stages").select(sel("id, name")).eq("workspace_id", data.workspaceId),
      client.from("automations").select(sel("id, name")).eq("workspace_id", data.workspaceId).limit(500),
      client.from("workspace_members").select(sel("user_id, profiles:user_id(email, full_name)")).eq("workspace_id", data.workspaceId),
    ]);
    const map = (rows: unknown) => Object.fromEntries(((rows ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
    // AI nodes run against the MunchReach AI provider in read-only mode:
    // context is loaded through the caller's RLS client, filtered by workspace.
    const { loadAgentConversation, loadSalesAgentSettings, runAiDecision, runAiReply } = await import("@/lib/sales-agent.server");
    let agentPromise: Promise<{ ctx: import("@/lib/sales-agent.server").AgentContext; settings: import("@/lib/sales-agent").SalesAgentSettings }> | null = null;
    const agent = () =>
      (agentPromise ??= (async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [settings, convo, { data: fullLead }] = await Promise.all([
          loadSalesAgentSettings(supabaseAdmin, data.workspaceId),
          loadAgentConversation(client, data.workspaceId, data.leadId),
          client.from("leads").select("*").eq("id", data.leadId).eq("workspace_id", data.workspaceId).maybeSingle(),
        ]);
        return {
          settings,
          ctx: { workspaceId: data.workspaceId, lead: fullLead ?? null, stageName: null, campaignName: null, conversation: convo.conversation, messages: convo.messages, previousDecisions: [] as { outcome: string | null; pathLabel: string }[] },
        };
      })());
    let lastConfidence: number | null = null;
    return simulateWorkflowWithAi({
      workflow,
      triggerType: data.triggerType,
      getField,
      labels: {
        campaigns: map(campaigns),
        stages: map(stages),
        workflows: map(workflows),
        members: Object.fromEntries(
          ((members ?? []) as { user_id: string; profiles: { email: string; full_name: string | null } | null }[]).map((m) => [
            m.user_id,
            m.profiles?.full_name || m.profiles?.email || "a team member",
          ]),
        ),
      },
    }, {
      decide: async (node) => {
        const a = await agent();
        const decided = await runAiDecision(node, a.ctx, a.settings);
        lastConfidence = (decided.output["confidence"] as number | null) ?? null;
        a.ctx.previousDecisions.push({ outcome: (decided.output["outcome"] as string) ?? null, pathLabel: String(decided.output["pathLabel"]) });
        return decided;
      },
      reply: async (config) => {
        const a = await agent();
        const r = await runAiReply(config, a.ctx, a.settings, lastConfidence);
        return r.ok ? { ok: true, text: r.text, mode: r.mode, forcedDraft: r.forcedDraft } : { ok: false, error: r.error };
      },
    });
}
