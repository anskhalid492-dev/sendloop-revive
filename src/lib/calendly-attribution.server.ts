/**
 * Turns a verified Calendly webhook into MunchReach data.
 *
 * Attribution reuses the existing model rather than adding a parallel one:
 * the invitee email is matched to a lead, the lead's most recent *sent*
 * campaign message gives the campaign and the exact sequence step, and the
 * result is written as `leads.status = meeting_booked` plus a `lead_activities`
 * row — the same pair that dashboard "Meetings", campaign meeting counts and
 * the CRM already read. The existing `meeting.booked` automation trigger is
 * then emitted, so no analytics or campaign logic changes.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CalendlyMeeting = {
  kind: "booked" | "canceled";
  inviteeEmail: string;
  inviteeName: string | null;
  eventName: string | null;
  startTime: string | null;
  eventUri: string | null;
  reschedule: boolean;
};

export type AttributionResult = {
  matched: boolean;
  leadId: string | null;
  campaignId: string | null;
  stepOrder: number | null;
  message: string;
};

type LastSend = { campaign_id: string; step_order: number; sent_at: string | null };

async function lastSendForLead(workspaceId: string, leadId: string): Promise<LastSend | null> {
  const { data } = await supabaseAdmin
    .from("campaign_messages")
    .select("campaign_id, step_order, sent_at")
    .eq("workspace_id", workspaceId)
    .eq("lead_id", leadId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as LastSend | undefined) ?? null;
}

/** Forward-only stage move, mirroring how replies advance a contact. */
async function advanceStage(workspaceId: string, leadId: string, key: string): Promise<void> {
  const { data: stages } = await supabaseAdmin
    .from("crm_stages")
    .select("id, key, position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });
  const rows = (stages ?? []) as Array<{ id: string; key: string; position: number }>;
  const target = rows.find((s) => s.key === key);
  if (!target) return;
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("stage_id")
    .eq("id", leadId)
    .maybeSingle();
  const current = rows.find((s) => s.id === (lead as { stage_id: string | null } | null)?.stage_id);
  if (current && current.position >= target.position) return;
  await supabaseAdmin.from("leads").update({ stage_id: target.id }).eq("id", leadId);
}

export async function applyCalendlyMeeting(
  workspaceId: string,
  meeting: CalendlyMeeting,
): Promise<AttributionResult> {
  const email = meeting.inviteeEmail.trim().toLowerCase();
  const { data: leadRow } = await supabaseAdmin
    .from("leads")
    .select("id, status")
    .eq("workspace_id", workspaceId)
    .eq("email", email)
    .maybeSingle();
  const lead = leadRow as { id: string; status: string | null } | null;

  if (!lead) {
    return {
      matched: false,
      leadId: null,
      campaignId: null,
      stepOrder: null,
      message: `No contact in this workspace matches ${email}.`,
    };
  }

  const send = await lastSendForLead(workspaceId, lead.id);
  const campaignId = send?.campaign_id ?? null;
  const stepOrder = send?.step_order ?? null;
  const nowIso = new Date().toISOString();
  const label = meeting.eventName ? ` — ${meeting.eventName}` : "";
  const when = meeting.startTime ? ` on ${meeting.startTime}` : "";

  if (meeting.kind === "canceled") {
    if (lead.status === "meeting_booked") {
      await supabaseAdmin
        .from("leads")
        .update({ status: "interested", last_activity_at: nowIso })
        .eq("id", lead.id);
    }
    await supabaseAdmin.from("lead_activities").insert({
      lead_id: lead.id,
      workspace_id: workspaceId,
      campaign_id: campaignId,
      type: "meeting_canceled",
      detail: `Calendly meeting ${meeting.reschedule ? "rescheduled" : "cancelled"}${label}${when}`.slice(0, 500),
    });
    return {
      matched: true,
      leadId: lead.id,
      campaignId,
      stepOrder,
      message: `Meeting ${meeting.reschedule ? "rescheduled" : "cancelled"} for ${email}.`,
    };
  }

  await supabaseAdmin
    .from("leads")
    .update({ status: "meeting_booked", last_activity_at: nowIso })
    .eq("id", lead.id);
  await advanceStage(workspaceId, lead.id, "meeting");

  await supabaseAdmin.from("lead_activities").insert({
    lead_id: lead.id,
    workspace_id: workspaceId,
    campaign_id: campaignId,
    type: "meeting_booked",
    detail: `Calendly booking${label}${when}${
      stepOrder !== null ? ` (attributed to step ${stepOrder})` : ""
    }`.slice(0, 500),
  });

  if (campaignId) {
    await supabaseAdmin
      .from("campaign_recipients")
      .update({ status: "replied", next_send_at: null })
      .eq("campaign_id", campaignId)
      .eq("lead_id", lead.id)
      .eq("workspace_id", workspaceId);
  }

  const { emitAutomationEvent } = await import("@/lib/automation-engine.server");
  await emitAutomationEvent({
    workspaceId,
    type: "meeting.booked",
    idempotencyKey: `calendly:${meeting.eventUri ?? email}:${meeting.startTime ?? nowIso}`,
    leadId: lead.id,
    campaignId,
    payload: {
      source: "calendly",
      email,
      name: meeting.inviteeName,
      event: meeting.eventName,
      start_time: meeting.startTime,
      step_order: stepOrder,
    },
  });

  const { emitIntegrationEvent } = await import("@/lib/integrations.server");
  await emitIntegrationEvent(
    workspaceId,
    "meeting.booked",
    {
      lead: { email, first_name: meeting.inviteeName },
      campaign_id: campaignId,
      step_order: stepOrder,
      event: meeting.eventName,
      start_time: meeting.startTime,
    },
    `calendly:${meeting.eventUri ?? email}`,
  ).catch(() => undefined);

  return {
    matched: true,
    leadId: lead.id,
    campaignId,
    stepOrder,
    message: `Meeting booked by ${email}${
      campaignId ? ` attributed to campaign step ${stepOrder ?? "?"}` : " (no campaign send found)"
    }.`,
  };
}
