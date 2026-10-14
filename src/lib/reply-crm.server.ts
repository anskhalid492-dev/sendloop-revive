import { automaticLeadStatus } from "@/lib/reply-classification";
import type { ConversationStatus } from "@/lib/inbox-model";
import { autoStageForReply, canAutoAdvance, LEGACY_CRM_STAGE_FOR_KEY, type StageKey } from "@/lib/lead-stage-map";

/** Deterministic UUID for one reply's stage-change event (replays dedupe). */
async function stageEventId(inboundMessageId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`reply-stage:${inboundMessageId}`))).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Moves the replying lead through the pipeline from the reply's intent:
 * positive -> Interested, meeting confirmed -> Meeting Booked, any other real
 * reply -> Replied. Forward-only; Won, Lost and custom stages are never touched,
 * and a concurrent human move wins (conditional update on the read values).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncReplyCrm(db: any, args: { workspaceId: string; leadId: string; inboundMessageId: string; campaignId: string | null; conversationId: string; prospect: string; subject: string; receivedIso: string; detected: ConversationStatus | null }) {
  const { data: lead, error: readError } = await db.from("leads").select("id, status, stage_id, archived").eq("workspace_id", args.workspaceId).eq("id", args.leadId).maybeSingle();
  if (readError) throw new Error(`Reply CRM read failed: ${readError.message}`);
  if (!lead || lead.archived) return;
  const { data: stages, error: stageError } = await db.from("crm_stages").select("id, key, name, position").eq("workspace_id", args.workspaceId).order("position", { ascending: true });
  if (stageError) throw new Error(`Reply CRM stages failed: ${stageError.message}`);
  const list = (stages ?? []) as Array<{ id: string; key: string; name?: string }>;
  const current = list.find((s) => s.id === lead.stage_id) ?? null;
  // A lead pointing at an unknown stage id is left alone (never guessed).
  const currentKey = lead.stage_id ? (current?.key ?? "__unknown__") : null;

  const wanted = autoStageForReply(args.detected);
  // Workspaces whose pipeline has no Interested stage yet fall back to Replied.
  const resolvedKey: StageKey | null =
    wanted && !list.some((s) => s.key === wanted) && wanted === "interested" ? "replied" : wanted;
  const target = resolvedKey ? list.find((s) => s.key === resolvedKey) ?? null : null;
  const advance = Boolean(target) && canAutoAdvance(currentKey, resolvedKey as StageKey);

  const status = automaticLeadStatus(lead.status, args.detected);
  let update = db.from("leads").update({ status, ...(advance && target ? { stage_id: target.id, crm_stage: LEGACY_CRM_STAGE_FOR_KEY[resolvedKey as StageKey] } : {}) }).eq("workspace_id", args.workspaceId).eq("id", args.leadId).eq("status", lead.status);
  // A simultaneous human pipeline move must win over this automatic update.
  update = lead.stage_id ? update.eq("stage_id", lead.stage_id) : update.is("stage_id", null);
  const { error } = await update;
  if (error) throw new Error(`Reply CRM update failed: ${error.message}`);
  const { error: activityError } = await db.from("lead_activities").upsert({ id: args.inboundMessageId, lead_id: args.leadId, workspace_id: args.workspaceId, campaign_id: args.campaignId, type: "replied", detail: `Reply from ${args.prospect} — ${args.subject}; conversation:${args.conversationId}; message:${args.inboundMessageId}`, created_at: args.receivedIso }, { onConflict: "id", ignoreDuplicates: true });
  if (activityError) throw new Error(`Reply CRM activity failed: ${activityError.message}`);

  if (advance && target) {
    // One stage-change event per reply: keyed on the inbound message, so a
    // replayed reply can never log the move twice.
    const fromName = current?.name ?? "no stage";
    const { error: stageEventError } = await db.from("lead_activities").upsert({ id: await stageEventId(args.inboundMessageId), lead_id: args.leadId, workspace_id: args.workspaceId, campaign_id: args.campaignId, type: "stage_changed", detail: `CRM stage moved from ${fromName} to ${target.name ?? resolvedKey} (via reply)`, created_at: args.receivedIso }, { onConflict: "id", ignoreDuplicates: true });
    if (stageEventError) throw new Error(`Reply CRM stage event failed: ${stageEventError.message}`);
  }
}
