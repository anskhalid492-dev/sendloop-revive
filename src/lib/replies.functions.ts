/**
 * Reply tracking.
 *
 * A reply is recorded against the queued message it answers, so the campaign
 * queue can show which sends earned a response and the lead's detail panel can
 * list every reply with its date and the email address it came from.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { REPLY_SENTIMENTS, type CampaignReply } from "@/lib/reply-model";

export { REPLY_SENTIMENTS, REPLY_SENTIMENT_LABELS } from "@/lib/reply-model";
export type { CampaignReply, ReplySentiment } from "@/lib/reply-model";

const sel = (s: string): string => s;


const REPLY_COLUMNS =
  "id, campaign_id, message_id, lead_id, from_email, to_email, subject, body, sentiment, received_at";

export const listCampaignReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ campaignId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(100) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("campaign_replies")
      .select(sel(REPLY_COLUMNS))
      .eq("campaign_id", data.campaignId)
      .order("received_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { replies: (rows ?? []) as unknown as CampaignReply[] };
  });

export const recordReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        messageId: z.string().uuid(),
        fromEmail: z.string().trim().email().max(200).optional(),
        subject: z.string().trim().max(300).optional(),
        body: z.string().trim().max(20000).optional(),
        receivedAt: z.string().max(60).optional(),
        sentiment: z.enum(REPLY_SENTIMENTS).default("neutral"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: message, error: messageError } = await context.supabase
      .from("campaign_messages")
      .select(
        sel(
          "id, workspace_id, campaign_id, lead_id, recipient_id, sending_account_id, to_email, subject",
        ),
      )
      .eq("id", data.messageId)
      .maybeSingle();
    if (messageError) throw new Error(messageError.message);
    if (!message) throw new Error("Message not found");

    const m = message as unknown as {
      id: string;
      workspace_id: string;
      campaign_id: string;
      lead_id: string;
      recipient_id: string | null;
      sending_account_id: string | null;
      to_email: string;
      subject: string;
    };

    const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) throw new Error("Invalid reply date");
    const receivedIso = receivedAt.toISOString();
    const fromEmail = (data.fromEmail ?? m.to_email).toLowerCase();

    const { data: inserted, error } = await context.supabase
      .from("campaign_replies")
      .insert({
        workspace_id: m.workspace_id,
        campaign_id: m.campaign_id,
        message_id: m.id,
        lead_id: m.lead_id,
        sending_account_id: m.sending_account_id,
        from_email: fromEmail,
        to_email: m.to_email,
        subject: data.subject ?? `Re: ${m.subject}`,
        body: data.body ?? null,
        sentiment: data.sentiment,
        received_at: receivedIso,
        created_by: context.userId,
      } as never)
      .select(sel(REPLY_COLUMNS))
      .single();
    if (error) throw new Error(error.message);

    // Reflect the reply everywhere it matters: the lead, its timeline, and the
    // campaign recipient (stopping the sequence when the campaign asks for it).
    await context.supabase
      .from("leads")
      .update({ status: "replied", last_activity_at: receivedIso } as never)
      .eq("id", m.lead_id);

    await context.supabase.from("lead_activities").insert({
      lead_id: m.lead_id,
      workspace_id: m.workspace_id,
      campaign_id: m.campaign_id,
      type: "replied",
      detail: `Reply from ${fromEmail}${data.subject ? ` — ${data.subject}` : ""}`,
      created_at: receivedIso,
    } as never);

    const { data: campaign } = await context.supabase
      .from("campaigns")
      .select(sel("stop_on_reply"))
      .eq("id", m.campaign_id)
      .maybeSingle();
    const stop = (campaign as unknown as { stop_on_reply: boolean } | null)?.stop_on_reply ?? true;

    if (m.recipient_id) {
      await context.supabase
        .from("campaign_recipients")
        .update({
          status: "replied",
          ...(stop ? { next_send_at: null } : {}),
        } as never)
        .eq("id", m.recipient_id);
    }

    if (stop) {
      await context.supabase
        .from("campaign_messages")
        .update({ status: "cancelled", cancelled_reason: "recipient_replied" } as never)
        .eq("campaign_id", m.campaign_id)
        .eq("lead_id", m.lead_id)
        .in("status", ["pending", "scheduled"]);
    }

    return { reply: inserted as unknown as CampaignReply, stoppedSequence: stop };
  });

export const deleteReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaign_replies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
