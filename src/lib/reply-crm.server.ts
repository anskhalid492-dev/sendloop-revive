import { automaticLeadStatus } from "@/lib/reply-classification";
import type { ConversationStatus } from "@/lib/inbox-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncReplyCrm(db: any, args: { workspaceId: string; leadId: string; inboundMessageId: string; campaignId: string | null; conversationId: string; prospect: string; subject: string; receivedIso: string; detected: ConversationStatus | null }) {
  const { data: lead, error: readError } = await db.from("leads").select("id, status, stage_id, archived").eq("workspace_id", args.workspaceId).eq("id", args.leadId).maybeSingle();
  if (readError) throw new Error(`Reply CRM read failed: ${readError.message}`);
  if (!lead || lead.archived) return;
  const { data: stages, error: stageError } = await db.from("crm_stages").select("id, key, position").eq("workspace_id", args.workspaceId).order("position", { ascending: true });
  if (stageError) throw new Error(`Reply CRM stages failed: ${stageError.message}`);
  const target = (stages ?? []).find((s: { key: string }) => s.key === "replied");
  const current = (stages ?? []).find((s: { id: string }) => s.id === lead.stage_id);
  const status = automaticLeadStatus(lead.status, args.detected);
  const advance = target && (!current || ["new", "contacted"].includes(current.key)) && args.detected === "interested" && status === "interested";
  let update = db.from("leads").update({ status, ...(advance ? { stage_id: target.id, crm_stage: "engaged" } : {}) }).eq("workspace_id", args.workspaceId).eq("id", args.leadId).eq("status", lead.status);
  // A simultaneous human pipeline move must win over this automatic update.
  update = lead.stage_id ? update.eq("stage_id", lead.stage_id) : update.is("stage_id", null);
  const { error } = await update;
  if (error) throw new Error(`Reply CRM update failed: ${error.message}`);
  const { error: activityError } = await db.from("lead_activities").upsert({ id: args.inboundMessageId, lead_id: args.leadId, workspace_id: args.workspaceId, campaign_id: args.campaignId, type: "replied", detail: `Reply from ${args.prospect} — ${args.subject}; conversation:${args.conversationId}; message:${args.inboundMessageId}`, created_at: args.receivedIso }, { onConflict: "id", ignoreDuplicates: true });
  if (activityError) throw new Error(`Reply CRM activity failed: ${activityError.message}`);
}