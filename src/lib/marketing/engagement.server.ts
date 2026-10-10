/**
 * Records marketing opens (from the pixel) and replies (from connected
 * mailboxes), each attributed to the exact send — and therefore the template
 * and subject line — that produced it.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { MarketingOpenTarget } from "./engagement-tracking";

type SendRow = {
  id: string;
  email: string;
  subscriber_id: string | null;
  campaign_id: string | null;
  automation_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function meta(row: SendRow, key: string): string | null {
  const v = row.metadata?.[key];
  return typeof v === "string" && v ? v : null;
}

async function loadSend(id: string): Promise<SendRow | null> {
  const { data, error } = await supabaseAdmin
    .from("marketing_email_events")
    .select("id, email, subscriber_id, campaign_id, automation_id, created_at, metadata")
    .eq("id", id)
    .eq("event_type", "marketing_email_sent")
    .maybeSingle();
  if (error) throw new Error("marketing_send_lookup_failed");
  return (data as SendRow | null) ?? null;
}

async function alreadyRecorded(eventType: string, key: string, value: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("marketing_email_events")
    .select("id")
    .eq("event_type", eventType)
    .eq(`metadata->>${key}`, value)
    .limit(1);
  // Unknown duplicate state: do not write a possibly-duplicate open.
  if (error) throw new Error("marketing_duplicate_check_failed");
  return (data ?? []).length > 0;
}

async function refreshStats(campaignId: string | null) {
  if (!campaignId) return;
  const { refreshCampaignStats } = await import("./send-engine.server");
  await refreshCampaignStats(campaignId);
}

/** First human open per send is counted; Apple privacy prefetches are kept separate. */
export async function recordMarketingOpen(args: {
  target: MarketingOpenTarget;
  isPrefetch: boolean;
  source: string | null;
}): Promise<void> {
  const send = await loadSend(args.target.sendEventId);
  if (!send || send.email.trim().toLowerCase() !== args.target.email.trim().toLowerCase()) return;
  // The stored send row, not the token, is the authority for attribution.
  const eventType = args.isPrefetch ? "marketing_email_opened_machine" : "marketing_email_opened";
  if (await alreadyRecorded(eventType, "send_event_id", send.id)) return;
  const { error: insertError } = await supabaseAdmin.from("marketing_email_events").insert({
    event_type: eventType,
    email: send.email,
    subscriber_id: send.subscriber_id,
    campaign_id: send.campaign_id,
    automation_id: send.automation_id,
    metadata: {
      send_event_id: send.id,
      template: meta(send, "template"),
      subject: meta(send, "subject"),
      source: args.source,
    },
  });
  if (insertError) throw new Error("marketing_open_insert_failed");
  if (!args.isPrefetch) await refreshStats(send.campaign_id);
}

function normalizeSubject(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/^\s*((re|fwd?|aw|sv)\s*:\s*)+/i, "")
    .replace(/^\[test\]\s*/i, "")
    .trim()
    .toLowerCase();
}

/**
 * Called for every inbound email a connected mailbox receives. If the sender
 * got a marketing email in the last 30 days whose reply-to was this mailbox,
 * the reply is attributed to that send. Never throws, never alters ingestion.
 */
export async function matchMarketingReply(args: {
  from: string;
  mailboxes: string[];
  subject: string | null;
  messageId: string | null;
  receivedIso: string;
  headers?: Record<string, string> | null;
}): Promise<boolean> {
  const from = args.from.trim().toLowerCase();
  const mailboxes = new Set(args.mailboxes.map((m) => m.trim().toLowerCase()).filter(Boolean));
  if (!from || mailboxes.size === 0) return false;

  const { isAutoReplyHeaders } = await import("@/lib/inbox-model");
  if (isAutoReplyHeaders(args.headers)) return false;

  const since = new Date(new Date(args.receivedIso).getTime() - 30 * 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from("marketing_email_events")
    .select("id, email, subscriber_id, campaign_id, automation_id, created_at, metadata")
    .eq("event_type", "marketing_email_sent")
    .eq("email", from)
    .gte("created_at", since)
    .lte("created_at", args.receivedIso)
    .order("created_at", { ascending: false })
    .limit(20);
  const candidates = ((data ?? []) as SendRow[]).filter((row) => {
    const replyTo = meta(row, "reply_to");
    return replyTo ? mailboxes.has(replyTo.toLowerCase()) : false;
  });
  if (candidates.length === 0) return false;

  const wanted = normalizeSubject(args.subject);
  const send =
    (wanted && candidates.find((row) => normalizeSubject(meta(row, "subject")) === wanted)) ||
    candidates[0]!;

  if (args.messageId && (await alreadyRecorded("marketing_email_replied", "message_id", args.messageId))) {
    return true;
  }
  await supabaseAdmin.from("marketing_email_events").insert({
    event_type: "marketing_email_replied",
    email: send.email,
    subscriber_id: send.subscriber_id,
    campaign_id: send.campaign_id,
    automation_id: send.automation_id,
    metadata: {
      send_event_id: send.id,
      template: meta(send, "template"),
      subject: meta(send, "subject"),
      message_id: args.messageId,
    },
  });
  await refreshStats(send.campaign_id);
  return true;
}
