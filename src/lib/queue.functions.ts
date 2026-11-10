/**
 * Campaign sending queue.
 *
 * Every email MunchReach will send exists as a row in `campaign_messages`, so
 * customers can watch a message move pending → scheduled → processing → sent
 * (or failed) and read the provider message id we got back.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { countMessageOutcomes, messageOutcome, type OutcomeFacts } from "@/lib/message-outcomes";
import { fetchAllRows } from "@/lib/supabase-batch";
import { selectQueueCardIds, type QueueCardKey, type QueueInventoryRow } from "@/lib/queue-card-filter";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MESSAGE_STATUSES = [
  "pending",
  "scheduled",
  "processing",
  "sent",
  "failed",
  "cancelled",
] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export type QueueMessage = {
  id: string;
  campaign_id: string;
  lead_id: string;
  step_order: number;
  status: MessageStatus;
  to_email: string;
  subject: string;
  body: string;
  scheduled_at: string | null;
  sent_at: string | null;
  provider: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  attempts: number;
  created_at: string;
  sending_account_id: string | null;
  bounced_at: string | null;
  delivered_at?: string | null;
  delivery_status?: string | null;
  outcome?: ReturnType<typeof messageOutcome>;
  bounce_reason: string | null;
  cancelled_reason: string | null;
};

export type MailboxInfo = {
  id: string;
  label: string;
  from_email: string;
  from_name: string | null;
  provider: string | null;
};

const QUEUE_COLUMNS =
  "id, campaign_id, lead_id, step_order, status, to_email, subject, body, scheduled_at, sent_at, provider, provider_message_id, last_error, attempts, created_at, sending_account_id, bounced_at, bounce_reason, cancelled_reason, delivered_at, delivery_status, failed_at";

export const listCampaignQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        status: z.enum(MESSAGE_STATUSES).nullable().optional(),
        /** Filter to bounced messages (bounced_at set). Distinct from failed. */
        bounced: z.boolean().optional(),
        held: z.boolean().optional(),
        delivered: z.boolean().optional(),
        /** Filter to unsubscribed recipients. */
        unsubscribed: z.boolean().optional(),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Paged distinct-ID inventory uses the same classifier as all reporting.
    const inventory = await fetchAllRows<QueueInventoryRow & { sending_account_id?: string | null }>(() => context.supabase
      .from("campaign_messages")
      .select("id,status,delivery_status,sent_at,delivered_at,bounced_at,failed_at,last_error,attempts,updated_at,sending_account_id,scheduled_at,to_email")
      .eq("campaign_id", data.campaignId).order("id"));
    const total = inventory.length;

    // Outcome cards drill down through the SAME classifier that counts them,
    // so every card's number matches the emails it opens.
    const card: QueueCardKey | null = data.held ? "held"
      : data.delivered ? "delivered"
      : data.bounced ? "bounced"
      : data.status ?? null;

    let messagesRes: { data: unknown[] | null; error: { message: string } | null };
    if (card) {
      const ids = selectQueueCardIds(inventory, card, { search: data.search, limit: data.limit });
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const res = await context.supabase.from("campaign_messages").select(QUEUE_COLUMNS)
          .eq("campaign_id", data.campaignId).in("id", ids.slice(i, i + 100));
        if (res.error) throw new Error(res.error.message);
        rows.push(...((res.data ?? []) as unknown as Record<string, unknown>[]));
      }
      const order = new Map(ids.map((id, index) => [id, index]));
      rows.sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));
      messagesRes = { data: rows, error: null };
    } else {
      let query = context.supabase
        .from("campaign_messages")
        .select(QUEUE_COLUMNS)
        .eq("campaign_id", data.campaignId)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .limit(data.limit);
      // A recipient who unsubscribed mid-sequence has their remaining mail
      // cancelled with the reason attached — include those rows here too.
      if (data.unsubscribed) {
        query = query.or("unsubscribed_at.not.is.null,cancelled_reason.eq.recipient_unsubscribed");
      }
      if (data.search) query = query.ilike("to_email", `%${data.search}%`);
      messagesRes = (await query) as unknown as typeof messagesRes;
    }

    if (messagesRes.error) throw new Error(messagesRes.error.message);
    const { customerSafeMessage } = await import("@/lib/managed-sending.server");
    // Strip vendor identity and raw provider errors before the queue reaches
    // the customer; the untouched values stay in the database for admins.
    const { redactBounceReason } = await import("@/lib/bounce-reason");
    const { describeSendFailure } = await import("@/lib/delivery-lifecycle");
    messagesRes.data = (messagesRes.data ?? []).map((row) => ({
      ...row,
      // Readable category/code from the raw provider reply (no vendor identity).
      outcome: messageOutcome(row as unknown as OutcomeFacts),
      failure: describeSendFailure((row as { last_error?: string | null }).last_error),
      provider: null,
      // The bounce reason is shown to the customer, with vendor identity,
      // endpoints and keys redacted by the shared helper.
      bounce_reason: redactBounceReason((row as { bounce_reason?: string | null }).bounce_reason),
      last_error: (row as { last_error?: string | null }).last_error
        ? customerSafeMessage(
            (row as { last_error?: string | null }).last_error,
            "This message could not be delivered. Please contact support.",
          )
        : null,
    })) as never;

    const { countOutcomeRecipients, OUTCOME_COLUMNS, OUTCOME_OR_FILTER } = await import("@/lib/cancellation-reason");
    const recipientOutcomes = countOutcomeRecipients(await fetchAllRows(() => context.supabase.from("campaign_messages").select(OUTCOME_COLUMNS).eq("campaign_id", data.campaignId).or(OUTCOME_OR_FILTER).order("id")));
    const current = countMessageOutcomes(inventory);
    const counts = {
      pending: inventory.filter(m => m.status === "pending" && messageOutcome(m) === "queued").length,
      scheduled: inventory.filter(m => m.status !== "pending" && messageOutcome(m) === "queued").length,
      processing: current.sending,
      sent: current.accepted,
      delivered: current.delivered,
      failed: current.failed,
      cancelled: current.cancelled,
      bounced: current.bounced,
      unknown: current.held,
      unsubscribed: recipientOutcomes.unsubscribed,
    };
    // Send log: per-mailbox rotation breakdown, also from exact counts. The
    // candidate mailboxes come from the campaign's own rotation list.
    const { data: campaignRow, error: cErr } = await context.supabase
      .from("campaigns")
      .select("sending_account_ids")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    const accountIds = ((campaignRow?.sending_account_ids ?? []) as string[]).filter(Boolean);

    let accounts: MailboxInfo[] = [];
    if (accountIds.length) {
      const { data: accRows, error: accErr } = await context.supabase
        .from("sending_accounts")
        .select("id, label, from_email, from_name, provider")
        .in("id", accountIds);
      if (accErr) throw new Error(accErr.message);
      accounts = (accRows ?? []) as unknown as MailboxInfo[];
    }

    const byMailbox = accountIds.map(id => {
      const outcomes = countMessageOutcomes(inventory.filter(m => m.sending_account_id === id));
      const account = accounts.find(a => a.id === id);
      return { accountId: id, label: account?.label ?? "Unknown mailbox", fromEmail: account?.from_email ?? "", provider: null,
        total: outcomes.total, sent: outcomes.providerAccepted, failed: outcomes.failed, bounced: outcomes.bounced, held: outcomes.held, delivered: outcomes.delivered };
    }).filter(m => m.total > 0);
    byMailbox.sort((a, b) => b.total - a.total);

    // Reply tracking: which queued messages have earned a response.
    const { data: replyRows, error: replyErr } = await context.supabase
      .from("campaign_replies")
      .select("id, message_id, from_email, subject, received_at, sentiment")
      .eq("campaign_id", data.campaignId)
      .order("received_at", { ascending: false })
      .limit(500);
    if (replyErr) throw new Error(replyErr.message);
    const replies = (replyRows ?? []) as unknown as Array<{
      id: string;
      message_id: string | null;
      from_email: string;
      subject: string | null;
      received_at: string;
      sentiment: string;
    }>;
    const repliesByMessage: Record<string, { received_at: string; from_email: string }> = {};
    for (const r of replies) {
      if (r.message_id && !repliesByMessage[r.message_id]) {
        repliesByMessage[r.message_id] = { received_at: r.received_at, from_email: r.from_email };
      }
    }

    return {
      messages: (messagesRes.data ?? []) as unknown as QueueMessage[],
      counts,
      total,
      accounts,
      byMailbox,
      replies,
      repliesByMessage,
      replyCount: replies.length,
    };
  });


export const updateQueueMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        action: z.enum(["cancel", "requeue", "delete"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.action === "delete") {
      const { error } = await context.supabase
        .from("campaign_messages")
        .delete()
        .in("id", data.ids);
      if (error) throw new Error(error.message);
      return { ok: true, affected: data.ids.length };
    }

    const patch =
      data.action === "cancel"
        ? ({ status: "cancelled" as const, cancelled_reason: "manual" } as never)
        : { status: "pending" as const, last_error: null, scheduled_at: null };

    let targetIds = data.ids;
    if (data.action === "requeue") {
      // Held "outcome unknown" sends may already have been delivered: never resend.
      const { isHeldOutcomeUnknown } = await import("@/lib/campaign-send-phase");
      const { data: rows, error: readError } = await context.supabase
        .from("campaign_messages")
        .select("id, last_error, attempts")
        .in("id", data.ids);
      if (readError) throw new Error(readError.message);
      targetIds = ((rows ?? []) as Array<{ id: string; last_error: string | null; attempts: number | null }>)
        .filter((row) => !isHeldOutcomeUnknown(row))
        .map((row) => row.id);
      if (!targetIds.length) return { ok: true, affected: 0 };
    }

    let write = context.supabase.from("campaign_messages").update(patch).in("id", targetIds)
      .in("status", data.action === "cancel" ? ["pending", "scheduled", "failed"] : ["failed", "cancelled"]);
    if (data.action === "requeue") write = write.is("sent_at", null).is("provider_message_id", null)
      .is("delivered_at", null).is("bounced_at", null).lt("attempts", 999)
      .or("last_error.is.null,last_error.not.ilike.%send_outcome_unknown%");
    const { data: changed, error } = await write.select("id");
    if (error) throw new Error(error.message);
    return { ok: true, affected: changed?.length ?? 0 };
  });
