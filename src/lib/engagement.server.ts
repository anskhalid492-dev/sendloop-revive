/**
 * Normalised engagement tracking.
 *
 * Every real provider signal (delivered / opened / clicked / bounced /
 * complained / unsubscribed) is written once into
 * `email_engagement_events`, attributed to the campaign, mailbox and lead it
 * belongs to. Analytics reads only from this table plus the send log, so no
 * metric is ever estimated or synthesised.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EngagementType =
  | "delivered"
  | "opened"
  | "clicked"
  | "replied"
  | "bounced"
  | "complained"
  | "unsubscribed";

type Args = {
  type: EngagementType;
  email: string | null;
  providerMessageId: string | null;
  externalId?: string | null;
  provider?: string | null;
  url?: string | null;
  detail?: string | null;
  occurredAt?: string | null;
};

type CampaignEngagementRow = {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  lead_id: string | null;
  sending_account_id: string | null;
  to_email: string | null;
};

/** Finds the outbound send a provider event refers to. */
async function findMessage(providerMessageId: string | null, email: string | null): Promise<CampaignEngagementRow | null> {
  const { findOutboundMessageByProviderMessageId } = await import("@/lib/outbound-message-resolver.server");
  const resolved = await findOutboundMessageByProviderMessageId({
    providerMessageId,
    email,
    requireType: "campaign",
  });
  return (resolved?.row as CampaignEngagementRow | null | undefined) ?? null;
}

/**
 * Records one engagement event. Returns false when the event cannot be
 * attributed to a workspace (e.g. warmup or unrelated traffic).
 */
export async function recordEngagement(args: Args): Promise<boolean> {
  const email = args.email?.toLowerCase() ?? null;
  if (!args.providerMessageId) {
    // Without a provider id we can only match by address; warmup network
    // traffic must never be folded into campaign engagement.
    const { isWarmupPeerAddress } = await import("@/lib/message-classification.server");
    if (await isWarmupPeerAddress(email)) return false;
  }
  const message = await findMessage(args.providerMessageId, email);
  if (!message?.workspace_id) return false;

  // Open tracking is a per-campaign switch. With it off we never store an
  // open event, so analytics can honestly report "Disabled" instead of 0%.
  if (args.type === "opened" && message.campaign_id) {
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("open_tracking")
      .eq("id", message.campaign_id)
      .maybeSingle();
    if (campaign && campaign.open_tracking === false) return false;
  }

  const externalId =
    args.externalId ??
    `${args.type}:${args.providerMessageId ?? message.id}:${args.url ?? ""}`;

  const { error } = await supabaseAdmin
    .from("email_engagement_events")
    .upsert(
      {
        workspace_id: message.workspace_id,
        campaign_id: message.campaign_id,
        sending_account_id: message.sending_account_id,
        message_id: message.id,
        lead_id: message.lead_id,
        recipient_email: email ?? message.to_email,
        event_type: args.type,
        provider: args.provider ?? "resend",
        provider_message_id: args.providerMessageId,
        external_id: externalId.slice(0, 400),
        url: args.url ?? null,
        detail: args.detail ?? null,
        occurred_at: args.occurredAt ?? new Date().toISOString(),
      },
      { onConflict: "external_id", ignoreDuplicates: true },
    );

  if (error) return false;

  // Delivery-side automation triggers. Only real provider events reach here.
  try {
    const { emitAutomationEvent } = await import("@/lib/automation-engine.server");
    const type =
      args.type === "delivered"
        ? "email.delivered"
        : args.type === "replied"
          ? "lead.replied"
          : args.type === "opened"
          ? "email.opened"
          : args.type === "clicked"
            ? "email.clicked"
            : args.type === "bounced"
              ? "email.bounced"
              : args.type === "unsubscribed"
                ? "lead.unsubscribed"
                : null;
    if (type) {
      await emitAutomationEvent({
        workspaceId: message.workspace_id,
        type,
        leadId: message.lead_id,
        campaignId: message.campaign_id,
        idempotencyKey: `${type}:${externalId}`.slice(0, 400),
        payload: { email: email ?? message.to_email, url: args.url ?? null },
      });
    }
  } catch {
    /* engagement recording must never fail because of automations */
  }

  return true;
}
