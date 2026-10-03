/**
 * AI Sales Agent server core: workspace-scoped context loading + the AI
 * Decision / AI Reply calls through the MunchReach provider. Shared by live
 * workflow runs and the read-only "Test workflow" simulation. Every read is
 * explicitly filtered by workspace_id; nothing here writes data.
 */
import {
  buildAiContext,
  buildDecisionPrompt,
  buildReplyPrompt,
  checkGeneratedReply,
  clampThreshold,
  decisionOutcomes,
  normalizeReplyConfig,
  normalizeSettings,
  parseDecision,
  preReplySafety,
  routeDecision,
  type AiReplyConfig,
  type SalesAgentSettings,
} from "@/lib/sales-agent";
import { callSalesAgentModel, type SalesAgentCallMeta } from "@/lib/sales-agent-ai.server";
import type { WorkflowNode } from "@/lib/workflow-graph";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const settingsKey = (workspaceId: string) => `ai_sales_agent:${workspaceId}`;

export async function loadSalesAgentSettings(db: Db, workspaceId: string): Promise<SalesAgentSettings> {
  const { data } = await db.from("platform_settings").select("value").eq("key", settingsKey(workspaceId)).maybeSingle();
  return normalizeSettings(data?.value);
}

export type AgentContext = {
  workspaceId: string;
  lead: Record<string, unknown> | null;
  stageName: string | null;
  campaignName: string | null;
  conversation: { id: string; subject: string; prospect_email: string } | null;
  messages: { direction: string; body: string | null; occurred_at: string | null }[];
  previousDecisions: { outcome: string | null; pathLabel: string }[];
};

/** Latest conversation for this lead, in this workspace only. */
export async function loadAgentConversation(db: Db, workspaceId: string, leadId: string | null, conversationId?: string | null) {
  if (!leadId && !conversationId) return { conversation: null, messages: [] };
  let q = db.from("conversations").select("id, subject, prospect_email, workspace_id").eq("workspace_id", workspaceId);
  q = conversationId ? q.eq("id", conversationId) : q.eq("lead_id", leadId);
  const { data: conv } = await q.order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  if (!conv || conv.workspace_id !== workspaceId) return { conversation: null, messages: [] };
  const { data: messages } = await db
    .from("conversation_messages")
    .select("direction, body, occurred_at")
    .eq("conversation_id", conv.id)
    .order("occurred_at", { ascending: false })
    .limit(8);
  return {
    conversation: { id: conv.id as string, subject: String(conv.subject ?? ""), prospect_email: String(conv.prospect_email ?? "") },
    messages: (messages ?? []) as AgentContext["messages"],
  };
}

export type DecisionOutput = { pathKey: string; output: Record<string, unknown> };

export async function runAiDecision(
  node: Extract<WorkflowNode, { type: "branch" }>,
  ctx: AgentContext,
  settings: SalesAgentSettings,
): Promise<DecisionOutput> {
  const fallback = { key: node.otherwise.key, label: node.otherwise.label };
  const threshold = clampThreshold(node.ai?.threshold ?? settings.defaultThreshold);
  const fail = (reason: string, ai?: SalesAgentCallMeta): DecisionOutput => ({
    pathKey: fallback.key,
    output: { kind: "ai_decision", pathLabel: fallback.label, outcome: null, confidence: null, reason: "", usedFallback: true, fallbackReason: reason, threshold, ...(ai ? { ai } : {}) },
  });
  if (!settings.enabled) return fail("The AI Sales Agent is turned off for this workspace.");
  const outcomes = decisionOutcomes(node.paths);
  if (outcomes.length < 2) return fail("AI Decision needs at least two outcomes.");
  const { text } = buildAiContext(ctx);
  const { system, prompt } = buildDecisionPrompt(node.ai?.question ?? "", outcomes, text);
  const call = await callSalesAgentModel({ system, prompt, purpose: "decision", workspaceId: ctx.workspaceId });
  if (!call.ok) return fail(call.message, call.meta);
  const routed = routeDecision(parseDecision(call.text, outcomes), node.paths, fallback, threshold);
  return {
    pathKey: routed.pathKey,
    output: {
      kind: "ai_decision",
      pathLabel: routed.pathLabel,
      outcome: routed.outcome,
      confidence: routed.confidence,
      reason: routed.reason,
      usedFallback: routed.usedFallback,
      fallbackReason: routed.fallbackReason,
      threshold,
      ai: call.meta,
    },
  };
}

export type ReplyResult =
  | { ok: true; text: string; mode: "draft" | "auto_send"; forcedDraft: string[]; truncated: boolean; cfg: AiReplyConfig; ai: SalesAgentCallMeta }
  | { ok: false; blocked: boolean; error: string; ai?: SalesAgentCallMeta };

export async function runAiReply(
  config: Record<string, unknown>,
  ctx: AgentContext,
  settings: SalesAgentSettings,
  lastConfidence: number | null,
): Promise<ReplyResult> {
  if (!settings.enabled) return { ok: false, blocked: true, error: "The AI Sales Agent is turned off for this workspace." };
  const cfg = normalizeReplyConfig(config, settings);
  const { text: context, latestInbound } = buildAiContext(ctx);
  const pre = preReplySafety({
    latestInbound,
    leadStatus: (ctx.lead?.["status"] as string) ?? null,
    leadTags: Array.isArray(ctx.lead?.["tags"]) ? (ctx.lead!["tags"] as string[]) : [],
    lastConfidence,
    threshold: settings.defaultThreshold,
  });
  if (pre.block) return { ok: false, blocked: true, error: pre.block };
  const { system, prompt } = buildReplyPrompt(cfg, settings, context);
  const call = await callSalesAgentModel({ system, prompt, purpose: "reply", workspaceId: ctx.workspaceId });
  if (!call.ok) {
    return { ok: false, blocked: false, error: call.kind === "timeout" ? "AI reply timed out." : call.message, ai: call.meta };
  }
  const checked = checkGeneratedReply(call.text, cfg, [cfg.instructions, cfg.goal, cfg.cta, settings.globalInstructions, context].join("\n"));
  if (!checked.ok) return { ok: false, blocked: false, error: checked.error, ai: call.meta };
  const forcedDraft = [...pre.forceDraft, ...checked.forceDraft];
  return {
    ok: true,
    text: checked.text,
    mode: cfg.mode === "auto_send" && forcedDraft.length === 0 ? "auto_send" : "draft",
    forcedDraft,
    truncated: checked.truncated,
    cfg,
    ai: call.meta,
  };
}
