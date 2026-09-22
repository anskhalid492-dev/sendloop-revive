/**
 * The single lead status / CRM stage transition service.
 *
 * Every path that changes where a contact sits — Unified Inbox, Leads, CRM
 * board drag and drop, contact drawer, public API, automations — calls
 * `applyLeadTransition`, so the lead status, the CRM pipeline stage, the legacy
 * `crm_stage` mirror, the activity timeline, reply sentiment and automation
 * events can never disagree with each other.
 *
 * The caller passes its own RLS-scoped Supabase client, so workspace isolation
 * is enforced by the database on every read and write. Failures throw with a
 * useful message instead of being swallowed.
 */
import {
  LEAD_STATUS_FOR_STAGE_KEY,
  LEGACY_CRM_STAGE_FOR_KEY,
  STAGE_KEY_FOR_LEAD_STATUS,
  type StageKey,
} from "@/lib/lead-stage-map";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type TransitionSource =
  | "inbox"
  | "crm_board"
  | "crm_drawer"
  | "leads"
  | "api"
  | "automation";

export type TransitionInput = {
  leadId: string;
  /** Lead status to move to. Omit to derive it from the stage. */
  status?: string | undefined;
  /** Explicit `crm_stages.id`. Wins over `stageKey`. */
  stageId?: string | undefined;
  /** Canonical stage key (`won`, `lost`, …). Resolved inside the workspace. */
  stageKey?: StageKey | undefined;
  actorId?: string | null | undefined;
  source: TransitionSource;
  /** Extra context appended to the timeline entry (e.g. loss reason). */
  reason?: string | null | undefined;
};

export type TransitionResult = {
  ok: true;
  changed: boolean;
  leadId: string;
  workspaceId: string;
  status: string;
  stageId: string | null;
  stageKey: string | null;
  stageName: string | null;
};

type StageRow = {
  id: string;
  key: string;
  name: string;
  workspace_id: string;
  is_won: boolean;
  is_lost: boolean;
};

const SOURCE_LABEL: Record<TransitionSource, string> = {
  inbox: "Unified Inbox",
  crm_board: "CRM board",
  crm_drawer: "contact drawer",
  leads: "Leads",
  api: "API",
  automation: "automation",
};

export async function applyLeadTransition(
  client: Client,
  input: TransitionInput,
): Promise<TransitionResult> {
  const { data: lead, error: leadError } = await client
    .from("leads")
    .select("id, workspace_id, status, stage_id, crm_stage")
    .eq("id", input.leadId)
    .maybeSingle();
  if (leadError) throw new Error(`Couldn't load this contact: ${leadError.message}`);
  if (!lead) throw new Error("That contact no longer exists in this workspace");

  const workspaceId = lead.workspace_id as string;

  // Resolve the target stage inside this workspace only.
  let stages: StageRow[] | null = null;
  const loadStages = async (): Promise<StageRow[]> => {
    if (stages) return stages;
    // Idempotent: guarantees the default pipeline exists before we resolve keys.
    try {
      await client.rpc("ensure_crm_stages", { _workspace_id: workspaceId });
    } catch {
      /* stages may already exist; resolution below is the real check */
    }
    const { data, error } = await client
      .from("crm_stages")
      .select("id, key, name, workspace_id, is_won, is_lost")
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(`Couldn't load the pipeline stages: ${error.message}`);
    stages = (data ?? []) as StageRow[];
    return stages;
  };

  let targetStage: StageRow | null = null;
  const wantedKey: StageKey | undefined =
    input.stageKey ?? (input.status ? STAGE_KEY_FOR_LEAD_STATUS[input.status] : undefined);

  if (input.stageId) {
    const all = await loadStages();
    targetStage = all.find((s) => s.id === input.stageId) ?? null;
    if (!targetStage) throw new Error("That stage belongs to another workspace");
  } else if (wantedKey) {
    const all = await loadStages();
    targetStage = all.find((s) => s.key === wantedKey) ?? null;
  }

  const nextStatus =
    input.status ??
    (targetStage ? LEAD_STATUS_FOR_STAGE_KEY[targetStage.key as StageKey] : undefined) ??
    (lead.status as string);

  const previousStatus = lead.status as string;
  const previousStageId = (lead.stage_id as string | null) ?? null;
  const statusChanged = nextStatus !== previousStatus;
  const stageChanged = Boolean(targetStage) && targetStage!.id !== previousStageId;

  if (!statusChanged && !stageChanged) {
    const currentStage = targetStage ?? (await currentStageOf(client, workspaceId, previousStageId));
    return {
      ok: true,
      changed: false,
      leadId: input.leadId,
      workspaceId,
      status: previousStatus,
      stageId: previousStageId,
      stageKey: currentStage?.key ?? null,
      stageName: currentStage?.name ?? null,
    };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { last_activity_at: now };
  if (statusChanged) patch["status"] = nextStatus;
  if (stageChanged && targetStage) {
    patch["stage_id"] = targetStage.id;
    const legacy = LEGACY_CRM_STAGE_FOR_KEY[targetStage.key as StageKey];
    if (legacy) patch["crm_stage"] = legacy;
  }

  const { data: updated, error: updateError } = await client
    .from("leads")
    .update(patch as never)
    .eq("id", input.leadId)
    .select("id, status, stage_id")
    .maybeSingle();
  if (updateError) throw new Error(`Couldn't update this contact: ${updateError.message}`);
  if (!updated) {
    // RLS rejected the write (contact is not in a workspace this user belongs to).
    throw new Error("You don't have permission to update this contact");
  }

  const via = SOURCE_LABEL[input.source];
  const suffix = input.reason ? ` — ${input.reason}` : "";

  if (statusChanged) {
    await insertActivity(client, {
      leadId: input.leadId,
      workspaceId,
      actorId: input.actorId ?? null,
      type: "status_changed",
      detail: `Lead status changed from ${previousStatus} to ${nextStatus} (via ${via})${suffix}`,
      createdAt: now,
    });
  }
  if (stageChanged && targetStage) {
    const fromName = (await currentStageOf(client, workspaceId, previousStageId))?.name ?? "no stage";
    await insertActivity(client, {
      leadId: input.leadId,
      workspaceId,
      actorId: input.actorId ?? null,
      type: "stage_changed",
      detail: `CRM stage moved from ${fromName} to ${targetStage.name} (via ${via})${suffix}`,
      createdAt: now,
    });
  }

  if (statusChanged) {
    const { syncLeadReplySentiment } = await import("@/lib/positive-reply-sentiment.server");
    await syncLeadReplySentiment(client, input.leadId, nextStatus);
  }

  // Won / Lost is a closed outcome: stop pending outbound follow-ups while
  // keeping every conversation, message and campaign record intact.
  if (stageChanged && targetStage && (targetStage.is_won || targetStage.is_lost)) {
    await stopPendingFollowups(client, input.leadId);
  }

  // One automation event per real change, never per UI update.
  if (input.source !== "automation") {
    try {
      const { emitAutomationEvent } = await import("@/lib/automation-engine.server");
      if (statusChanged) {
        await emitAutomationEvent({
          workspaceId,
          type: "lead.status_changed",
          leadId: input.leadId,
          idempotencyKey: `lead.status_changed:${input.leadId}:${nextStatus}:${now}`,
          payload: { from: previousStatus, to: nextStatus, source: input.source },
        });
      }
      if (stageChanged && targetStage) {
        await emitAutomationEvent({
          workspaceId,
          type: "crm.stage_changed",
          leadId: input.leadId,
          idempotencyKey: `crm.stage_changed:${input.leadId}:${targetStage.id}:${now}`,
          payload: {
            stageId: targetStage.id,
            stageName: targetStage.name,
            stageKey: targetStage.key,
            source: input.source,
          },
        });
      }
    } catch (error) {
      console.error("[lead-transition] automation event failed", error);
    }
  }

  return {
    ok: true,
    changed: true,
    leadId: input.leadId,
    workspaceId,
    status: (updated.status as string) ?? nextStatus,
    stageId: (updated.stage_id as string | null) ?? null,
    stageKey: targetStage?.key ?? null,
    stageName: targetStage?.name ?? null,
  };
}

async function currentStageOf(
  client: Client,
  workspaceId: string,
  stageId: string | null,
): Promise<StageRow | null> {
  if (!stageId) return null;
  const { data } = await client
    .from("crm_stages")
    .select("id, key, name, workspace_id, is_won, is_lost")
    .eq("id", stageId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return (data as StageRow | null) ?? null;
}

/** Writes the timeline entry, falling back when `actor_id` is not deployed yet. */
async function insertActivity(
  client: Client,
  row: {
    leadId: string;
    workspaceId: string;
    actorId: string | null;
    type: string;
    detail: string;
    createdAt: string;
  },
): Promise<void> {
  const base = {
    lead_id: row.leadId,
    workspace_id: row.workspaceId,
    type: row.type,
    detail: row.detail,
    created_at: row.createdAt,
  };
  const { error } = await client.from("lead_activities").insert({ ...base, actor_id: row.actorId });
  if (!error) return;
  const { error: retry } = await client.from("lead_activities").insert(base);
  if (retry) console.error("[lead-transition] activity insert failed", retry.message);
}

/** Cancels queued follow-ups for a closed contact; history is never deleted. */
async function stopPendingFollowups(client: Client, leadId: string): Promise<void> {
  const { error: messageError } = await client
    .from("campaign_messages")
    .update({ status: "cancelled" })
    .eq("lead_id", leadId)
    .in("status", ["pending", "scheduled"]);
  if (messageError) console.error("[lead-transition] stop messages failed", messageError.message);

  const { error: recipientError } = await client
    .from("campaign_recipients")
    .update({ status: "stopped", next_send_at: null })
    .eq("lead_id", leadId)
    .in("status", ["pending", "in_progress"]);
  if (recipientError)
    console.error("[lead-transition] stop recipients failed", recipientError.message);
}

/**
 * Bulk variant used by the Leads bulk "set status" action.
 *
 * Thousands of contacts cannot each afford a round trip, so the stage is
 * resolved once for the workspace and applied with the status in the same
 * chunked update. Timeline entries are written in the same chunks.
 */
export async function resolveStageForStatus(
  client: Client,
  workspaceId: string,
  status: string,
): Promise<{ id: string; key: string; name: string } | null> {
  const key = STAGE_KEY_FOR_LEAD_STATUS[status];
  if (!key) return null;
  try {
    await client.rpc("ensure_crm_stages", { _workspace_id: workspaceId });
  } catch {
    /* stages may already exist */
  }
  const { data } = await client
    .from("crm_stages")
    .select("id, key, name")
    .eq("workspace_id", workspaceId)
    .eq("key", key)
    .maybeSingle();
  return (data as { id: string; key: string; name: string } | null) ?? null;
}

export function stagePatchForStatus(
  status: string,
  stage: { id: string; key: string } | null,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { status, last_activity_at: new Date().toISOString() };
  if (stage) {
    patch["stage_id"] = stage.id;
    const legacy = LEGACY_CRM_STAGE_FOR_KEY[stage.key as StageKey];
    if (legacy) patch["crm_stage"] = legacy;
  }
  return patch;
}
