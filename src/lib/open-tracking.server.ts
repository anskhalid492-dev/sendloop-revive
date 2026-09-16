/**
 * Recording an open, server side.
 *
 * One raw row per pixel request goes into `email_open_events` (including Apple
 * prefetches, flagged as such), and the message row keeps its own "first opened
 * at" plus raw open count. Genuine (non-prefetch) opens are additionally
 * mirrored ONCE per message into `email_engagement_events`, which is what
 * analytics and the admin screens already read — so an open rate is always
 * unique opens, never raw pixel hits.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyOpenRequest, type OpenTrackingTarget } from "@/lib/open-tracking";

type CampaignMessageRow = {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  lead_id: string | null;
  sending_account_id: string | null;
  to_email: string | null;
  opened_at: string | null;
  open_count: number | null;
};

type ConversationMessageRow = {
  id: string;
  workspace_id: string;
  to_email: string | null;
  first_opened_at: string | null;
  open_count: number | null;
};

export type RecordOpenResult = {
  recorded: boolean;
  isPrefetch: boolean;
  reason?: string;
};

/**
 * Records one pixel request. Never throws — the endpoint must always be able to
 * return the image, whatever happens here.
 */
export async function recordOpenHit(args: {
  target: OpenTrackingTarget;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<RecordOpenResult> {
  const { target } = args;
  const classification = classifyOpenRequest({
    userAgent: args.userAgent ?? null,
    ip: args.ip ?? null,
  });
  const nowIso = new Date().toISOString();

  try {
    if (target.messageKind === "campaign") {
      const { data } = await supabaseAdmin
        .from("campaign_messages")
        .select(
          "id, workspace_id, campaign_id, lead_id, sending_account_id, to_email, opened_at, open_count",
        )
        .eq("id", target.messageId)
        .maybeSingle();
      const row = (data as CampaignMessageRow | null) ?? null;
      // The token is signed, but the message row is still the authority for
      // which workspace / campaign / lead the open belongs to.
      if (!row || row.workspace_id !== target.workspaceId) {
        return { recorded: false, isPrefetch: classification.isPrefetch, reason: "unknown_message" };
      }

      await supabaseAdmin.from("email_open_events").insert({
        workspace_id: row.workspace_id,
        campaign_id: row.campaign_id,
        lead_id: row.lead_id,
        message_kind: "campaign",
        message_id: row.id,
        recipient_email: row.to_email,
        occurred_at: nowIso,
        user_agent: args.userAgent ? args.userAgent.slice(0, 400) : null,
        client_ip: args.ip ? args.ip.slice(0, 80) : null,
        is_prefetch: classification.isPrefetch,
        prefetch_source: classification.source,
      });

      await supabaseAdmin
        .from("campaign_messages")
        .update({
          open_count: (row.open_count ?? 0) + 1,
          // "First opened" means a real reader. An Apple prefetch never sets it.
          ...(classification.isPrefetch || row.opened_at ? {} : { opened_at: nowIso }),
          last_event_at: nowIso,
        })
        .eq("id", row.id);

      if (!classification.isPrefetch) {
        await mirrorEngagementOpen(row, nowIso);
      }
      return { recorded: true, isPrefetch: classification.isPrefetch };
    }

    const { data } = await supabaseAdmin
      .from("conversation_messages")
      .select("id, workspace_id, to_email, first_opened_at, open_count")
      .eq("id", target.messageId)
      .maybeSingle();
    const row = (data as ConversationMessageRow | null) ?? null;
    if (!row || row.workspace_id !== target.workspaceId) {
      return { recorded: false, isPrefetch: classification.isPrefetch, reason: "unknown_message" };
    }

    await supabaseAdmin.from("email_open_events").insert({
      workspace_id: row.workspace_id,
      campaign_id: target.campaignId ?? null,
      lead_id: target.leadId ?? null,
      message_kind: "conversation",
      message_id: row.id,
      recipient_email: row.to_email,
      occurred_at: nowIso,
      user_agent: args.userAgent ? args.userAgent.slice(0, 400) : null,
      client_ip: args.ip ? args.ip.slice(0, 80) : null,
      is_prefetch: classification.isPrefetch,
      prefetch_source: classification.source,
    });

    await supabaseAdmin
      .from("conversation_messages")
      .update({
        open_count: (row.open_count ?? 0) + 1,
        ...(classification.isPrefetch || row.first_opened_at ? {} : { first_opened_at: nowIso }),
      })
      .eq("id", row.id);

    return { recorded: true, isPrefetch: classification.isPrefetch };
  } catch (error) {
    console.warn("[open-tracking] could not record open", error);
    return { recorded: false, isPrefetch: classification.isPrefetch, reason: "write_failed" };
  }
}

/**
 * One `opened` engagement row per message, so every existing open metric counts
 * distinct opened messages (and therefore distinct leads per step) rather than
 * raw pixel hits.
 */
async function mirrorEngagementOpen(row: CampaignMessageRow, nowIso: string): Promise<void> {
  try {
    await supabaseAdmin.from("email_engagement_events").upsert(
      {
        workspace_id: row.workspace_id,
        campaign_id: row.campaign_id,
        sending_account_id: row.sending_account_id,
        message_id: row.id,
        lead_id: row.lead_id,
        recipient_email: row.to_email,
        event_type: "opened",
        provider: "munchreach_pixel",
        external_id: `open:pixel:${row.id}`,
        occurred_at: nowIso,
      },
      { onConflict: "external_id", ignoreDuplicates: true },
    );
  } catch (error) {
    console.warn("[open-tracking] could not mirror engagement open", error);
  }

  try {
    const { emitAutomationEvent } = await import("@/lib/automation-engine.server");
    await emitAutomationEvent({
      workspaceId: row.workspace_id,
      type: "email.opened",
      leadId: row.lead_id,
      campaignId: row.campaign_id,
      idempotencyKey: `email.opened:open:pixel:${row.id}`,
      payload: { email: row.to_email },
    });
  } catch {
    /* Open recording must never fail because of automations. */
  }
}
