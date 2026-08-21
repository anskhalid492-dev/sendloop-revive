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
};

export type MailboxInfo = {
  id: string;
  label: string;
  from_email: string;
  from_name: string | null;
  provider: string | null;
};

const QUEUE_COLUMNS =
  "id, campaign_id, lead_id, step_order, status, to_email, subject, body, scheduled_at, sent_at, provider, provider_message_id, last_error, attempts, created_at, sending_account_id";

export const listCampaignQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        status: z.enum(MESSAGE_STATUSES).nullable().optional(),
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
    if (data.search) query = query.ilike("to_email", `%${data.search}%`);

    const [messagesRes, countsRes] = await Promise.all([
      query,
      context.supabase
        .from("campaign_messages")
        .select("status, sending_account_id")
        .eq("campaign_id", data.campaignId),
    ]);
    if (messagesRes.error) throw new Error(messagesRes.error.message);
    const { customerSafeMessage } = await import("@/lib/managed-sending.server");
    // Strip vendor identity and raw provider errors before the queue reaches
    // the customer; the untouched values stay in the database for admins.
    messagesRes.data = (messagesRes.data ?? []).map((row) => ({
      ...row,
      provider: null,
      last_error: (row as { last_error?: string | null }).last_error
        ? customerSafeMessage(
            (row as { last_error?: string | null }).last_error,
            "This message could not be delivered. Please contact support.",
          )
        : null,
    })) as never;
    if (countsRes.error) throw new Error(countsRes.error.message);

    const counts = Object.fromEntries(MESSAGE_STATUSES.map((s) => [s, 0])) as Record<
      MessageStatus,
      number
    >;
    for (const row of countsRes.data ?? []) {
      const status = row.status as MessageStatus;
      if (status in counts) counts[status] += 1;
    }

    // Send log: which mailbox each message went through, plus a per-mailbox
    // breakdown so rotation is visible at a glance.
    const rows = (countsRes.data ?? []) as Array<{
      status: string;
      sending_account_id: string | null;
    }>;
    const accountIds = [...new Set(rows.map((r) => r.sending_account_id).filter(Boolean))] as string[];

    let accounts: MailboxInfo[] = [];
    if (accountIds.length) {
      const { data: accRows, error: accErr } = await context.supabase
        .from("sending_accounts")
        .select("id, label, from_email, from_name, provider")
        .in("id", accountIds);
      if (accErr) throw new Error(accErr.message);
      accounts = (accRows ?? []) as unknown as MailboxInfo[];
    }

    const byMailbox = accountIds.map((id) => {
      const mine = rows.filter((r) => r.sending_account_id === id);
      const account = accounts.find((a) => a.id === id) ?? null;
      return {
        accountId: id,
        label: account?.label ?? "Unknown mailbox",
        fromEmail: account?.from_email ?? "",
        // Customers never see the underlying infrastructure vendor.
        provider: null,
        total: mine.length,
        sent: mine.filter((r) => r.status === "sent").length,
        failed: mine.filter((r) => r.status === "failed").length,
      };
    });
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
      total: rows.length,
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
        ? { status: "cancelled" as const }
        : { status: "pending" as const, last_error: null, scheduled_at: null };

    const { error } = await context.supabase
      .from("campaign_messages")
      .update(patch)
      .in("id", data.ids)
      .in("status", data.action === "cancel" ? ["pending", "scheduled", "failed"] : ["failed", "cancelled"]);
    if (error) throw new Error(error.message);
    return { ok: true, affected: data.ids.length };
  });
