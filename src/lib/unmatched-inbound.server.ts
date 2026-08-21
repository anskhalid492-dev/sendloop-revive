/**
 * Unmatched inbox.
 *
 * Replies that cannot be attributed to any workspace are parked here instead of
 * being dropped. Once the mailbox or contact exists, an admin can replay them
 * through the normal ingestion path — which is idempotent, so a replay can
 * never create a second conversation or message.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type UnmatchedInbound = {
  id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  body: string | null;
  message_id: string | null;
  reason: string | null;
  received_at: string;
  resolved_conversation_id: string | null;
  resolved_at: string | null;
};

export async function listUnmatchedInbound(limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("unmatched_inbound_emails")
    .select(
      "id, from_email, from_name, to_email, subject, body, message_id, reason, received_at, resolved_conversation_id, resolved_at",
    )
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as UnmatchedInbound[] };
}

/** Replays one parked email through inbound ingestion. */
export async function retryUnmatchedInbound(id: string) {
  const { data, error } = await supabaseAdmin
    .from("unmatched_inbound_emails")
    .select("id, from_email, from_name, to_email, subject, body, html, message_id, in_reply_to, reference_ids, received_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Email not found");

  const { ingestInboundEmail } = await import("@/lib/inbox.server");
  const result = await ingestInboundEmail({
    from: data.from_email,
    fromName: data.from_name,
    to: data.to_email,
    subject: data.subject,
    text: data.body,
    html: data.html,
    messageId: data.message_id,
    inReplyTo: data.in_reply_to,
    references: data.reference_ids ?? [],
    receivedAt: data.received_at,
  });

  if (result.status !== "unmatched") {
    await supabaseAdmin
      .from("unmatched_inbound_emails")
      .update({
        resolved_conversation_id: result.conversationId ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id);
  }
  return result;
}
