/**
 * Customer support centre.
 *
 * Every read and write runs as the signed-in customer, so RLS keeps a customer
 * to their own tickets. Internal staff notes are filtered out by the database
 * policy — they can never reach a customer, even if a query asked for them.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { legacyKeyToR2, ownerFromKey } from "@/lib/files-model";
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES } from "@/lib/support-model";
import { isRateableStatus, type SupportTicketRating } from "@/lib/support-rating";


export type SupportTicket = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  workspace_id: string | null;
  assigned_to: string | null;
  last_message_at: string;
  customer_last_read_at: string | null;
  created_at: string;
  unread: number;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_role: string;
  body: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  created_at: string;
};

const TICKET_COLUMNS =
  "id, subject, category, priority, status, workspace_id, assigned_to, last_message_at, customer_last_read_at, created_at";

export const listSupportTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ tickets: SupportTicket[]; unread: number }> => {
    const { data, error } = await context.supabase
      .from("support_tickets")
      .select(TICKET_COLUMNS)
      .eq("created_by", context.userId)
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as Array<Omit<SupportTicket, "unread">>;
    const tickets: SupportTicket[] = [];
    for (const row of rows) {
      // Unread = staff messages the customer has not opened yet.
      let query = context.supabase
        .from("support_ticket_messages")
        .select("id", { count: "exact", head: true })
        .eq("ticket_id", row.id)
        .neq("author_role", "customer");
      if (row.customer_last_read_at) query = query.gt("created_at", row.customer_last_read_at);
      const { count } = await query;
      tickets.push({ ...row, unread: count ?? 0 });
    }

    return { tickets, unread: tickets.reduce((sum, t) => sum + t.unread, 0) };
  });

export const getSupportTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .select(TICKET_COLUMNS)
      .eq("id", data.id)
      .eq("created_by", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Support request not found");

    const { data: messages, error: mErr } = await context.supabase
      .from("support_ticket_messages")
      .select(
        "id, ticket_id, author_id, author_role, body, attachment_path, attachment_name, attachment_size, created_at",
      )
      .eq("ticket_id", data.id)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    // Opening the thread clears the unread badge for this customer.
    await context.supabase
      .from("support_tickets")
      .update({ customer_last_read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("created_by", context.userId);

    const { data: rating } = await context.supabase
      .from("support_ticket_ratings")
      .select("id, ticket_id, rating, feedback, created_at, updated_at")
      .eq("ticket_id", data.id)
      .maybeSingle();

    return {
      ticket: { ...(ticket as unknown as Omit<SupportTicket, "unread">), unread: 0 },
      messages: (messages ?? []) as unknown as SupportMessage[],
      rating: (rating ?? null) as SupportTicketRating | null,
    };
  });

/**
 * Customer rates their SUPPORT EXPERIENCE on a resolved/closed ticket.
 * One rating per ticket — the unique constraint and RLS both enforce ownership.
 */
export const submitSupportRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ticketId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        feedback: z.string().trim().max(2000).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ticket, error: ownErr } = await context.supabase
      .from("support_tickets")
      .select("id, status, workspace_id")
      .eq("id", data.ticketId)
      .eq("created_by", context.userId)
      .maybeSingle();
    if (ownErr) throw new Error(ownErr.message);
    if (!ticket) throw new Error("Support request not found");

    const row = ticket as unknown as { status: string; workspace_id: string | null };
    if (!isRateableStatus(row.status)) {
      throw new Error("You can rate your support experience once the ticket is resolved or closed.");
    }

    const { data: existing } = await context.supabase
      .from("support_ticket_ratings")
      .select("id")
      .eq("ticket_id", data.ticketId)
      .maybeSingle();
    if (existing) throw new Error("You have already rated this support experience.");

    const { data: inserted, error } = await context.supabase
      .from("support_ticket_ratings")
      .insert({
        ticket_id: data.ticketId,
        user_id: context.userId,
        workspace_id: row.workspace_id,
        rating: data.rating,
        feedback: data.feedback?.trim() ? data.feedback.trim() : null,
      })
      .select("id, ticket_id, rating, feedback, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);

    return { rating: inserted as unknown as SupportTicketRating };
  });


const attachment = z
  .object({
    path: z.string().trim().min(3).max(400),
    name: z.string().trim().min(1).max(200),
    size: z.number().int().nonnegative().max(10 * 1024 * 1024),
  })
  .nullish();

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        subject: z.string().trim().min(4).max(160),
        category: z.enum(SUPPORT_CATEGORIES),
        priority: z.enum(SUPPORT_PRIORITIES),
        body: z.string().trim().min(10).max(8000),
        workspaceId: z.string().uuid().nullish(),
        attachment,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .insert({
        subject: data.subject,
        category: data.category,
        priority: data.priority,
        status: "open",
        created_by: context.userId,
        workspace_id: data.workspaceId ?? null,
        customer_last_read_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: mErr } = await context.supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      author_id: context.userId,
      author_role: "customer",
      body: data.body,
      is_internal: false,
      attachment_path: data.attachment?.path ?? null,
      attachment_name: data.attachment?.name ?? null,
      attachment_size: data.attachment?.size ?? null,
    });
    if (mErr) throw new Error(mErr.message);

    const { emitTransactionalEvent } = await import("@/lib/transactional-events.server");
    await emitTransactionalEvent({
      eventKey: "support.ticket.created",
      userId: context.userId,
      workspaceId: data.workspaceId ?? null,
      idempotencyKey: `support.created:${ticket.id as string}`,
      variables: { "ticket.id": ticket.id, "ticket.subject": data.subject, "ticket.status": "open" },
    });

    return { id: ticket.id as string };
  });

export const replyToSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ticketId: z.string().uuid(),
        body: z.string().trim().min(2).max(8000),
        attachment,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: owned, error: ownErr } = await context.supabase
      .from("support_tickets")
      .select("id, status")
      .eq("id", data.ticketId)
      .eq("created_by", context.userId)
      .maybeSingle();
    if (ownErr) throw new Error(ownErr.message);
    if (!owned) throw new Error("Support request not found");
    if ((owned as { status: string }).status === "closed") {
      throw new Error("This ticket is closed. Please open a new request.");
    }

    const { error } = await context.supabase.from("support_ticket_messages").insert({
      ticket_id: data.ticketId,
      author_id: context.userId,
      author_role: "customer",
      body: data.body,
      is_internal: false,
      attachment_path: data.attachment?.path ?? null,
      attachment_name: data.attachment?.name ?? null,
      attachment_size: data.attachment?.size ?? null,
    });
    if (error) throw new Error(error.message);

    const now = new Date().toISOString();
    const reopen = ["waiting_customer", "resolved"].includes(
      (owned as { status: string }).status,
    );
    const patch = {
      last_message_at: now,
      customer_last_read_at: now,
      ...(reopen ? { status: "open" } : {}),
    };
    const { error: uErr } = await context.supabase
      .from("support_tickets")
      .update(patch)
      .eq("id", data.ticketId)
      .eq("created_by", context.userId);
    if (uErr) throw new Error(uErr.message);

    return { ok: true };
  });

export const closeSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ticketId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("support_tickets")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", data.ticketId)
      .eq("created_by", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reopenSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ticketId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("support_tickets")
      .update({ status: "open", closed_at: null })
      .eq("id", data.ticketId)
      .eq("created_by", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Short-lived presigned R2 link for an attachment the caller may read. */
export const getSupportAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().trim().min(3).max(400) }).parse(input))
  .handler(async ({ data, context }) => {
    const key = legacyKeyToR2("support-attachments", data.path);
    const owner = ownerFromKey(key);
    if (!owner || owner.userId !== context.userId) throw new Error("Forbidden");
    const { presignR2Url } = await import("@/lib/r2.server");
    return { url: await presignR2Url({ key, method: "GET", expiresInSeconds: 300 }) };
  });
