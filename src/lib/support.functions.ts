import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SUPPORT_STATUSES = ["open", "in_progress", "waiting_customer", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export type SupportTicket = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  workspace_id: string | null;
  last_message_at: string;
  created_at: string;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_role: string;
  body: string;
  created_at: string;
};

export const listSupportTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("support_tickets")
      .select("id, subject, category, priority, status, workspace_id, last_message_at, created_at")
      .eq("created_by", context.userId)
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as SupportTicket[];
  });

export const getSupportTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // RLS keeps this to tickets the caller opened (or staff), so an id in the
    // URL can never surface somebody else's conversation.
    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .select("id, subject, category, priority, status, workspace_id, last_message_at, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Support request not found");

    const { data: messages, error: mErr } = await context.supabase
      .from("support_ticket_messages")
      .select("id, ticket_id, author_id, author_role, body, created_at")
      .eq("ticket_id", data.id)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    return {
      ticket: ticket as SupportTicket,
      messages: (messages ?? []) as SupportMessage[],
    };
  });

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        subject: z.string().trim().min(4).max(160),
        category: z.enum(["general", "deliverability", "billing", "bug", "feature"]),
        priority: z.enum(["low", "normal", "high", "urgent"]),
        body: z.string().trim().min(10).max(8000),
        workspaceId: z.string().uuid().nullish(),
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
        created_by: context.userId,
        workspace_id: data.workspaceId ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: mErr } = await context.supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      author_id: context.userId,
      author_role: "customer",
      body: data.body,
    });
    if (mErr) throw new Error(mErr.message);

    return { id: ticket.id as string };
  });

export const replyToSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ ticketId: z.string().uuid(), body: z.string().trim().min(2).max(8000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("support_ticket_messages").insert({
      ticket_id: data.ticketId,
      author_id: context.userId,
      author_role: "customer",
      body: data.body,
    });
    if (error) throw new Error(error.message);

    // A customer reply moves a "waiting for customer" request back into the queue.
    const { error: uErr } = await context.supabase
      .from("support_tickets")
      .update({ last_message_at: new Date().toISOString(), status: "open" })
      .eq("id", data.ticketId)
      .eq("created_by", context.userId)
      .in("status", ["waiting_customer", "resolved"]);
    if (uErr) throw new Error(uErr.message);

    await context.supabase
      .from("support_tickets")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", data.ticketId)
      .eq("created_by", context.userId);

    return { ok: true };
  });

export const closeSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ticketId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("support_tickets")
      .update({ status: "resolved" })
      .eq("id", data.ticketId)
      .eq("created_by", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
