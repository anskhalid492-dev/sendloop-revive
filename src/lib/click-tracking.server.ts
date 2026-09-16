/**
 * Recording a click, server side.
 *
 * One raw row per click goes into `email_click_events`, and the message row
 * keeps its own `clicked_at` (first click). Clicks are additionally mirrored
 * once per message into `email_engagement_events` — the table analytics and the
 * admin screens already read — so a click RATE is always unique clickers, never
 * raw redirect hits.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ClickTrackingHit } from "@/lib/click-tracking";

export type RecordClickResult = { recorded: boolean; reason?: string };

/** Never throws: the reader must always be forwarded to the destination. */
export async function recordClickHit(args: {
  hit: ClickTrackingHit;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<RecordClickResult> {
  const { hit } = args;
  const nowIso = new Date().toISOString();
  const userAgent = args.userAgent ? args.userAgent.slice(0, 400) : null;
  const clientIp = args.ip ? args.ip.slice(0, 80) : null;

  try {
    if (hit.messageKind === "campaign") {
      const { data } = await supabaseAdmin
        .from("campaign_messages")
        .select(
          "id, workspace_id, campaign_id, lead_id, sending_account_id, to_email, clicked_at",
        )
        .eq("id", hit.messageId)
        .maybeSingle();
      const row = (data as
        | {
            id: string;
            workspace_id: string;
            campaign_id: string | null;
            lead_id: string | null;
            sending_account_id: string | null;
            to_email: string | null;
            clicked_at: string | null;
          }
        | null) ?? null;
      // The token is signed, but the stored message row stays the authority for
      // which workspace / campaign / lead this click belongs to.
      if (!row || row.workspace_id !== hit.workspaceId) {
        return { recorded: false, reason: "unknown_message" };
      }

      await supabaseAdmin.from("email_click_events").insert({
        workspace_id: row.workspace_id,
        campaign_id: row.campaign_id,
        lead_id: row.lead_id,
        message_kind: "campaign",
        message_id: row.id,
        recipient_email: row.to_email,
        url: hit.url.slice(0, 2000),
        occurred_at: nowIso,
        user_agent: userAgent,
        client_ip: clientIp,
      });

      await supabaseAdmin
        .from("campaign_messages")
        .update({
          ...(row.clicked_at ? {} : { clicked_at: nowIso }),
          last_event_at: nowIso,
        })
        .eq("id", row.id);

      await mirrorEngagementClick(row, hit.url, nowIso);
      return { recorded: true };
    }

    const { data } = await supabaseAdmin
      .from("conversation_messages")
      .select("id, workspace_id, to_email, clicked_at")
      .eq("id", hit.messageId)
      .maybeSingle();
    const row = (data as
      | { id: string; workspace_id: string; to_email: string | null; clicked_at: string | null }
      | null) ?? null;
    if (!row || row.workspace_id !== hit.workspaceId) {
      return { recorded: false, reason: "unknown_message" };
    }

    await supabaseAdmin.from("email_click_events").insert({
      workspace_id: row.workspace_id,
      campaign_id: hit.campaignId ?? null,
      lead_id: hit.leadId ?? null,
      message_kind: "conversation",
      message_id: row.id,
      recipient_email: row.to_email,
      url: hit.url.slice(0, 2000),
      occurred_at: nowIso,
      user_agent: userAgent,
      client_ip: clientIp,
    });

    await supabaseAdmin
      .from("conversation_messages")
      .update(row.clicked_at ? {} : { clicked_at: nowIso })
      .eq("id", row.id);

    return { recorded: true };
  } catch (error) {
    console.warn("[click-tracking] could not record click", error);
    return { recorded: false, reason: "write_failed" };
  }
}

async function mirrorEngagementClick(
  row: {
    id: string;
    workspace_id: string;
    campaign_id: string | null;
    lead_id: string | null;
    sending_account_id: string | null;
    to_email: string | null;
  },
  url: string,
  nowIso: string,
): Promise<void> {
  try {
    await supabaseAdmin.from("email_engagement_events").upsert(
      {
        workspace_id: row.workspace_id,
        campaign_id: row.campaign_id,
        sending_account_id: row.sending_account_id,
        message_id: row.id,
        lead_id: row.lead_id,
        recipient_email: row.to_email,
        event_type: "clicked",
        provider: "munchreach_click",
        external_id: `click:link:${row.id}`,
        url: url.slice(0, 2000),
        occurred_at: nowIso,
      },
      { onConflict: "external_id", ignoreDuplicates: true },
    );
  } catch (error) {
    console.warn("[click-tracking] could not mirror engagement click", error);
  }

  try {
    const { emitAutomationEvent } = await import("@/lib/automation-engine.server");
    await emitAutomationEvent({
      workspaceId: row.workspace_id,
      type: "email.clicked",
      leadId: row.lead_id,
      campaignId: row.campaign_id,
      idempotencyKey: `email.clicked:click:link:${row.id}`,
      payload: { email: row.to_email, url },
    });
  } catch {
    /* Click recording must never fail because of automations. */
  }
}
