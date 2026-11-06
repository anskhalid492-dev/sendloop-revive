/**
 * Per-message delivery state.
 *
 * Every provider signal (accepted, delivered, delayed, bounced, failed,
 * opened, clicked, complained, unsubscribed, replied) is folded into the
 * `campaign_messages` row it belongs to. Two rules keep the numbers honest:
 *
 * - Out-of-order safe: a weaker signal never overwrites a stronger one, so a
 *   late "delivered" webhook cannot hide a bounce that already landed.
 * - Idempotent: applying the same event twice produces the same row, so
 *   webhook retries and the reconciliation runner cannot double-count.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DeliveryState =
  | "queued"
  | "sent"
  | "delayed"
  | "delivered"
  | "opened"
  | "clicked"
  | "replied"
  | "unsubscribed"
  | "complained"
  | "bounced"
  | "failed";

/**
 * Terminal negative outcomes rank highest: once a message bounced or failed it
 * stays that way, whatever arrives afterwards.
 */
const RANK: Record<DeliveryState, number> = {
  queued: 0,
  sent: 1,
  delayed: 2,
  delivered: 3,
  opened: 4,
  clicked: 5,
  replied: 6,
  unsubscribed: 7,
  complained: 8,
  bounced: 9,
  failed: 9,
};

const TIMESTAMP_COLUMN: Partial<Record<DeliveryState, string>> = {
  delivered: "delivered_at",
  delayed: "delayed_at",
  bounced: "bounced_at",
  complained: "complained_at",
  unsubscribed: "unsubscribed_at",
  opened: "opened_at",
  clicked: "clicked_at",
  replied: "replied_at",
  failed: "failed_at",
};

export type DeliveryStateRow = {
  id: string;
  delivery_status: string | null;
  status: string | null;
};

/**
 * Applies one delivery signal to a message row. Returns the resulting state.
 * `occurredAt` is the provider's own event time when available.
 */
export async function applyDeliveryState(args: {
  message: DeliveryStateRow;
  state: DeliveryState;
  detail?: string | null;
  occurredAt?: string | null;
  source?: "webhook" | "reconcile";
}): Promise<DeliveryState> {
  const at = args.occurredAt ?? new Date().toISOString();
  // Re-read the authoritative row, never apply a rank from a stale caller snapshot.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: fresh, error: readError } = await supabaseAdmin.from("campaign_messages")
      .select("*").eq("id", args.message.id).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!fresh) throw new Error("Campaign message not found");
    const row = fresh as unknown as Record<string, unknown>;
    const current = (row["delivery_status"] ?? "queued") as DeliveryState;
    // Bounce wins even when an older definitive failure shares its rank.
    const advances = RANK[args.state] > (RANK[current] ?? 0) || (args.state === "bounced" && current === "failed");
    const patch: Record<string, unknown> = {};
    const previousEvent = row["last_event_at"] as string | null;
    if (!previousEvent || at > previousEvent) patch["last_event_at"] = at;
    const column = TIMESTAMP_COLUMN[args.state];
    const previousAt = column ? row[column] as string | null : null;
    if (column && (!previousAt || at < previousAt)) patch[column] = at;
    if (args.source === "reconcile") patch["reconciled_at"] = new Date().toISOString();
    if (advances) {
      patch["delivery_status"] = args.state;
      if (args.detail) patch["delivery_detail"] = args.detail.slice(0, 500);
      if (args.state === "bounced" || args.state === "failed") {
        patch["status"] = "failed";
        if (args.detail) patch["last_error"] = args.detail.slice(0, 500);
      }
    }
    if (args.state === "bounced" && args.detail && !row["bounce_reason"]) patch["bounce_reason"] = args.detail.slice(0, 500);
    if (!Object.keys(patch).length) return current;
    let write = supabaseAdmin.from("campaign_messages").update(patch as never).eq("id", args.message.id);
    write = row["updated_at"] ? write.eq("updated_at", String(row["updated_at"])) : write.is("updated_at", null);
    // Guard the actual compared fields too: timestamp precision is not a version.
    for (const field of ["delivery_status", "status", "last_event_at", "delivered_at", "bounced_at", "failed_at", ...(column ? [column] : [])]) {
      write = row[field] == null ? write.is(field, null) : write.eq(field, String(row[field]));
    }
    const { data: written, error } = await write.select("id");
    if (error) throw new Error(error.message);
    if (!written?.length) continue; // Lost CAS: re-read and re-rank.
    // Mirror evidence without letting a weaker event overwrite an inbox outcome.
    const { data: inboxRows, error: inboxReadError } = await supabaseAdmin.from("conversation_messages")
      .select("id,delivery_status").eq("campaign_message_id", args.message.id);
    if (inboxReadError) throw new Error(inboxReadError.message);
    for (const inbox of inboxRows ?? []) {
      const inboxCurrent = ((inbox as { delivery_status?: string | null }).delivery_status ?? "queued") as DeliveryState;
      const inboxPatch: Record<string, unknown> = {};
      if (column) inboxPatch[column] = previousAt && previousAt < at ? previousAt : at;
      if (RANK[args.state] > (RANK[inboxCurrent] ?? 0) || (args.state === "bounced" && inboxCurrent === "failed")) {
        inboxPatch["delivery_status"] = args.state;
        if (args.detail) inboxPatch["delivery_detail"] = args.detail.slice(0, 500);
      }
      if (!Object.keys(inboxPatch).length) continue;
      let mirror = supabaseAdmin.from("conversation_messages").update(inboxPatch as never).eq("id", inbox.id);
      mirror = (inbox as { delivery_status?: string | null }).delivery_status
        ? mirror.eq("delivery_status", inboxCurrent) : mirror.is("delivery_status", null);
      const { error: mirrorError } = await mirror;
      if (mirrorError) throw new Error(mirrorError.message);
    }
    return advances ? args.state : current;
  }
  throw new Error("Delivery state changed concurrently; retry event processing");

}

/** Loads the send a provider event refers to, by provider id then by recipient. */
export async function findCampaignMessageForEvent(
  providerMessageId: string | null,
  email: string | null,
): Promise<
  | (DeliveryStateRow & {
      workspace_id: string;
      campaign_id: string | null;
      lead_id: string | null;
      recipient_id: string | null;
      to_email: string | null;
    })
  | null
> {
  if (!providerMessageId && !email) return null;
  const { findOutboundMessageByProviderMessageId } = await import("@/lib/outbound-message-resolver.server");
  const resolved = await findOutboundMessageByProviderMessageId({
    providerMessageId,
    email,
    requireType: "campaign",
  });
  return (resolved?.row as never) ?? null;
}
