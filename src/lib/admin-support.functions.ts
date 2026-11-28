/**
 * Admin/support console for customer tickets.
 *
 * Every function re-checks the platform `admin` or `support` role server-side
 * before reading or writing. Internal notes written here are flagged
 * `is_internal` and are excluded from customer queries by RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES, ticketReference } from "@/lib/support-model";
import type { EmitInput } from "@/lib/transactional-events.server";

async function assertStaff(context: { supabase: any; userId: string; claims?: Record<string, any> }) {
  const [admin, support] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "support" }),
  ]);
  if (admin.error) throw new Error(admin.error.message);
  if (support.error) throw new Error(support.error.message);
  if (!admin.data && !support.data) throw new Error("Forbidden: support role required");
  // Session revocation + MFA enforcement applies to support staff too.
  const { enforceAdminSessionPolicy } = await import("@/lib/admin-access.server");
  await enforceAdminSessionPolicy(context, { action: "support console" });
}

export type AdminTicket = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  last_message_at: string;
  assigned_to: string | null;
  created_by: string;
  workspace_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  workspace_name: string | null;
  assignee_email: string | null;
  /** Satisfaction rating of the support experience, if the customer submitted one. */
  rating: number | null;
  rating_feedback: string | null;
  rated_at: string | null;
  source?: string | null;
  contact_email?: string | null;
  contact_name?: string | null;
  ticket_ref?: string | null;
};

/** Ratings keyed by ticket id. Tolerates the table not existing yet. */
async function loadRatings(supabase: any, ticketIds: string[]) {
  const map = new Map<string, { rating: number; feedback: string | null; created_at: string }>();
  if (ticketIds.length === 0) return map;
  const { data, error } = await supabase
    .from("support_ticket_ratings")
    .select("ticket_id, rating, feedback, created_at")
    .in("ticket_id", ticketIds);
  if (error) return map;
  for (const row of (data ?? []) as Array<{
    ticket_id: string;
    rating: number;
    feedback: string | null;
    created_at: string;
  }>) {
    map.set(row.ticket_id, { rating: row.rating, feedback: row.feedback, created_at: row.created_at });
  }
  return map;
}

export const listAdminTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        status: z.string().optional(),
        category: z.string().optional(),
        priority: z.string().optional(),
        /** "all" | "unrated" | "1".."5" */
        rating: z.string().optional(),
        mine: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdminTicket[]> => {
    await assertStaff(context);

    let query = context.supabase
      .from("support_tickets")
      .select(
        "id, subject, category, priority, status, created_at, last_message_at, assigned_to, created_by, workspace_id, source, contact_email, contact_name, ticket_ref",
      )
      .order("last_message_at", { ascending: false })
      .limit(200);

    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.category && data.category !== "all") query = query.eq("category", data.category);
    if (data.priority && data.priority !== "all") query = query.eq("priority", data.priority);
    if (data.mine) query = query.eq("assigned_to", context.userId);
    if (data.search) query = query.ilike("subject", `%${data.search}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const tickets = (rows ?? []) as unknown as Array<
      Omit<
        AdminTicket,
        | "customer_email"
        | "customer_name"
        | "workspace_name"
        | "assignee_email"
        | "rating"
        | "rating_feedback"
        | "rated_at"
      >
    >;
    if (tickets.length === 0) return [];

    const userIds = Array.from(
      new Set(tickets.flatMap((t) => [t.created_by, t.assigned_to].filter(Boolean) as string[])),
    );
    const workspaceIds = Array.from(
      new Set(tickets.map((t) => t.workspace_id).filter(Boolean) as string[]),
    );

    const [profiles, workspaces, ratings] = await Promise.all([
      userIds.length
        ? context.supabase.from("profiles").select("id, email, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      workspaceIds.length
        ? context.supabase.from("workspaces").select("id, name").in("id", workspaceIds)
        : Promise.resolve({ data: [] as any[] }),
      loadRatings(
        context.supabase,
        tickets.map((t) => t.id),
      ),
    ]);

    const profileMap = new Map(
      ((profiles.data ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>).map(
        (p) => [p.id, p],
      ),
    );
    const workspaceMap = new Map(
      ((workspaces.data ?? []) as Array<{ id: string; name: string }>).map((w) => [w.id, w.name]),
    );

    const mapped: AdminTicket[] = tickets.map((t) => {
      const rating = ratings.get(t.id) ?? null;
      return {
        ...t,
        customer_email: profileMap.get(t.created_by)?.email ?? t.contact_email ?? null,
        customer_name: profileMap.get(t.created_by)?.full_name ?? t.contact_name ?? null,
        assignee_email: t.assigned_to ? (profileMap.get(t.assigned_to)?.email ?? null) : null,
        workspace_name: t.workspace_id ? (workspaceMap.get(t.workspace_id) ?? null) : null,
        rating: rating?.rating ?? null,
        rating_feedback: rating?.feedback ?? null,
        rated_at: rating?.created_at ?? null,
      };
    });

    const ratingFilter = data.rating ?? "all";
    if (ratingFilter === "all") return mapped;
    if (ratingFilter === "unrated") return mapped.filter((t) => t.rating === null);
    const wanted = Number(ratingFilter);
    if (!Number.isFinite(wanted)) return mapped;
    return mapped.filter((t) => t.rating === wanted);
  });

/** Aggregate support satisfaction metrics for the admin analytics view. */
export const getSupportSatisfaction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { summarizeSupportRatings } = await import("@/lib/support-rating");

    const [ratings, eligible] = await Promise.all([
      context.supabase.from("support_ticket_ratings").select("rating"),
      context.supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["resolved", "closed"]),
    ]);

    const rows = (ratings.error ? [] : (ratings.data ?? [])) as Array<{ rating: number }>;
    return summarizeSupportRatings(rows, eligible.count ?? 0);
  });


export const getAdminTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context);

    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .select(
        "id, subject, category, priority, status, created_at, last_message_at, assigned_to, created_by, workspace_id, source, contact_email, contact_name, ticket_ref, ai_conversation",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket not found");

    const row = ticket as unknown as {
      created_by: string;
      workspace_id: string | null;
      assigned_to: string | null;
    };

    const [messages, profile, workspace, rating] = await Promise.all([
      context.supabase
        .from("support_ticket_messages")
        .select(
          "id, ticket_id, author_id, author_role, body, is_internal, attachment_path, attachment_name, attachment_size, created_at",
        )
        .eq("ticket_id", data.id)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("profiles")
        .select("id, email, full_name, created_at")
        .eq("id", row.created_by)
        .maybeSingle(),
      row.workspace_id
        ? context.supabase
            .from("workspaces")
            .select("id, name, slug")
            .eq("id", row.workspace_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      context.supabase
        .from("support_ticket_ratings")
        .select("id, ticket_id, rating, feedback, created_at")
        .eq("ticket_id", data.id)
        .maybeSingle(),
    ]);

    return {
      ticket,
      messages: messages.data ?? [],
      customer: profile.data ?? null,
      rating: (rating?.data ?? null) as {
        id: string;
        ticket_id: string;
        rating: number;
        feedback: string | null;
        created_at: string;
      } | null,

      workspace: workspace.data ?? null,
    };
  });

type SupportReplyEmailTicket = {
  id: string;
  subject: string;
  created_by: string | null;
  workspace_id: string | null;
  contact_email: string | null;
  ticket_ref: string | null;
};

/**
 * Sends a public staff reply through the existing System Email template.
 * The message ID makes automatic/manual retries idempotent. Internal notes and
 * browser-supplied recipient addresses are deliberately not accepted.
 */
export async function notifyAdminSupportReply(
  ticket: SupportReplyEmailTicket,
  message: { id: string; body: string },
  internal: boolean,
  emit?: (input: EmitInput) => Promise<void>,
): Promise<void> {
  if (internal) return;

  const input: EmitInput = {
    eventKey: "support.ticket.replied",
    userId: ticket.created_by,
    to: ticket.created_by ? null : ticket.contact_email,
    workspaceId: ticket.workspace_id,
    idempotencyKey: `support.replied:${message.id}`,
    immediate: true,
    variables: {
      "ticket.subject": ticket.subject,
      "ticket.reference": ticket.ticket_ref ?? ticketReference(ticket.id),
      "ticket.message": message.body,
    },
  };

  try {
    const emitEvent = emit ?? (await import("@/lib/transactional-events.server")).emitTransactionalEvent;
    await emitEvent(input);
  } catch (error) {
    // The reply is already saved. Never make staff retry the whole mutation,
    // which could create a second ticket message after an email-only failure.
    console.error("support reply email failed", error);
  }
}

export const replyAdminTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ticketId: z.string().uuid(),
        body: z.string().trim().min(2).max(8000),
        internal: z.boolean().default(false),
        status: z.enum(SUPPORT_STATUSES).optional(),
        attachment: z
          .object({
            path: z.string().trim().min(3).max(400),
            name: z.string().trim().min(1).max(200),
            size: z.number().int().nonnegative(),
          })
          .nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);

    const { data: ticket, error: ticketError } = await context.supabase
      .from("support_tickets")
      .select("id, subject, created_by, workspace_id, contact_email, ticket_ref")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (ticketError) throw new Error(ticketError.message);
    if (!ticket) throw new Error("Ticket not found");

    const { data: message, error } = await context.supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: data.ticketId,
        author_id: context.userId,
        author_role: "support",
        body: data.body,
        is_internal: data.internal,
        attachment_path: data.attachment?.path ?? null,
        attachment_name: data.attachment?.name ?? null,
        attachment_size: data.attachment?.size ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (!message) throw new Error("Reply could not be saved");

    const nextStatus = data.status ?? (data.internal ? undefined : "waiting_customer");
    const patch = {
      last_message_at: new Date().toISOString(),
      ...(nextStatus ? { status: nextStatus } : {}),
    };
    const { error: uErr } = await context.supabase
      .from("support_tickets")
      .update(patch)
      .eq("id", data.ticketId);
    if (uErr) throw new Error(uErr.message);

    await notifyAdminSupportReply(
      ticket as unknown as SupportReplyEmailTicket,
      { id: message.id as string, body: data.body },
      data.internal,
    );

    return { ok: true };
  });

/** Re-send an existing public reply without creating another ticket message. */
export const emailAdminTicketReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context);

    const { data: message, error: messageError } = await context.supabase
      .from("support_ticket_messages")
      .select("id, ticket_id, body, author_role, is_internal")
      .eq("id", data.messageId)
      .maybeSingle();
    if (messageError) throw new Error(messageError.message);
    if (!message || message.author_role !== "support" || message.is_internal) {
      throw new Error("Only public support replies can be emailed");
    }

    const { data: ticket, error: ticketError } = await context.supabase
      .from("support_tickets")
      .select("id, subject, created_by, workspace_id, contact_email, ticket_ref")
      .eq("id", message.ticket_id)
      .maybeSingle();
    if (ticketError) throw new Error(ticketError.message);
    if (!ticket) throw new Error("Ticket not found");

    await notifyAdminSupportReply(
      ticket as unknown as SupportReplyEmailTicket,
      { id: message.id as string, body: message.body as string },
      false,
    );
    return { ok: true };
  });

export const updateAdminTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ticketId: z.string().uuid(),
        status: z.enum(SUPPORT_STATUSES).optional(),
        priority: z.enum(SUPPORT_PRIORITIES).optional(),
        assignedTo: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);

    const patch = {
      ...(data.status ? { status: data.status } : {}),
      ...(data.priority ? { priority: data.priority } : {}),
      ...(data.assignedTo !== undefined ? { assigned_to: data.assignedTo ?? null } : {}),
      ...(data.status === "closed" ? { closed_at: new Date().toISOString() } : {}),
    };
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase
      .from("support_tickets")
      .update(patch)
      .eq("id", data.ticketId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Staff members available for assignment. */
export const listSupportAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "support"]);
    if (error) throw new Error(error.message);

    const ids = Array.from(
      new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)),
    );
    if (ids.length === 0) return [] as Array<{ id: string; email: string | null; name: string | null }>;

    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    return ((profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>).map(
      (p) => ({ id: p.id, email: p.email, name: p.full_name }),
    );
  });

export const getAdminAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().trim().min(3).max(400) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { legacyKeyToR2 } = await import("@/lib/files-model");
    const { presignR2Url } = await import("@/lib/r2.server");
    const key = legacyKeyToR2("support-attachments", data.path);
    return { url: await presignR2Url({ key, method: "GET", expiresInSeconds: 300 }) };
  });

/* -------------------------------------------------------------------------- */
/* Bug reports                                                                 */
/* -------------------------------------------------------------------------- */

export type AdminBugReport = {
  id: string;
  details: string;
  status: string;
  created_at: string;
  updated_at: string;
  screenshot_path: string | null;
  screenshot_name: string | null;
  screenshot_size: number | null;
  admin_note: string | null;
  user_id: string;
  workspace_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  workspace_name: string | null;
};

const BUG_COLUMNS =
  "id, details, status, created_at, updated_at, screenshot_path, screenshot_name, screenshot_size, admin_note, user_id, workspace_id";

/** Full bug queue for staff, with the reporter and workspace resolved by name. */
export const listAdminBugReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        status: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdminBugReport[]> => {
    await assertStaff(context);

    let query = context.supabase
      .from("bug_reports")
      .select(BUG_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.search) query = query.ilike("details", `%${data.search}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const bugs = (rows ?? []) as unknown as Array<
      Omit<AdminBugReport, "customer_email" | "customer_name" | "workspace_name">
    >;
    if (bugs.length === 0) return [];

    const userIds = Array.from(new Set(bugs.map((b) => b.user_id)));
    const workspaceIds = Array.from(
      new Set(bugs.map((b) => b.workspace_id).filter(Boolean) as string[]),
    );
    const [profiles, workspaces] = await Promise.all([
      context.supabase.from("profiles").select("id, email, full_name").in("id", userIds),
      workspaceIds.length
        ? context.supabase.from("workspaces").select("id, name").in("id", workspaceIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const profileMap = new Map(
      ((profiles.data ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>).map(
        (p) => [p.id, p],
      ),
    );
    const workspaceMap = new Map(
      ((workspaces.data ?? []) as Array<{ id: string; name: string }>).map((w) => [w.id, w.name]),
    );

    return bugs.map((bug) => ({
      ...bug,
      customer_email: profileMap.get(bug.user_id)?.email ?? null,
      customer_name: profileMap.get(bug.user_id)?.full_name ?? null,
      workspace_name: bug.workspace_id ? (workspaceMap.get(bug.workspace_id) ?? null) : null,
    }));
  });

export const updateAdminBugReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "in_progress", "resolved", "closed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { error } = await context.supabase
      .from("bug_reports")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Short-lived private link to a reported screenshot, staff only. */
export const getAdminBugScreenshotUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().trim().min(3).max(400) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { legacyKeyToR2 } = await import("@/lib/files-model");
    const { presignR2Url } = await import("@/lib/r2.server");
    const key = legacyKeyToR2("support", data.path);
    return { url: await presignR2Url({ key, method: "GET", expiresInSeconds: 300 }) };
  });
