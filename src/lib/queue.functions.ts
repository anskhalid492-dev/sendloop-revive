/**
 * Campaign sending queue.
 *
 * Every email MunchReach will send exists as a row in `campaign_messages`, so
 * customers can watch a message move pending → scheduled → processing → sent
 * (or failed) and read the provider message id we got back.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  "id, campaign_id, lead_id, step_order, status, to_email, subject, body, scheduled_at, sent_at, provider, provider_message_id, last_error, attempts, created_at, sending_account_id, bounced_at, bounce_reason, cancelled_reason";

export const listCampaignQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        status: z.enum(MESSAGE_STATUSES).nullable().optional(),
        /** Filter to bounced messages (bounced_at set). Distinct from failed. */
        bounced: z.boolean().optional(),
        /** Filter to unsubscribed recipients. */
        unsubscribed: z.boolean().optional(),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("campaign_messages")
      .select(QUEUE_COLUMNS)
      .eq("campaign_id", data.campaignId)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(data.limit);
    if (data.status) query = query.eq("status", data.status);
    // Bounces are their own outcome: a bounced message never counts as failed,
    // and failed never includes bounced rows.
    if (data.status === "failed") query = query.is("bounced_at", null);
    // A recipient who bounced or unsubscribed mid-sequence has their remaining
    // mail cancelled with the reason attached — include those rows here too.
    if (data.bounced) {
      query = query.or("bounced_at.not.is.null,cancelled_reason.eq.recipient_bounced");
    }
    if (data.unsubscribed) {
      query = query.or("unsubscribed_at.not.is.null,cancelled_reason.eq.recipient_unsubscribed");
    }
    if (data.search) query = query.ilike("to_email", `%${data.search}%`);

    // Counts are exact server-side COUNTs. A plain select() is capped at 1,000
    // rows by PostgREST, which silently under-reported large queues (a 1,259
    // recipient campaign showed a total of exactly 1,000).
    const countFor = async (filter?: {
      status?: MessageStatus;
      accountId?: string;
      bounced?: "only" | "exclude";
    }) => {
      let q = context.supabase
        .from("campaign_messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", data.campaignId);
      if (filter?.status) q = q.eq("status", filter.status);
      if (filter?.accountId) q = q.eq("sending_account_id", filter.accountId);
      if (filter?.bounced === "only") q = q.not("bounced_at", "is", null);
      if (filter?.bounced === "exclude") q = q.is("bounced_at", null);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return Number(count ?? 0);
    };

    // Bounced and unsubscribed are counted per PERSON through the shared rule in
    // `@/lib/cancellation-reason`, so a bounce that stopped three follow-ups is
    // one bounce and a recipient cancelled because of a bounce/unsubscribe is
    // never hidden inside the Cancelled tile.
    const { OUTCOME_COLUMNS, OUTCOME_OR_FILTER, countOutcomeRecipients } = await import(
      "@/lib/cancellation-reason"
    );
    const outcomeRows = context.supabase
      .from("campaign_messages")
      .select(OUTCOME_COLUMNS)
      .eq("campaign_id", data.campaignId)
      .or(OUTCOME_OR_FILTER)
      .limit(5000);

    const [messagesRes, statusCounts, outcomeRes, total] = await Promise.all([
      query,
      Promise.all(
        MESSAGE_STATUSES.map((status) =>
          // Bounced messages keep status "failed" historically; count them only
          // in the bounced bucket so failed never mixes the two outcomes.
          status === "failed" ? countFor({ status, bounced: "exclude" }) : countFor({ status }),
        ),
      ),
      outcomeRows,
      countFor(),
    ]);
    if (outcomeRes.error) throw new Error(outcomeRes.error.message);
    const outcomes = countOutcomeRecipients((outcomeRes.data ?? []) as never[]);
    if (messagesRes.error) throw new Error(messagesRes.error.message);
    const { customerSafeMessage } = await import("@/lib/managed-sending.server");
    // Strip vendor identity and raw provider errors before the queue reaches
    // the customer; the untouched values stay in the database for admins.
    const { redactBounceReason } = await import("@/lib/bounce-reason");
    const { describeSendFailure } = await import("@/lib/delivery-lifecycle");
    messagesRes.data = (messagesRes.data ?? []).map((row) => ({
      ...row,
      // Readable category/code from the raw provider reply (no vendor identity).
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

    // Held for review: interrupted/timed-out sends whose outcome is unknown.
    const { count: unknownCount } = await context.supabase
      .from("campaign_messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", data.campaignId)
      .eq("status", "failed")
      .is("bounced_at", null)
      .or("attempts.gte.999,last_error.ilike.send_outcome_unknown%");

    const counts = {
      unknown: Number(unknownCount ?? 0),
      ...(Object.fromEntries(
        MESSAGE_STATUSES.map((s, i) => [s, statusCounts[i] ?? 0]),
      ) as Record<MessageStatus, number>),
      bounced: outcomes.bounced,
      unsubscribed: outcomes.unsubscribed,
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

    const byMailbox = (
      await Promise.all(
        accountIds.map(async (id) => {
          const [mailboxTotal, sent, failed, bounced] = await Promise.all([
            countFor({ accountId: id }),
            countFor({ accountId: id, status: "sent" }),
            // Failed excludes bounces; bounces are reported separately.
            countFor({ accountId: id, status: "failed", bounced: "exclude" }),
            countFor({ accountId: id, bounced: "only" }),
          ]);
          const account = accounts.find((a) => a.id === id) ?? null;
          return {
            accountId: id,
            label: account?.label ?? "Unknown mailbox",
            fromEmail: account?.from_email ?? "",
            // Customers never see the underlying infrastructure vendor.
            provider: null,
            total: mailboxTotal,
            sent,
            failed,
            bounced,
          };
        }),
      )
    ).filter((m) => m.total > 0);
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

    const { error } = await context.supabase
      .from("campaign_messages")
      .update(patch)
      .in("id", targetIds)
      .in("status", data.action === "cancel" ? ["pending", "scheduled", "failed"] : ["failed", "cancelled"]);
    if (error) throw new Error(error.message);
    return { ok: true, affected: targetIds.length };
  });
