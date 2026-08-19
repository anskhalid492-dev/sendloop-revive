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

/** Finds the outbound send a provider event refers to. */
async function findMessage(providerMessageId: string | null, email: string | null) {
  if (!providerMessageId && !email) return null;
  let query = supabaseAdmin
    .from("campaign_messages")
    .select("id, workspace_id, campaign_id, lead_id, sending_account_id, to_email")
    .order("sent_at", { ascending: false })
    .limit(1);
  query = providerMessageId
    ? query.eq("provider_message_id", providerMessageId)
    : query.eq("to_email", email!);
  const { data } = await query;
  return data?.[0] ?? null;
}

/**
 * Records one engagement event. Returns false when the event cannot be
 * attributed to a workspace (e.g. warmup or unrelated traffic).
 */
export async function recordEngagement(args: Args): Promise<boolean> {
  const email = args.email?.toLowerCase() ?? null;
  const message = await findMessage(args.providerMessageId, email);
  if (!message?.workspace_id) return false;

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
