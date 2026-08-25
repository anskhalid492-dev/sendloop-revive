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

function stripAngle(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().replace(/^<|>$/g, "");
}

function idCandidates(value: string | null | undefined): string[] {
  const raw = value?.trim();
  const stripped = stripAngle(raw);
  return Array.from(new Set([raw, stripped].filter(Boolean) as string[]));
}

function inList(values: string[]): string {
  return `(${values.map((v) => `"${v.replace(/"/g, "")}"`).join(",")})`;
}

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
  const current = (args.message.delivery_status ?? "queued") as DeliveryState;
  const currentRank = RANK[current] ?? 0;
  const nextRank = RANK[args.state];

  const patch: Record<string, unknown> = { last_event_at: at };
  const column = TIMESTAMP_COLUMN[args.state];
  // Timestamps are always recorded, even for an event that does not advance
  // the headline state (an open arriving after a bounce still happened).
  if (column) patch[column] = at;
  if (args.source === "reconcile") patch["reconciled_at"] = new Date().toISOString();

  const advances = nextRank > currentRank;
  if (advances) {
    patch["delivery_status"] = args.state;
    if (args.detail) patch["delivery_detail"] = args.detail.slice(0, 500);
    // A bounce or hard failure is never a successful send.
    if (args.state === "bounced" || args.state === "failed") {
      patch["status"] = "failed";
      if (args.detail) patch["last_error"] = args.detail.slice(0, 500);
    }
  }

  await supabaseAdmin
    .from("campaign_messages")
    .update(patch as never)
    .eq("id", args.message.id);

  const inboxPatch: Record<string, unknown> = { ...patch };
  delete inboxPatch["status"];
  delete inboxPatch["last_error"];
  delete inboxPatch["last_event_at"];
  delete inboxPatch["reconciled_at"];
  if (advances) inboxPatch["delivery_status"] = args.state;
  if (args.detail) inboxPatch["delivery_detail"] = args.detail.slice(0, 500);
  if (Object.keys(inboxPatch).length) {
    await supabaseAdmin
      .from("conversation_messages")
      .update(inboxPatch as never)
      .eq("campaign_message_id", args.message.id);
  }
  return advances ? args.state : current;
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
  const columns =
    "id, status, delivery_status, workspace_id, campaign_id, lead_id, recipient_id, to_email";

  const ids = idCandidates(providerMessageId);
  if (ids.length) {
    const list = inList(ids);
    const { data } = await supabaseAdmin
      .from("campaign_messages")
      .select(columns)
      .eq("message_type", "campaign")
      .or(`provider_message_id.in.${list},message_id.in.${list}`)
      .limit(1);
    if (data?.[0]) return data[0] as never;
    return null;
  }

  if (email) {
    const { data } = await supabaseAdmin
      .from("campaign_messages")
      .select(columns)
      .eq("message_type", "campaign")
      .eq("to_email", email.toLowerCase())
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (data?.[0]) return data[0] as never;
  }
  return null;
}
