/**
 * Unified Inbox server functions.
 *
 * Everything is workspace scoped through RLS (`requireSupabaseAuth`), so a
 * customer can never reach another workspace's conversation by changing an id.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONVERSATION_STATUS_VALUES,
  INBOX_FOLDER_IDS,
  previewOf,
  type ConversationListItem,
  type ConversationMessage,
  type ConversationNote,
} from "@/lib/inbox-model";
import { TRANSITION_FOR_CONVERSATION_STATUS } from "@/lib/lead-stage-map";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_TOTAL_ATTACHMENT_BYTES,
} from "@/lib/mail-attachments";

const CONVERSATION_COLUMNS =
  "id, workspace_id, lead_id, campaign_id, sending_account_id, subject, prospect_email, status, assigned_to, tags, unread, archived, snoozed_until, starred, message_count, last_message_at, last_direction, last_preview";

/**
 * A manual-send attachment: the file's own bytes as base64 (`content`), or a
 * legacy link-style entry (`url`). Base64 grows content by about a third, so the
 * per-file ceiling is the total raw limit plus that overhead.
 */
const attachmentInput = z.object({
  name: z.string().max(200),
  contentType: z.string().max(160).optional(),
  size: z.number().int().nonnegative().max(MAX_TOTAL_ATTACHMENT_BYTES).optional(),
  content: z
    .string()
    .max(Math.ceil((MAX_TOTAL_ATTACHMENT_BYTES * 4) / 3) + 1024)
    .optional(),
  url: z.string().url().max(600).optional(),
});


const filtersSchema = z.object({
  workspaceId: z.string().uuid(),
  folder: z.enum(INBOX_FOLDER_IDS).default("inbox"),
  search: z.string().trim().max(200).optional(),
  statuses: z.array(z.enum(CONVERSATION_STATUS_VALUES)).max(12).optional(),
  campaignIds: z.array(z.string().uuid()).max(20).optional(),
  accountIds: z.array(z.string().uuid()).max(20).optional(),
  assignedTo: z.string().uuid().nullish(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  leadId: z.string().uuid().nullish(),
  unreadOnly: z.boolean().optional(),
  fromDate: z.string().max(40).optional(),
  toDate: z.string().max(40).optional(),
  cursor: z.string().max(40).optional(),
  limit: z.number().int().min(5).max(50).default(25),
});

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => filtersSchema.parse(input))
  .handler(async ({ data, context }) => {
    const nowIso = new Date().toISOString();
    let query = context.supabase
      .from("conversations")
      .select(
        `${CONVERSATION_COLUMNS}, leads(first_name, last_name, company), campaigns(name), sending_accounts(from_email)`,
      )
      .eq("workspace_id", data.workspaceId)
      .order("last_message_at", { ascending: false })
      .limit(data.limit);

    // Folders are server-side filters so paging and counts stay honest.
    // The inbox only ever contains conversations that received a real inbound
    // reply — outbound-only campaign sends stay in Campaigns → Sent/Activity.
    switch (data.folder) {
      case "inbox":
        query = query
          .eq("has_inbound", true)
          .eq("archived", false)
          .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`);
        break;
      case "unread":
        query = query.eq("has_inbound", true).eq("archived", false).eq("unread", true);
        break;
      case "replied":
        // The prospect replied and we answered after that reply.
        query = query
          .eq("has_inbound", true)
          .eq("has_outbound", true)
          .eq("archived", false)
          .eq("last_direction", "outbound");
        break;
      case "auto_replies":
        // Automatic/out-of-office responses detected during inbound processing.
        query = query.eq("has_inbound", true).eq("archived", false).eq("status", "ooo");
        break;
      case "starred":
        query = query.eq("starred", true);
        break;
      case "sent":
      case "drafts":
        // Drafts are not conversations; the folder is served by listDrafts.
        query = query.eq("has_outbound", true).eq("archived", false);
        break;
      case "archived":
        query = query.eq("has_inbound", true).eq("archived", true);
        break;
      case "snoozed":
        query = query.eq("has_inbound", true).eq("archived", false).gt("snoozed_until", nowIso);
        break;
      case "assigned_to_me":
        query = query.eq("has_inbound", true).eq("archived", false).eq("assigned_to", context.userId);
        break;
      case "all":
        // All mail spans both replies and sent threads.
        break;

      default:
        query = query.eq("has_inbound", true).eq("archived", false).eq("status", data.folder);
        break;
    }


    if (data.cursor) query = query.lt("last_message_at", data.cursor);
    if (data.statuses?.length) query = query.in("status", data.statuses);
    if (data.campaignIds?.length) query = query.in("campaign_id", data.campaignIds);
    if (data.accountIds?.length) query = query.in("sending_account_id", data.accountIds);
    if (data.assignedTo) query = query.eq("assigned_to", data.assignedTo);
    if (data.leadId) query = query.eq("lead_id", data.leadId);
    if (data.tags?.length) query = query.overlaps("tags", data.tags);
    if (data.unreadOnly) query = query.eq("unread", true);
    if (data.fromDate) query = query.gte("last_message_at", data.fromDate);
    if (data.toDate) query = query.lte("last_message_at", data.toDate);

    if (data.search) {
      // Full-text-ish search across the conversation and the bodies of its
      // messages, resolved in the database so it covers unloaded rows too.
      const term = data.search.replace(/[%_,()\\]/g, " ").trim();
      const like = `%${term}%`;
      const { data: hits } = await context.supabase
        .from("conversation_messages")
        .select("conversation_id")
        .eq("workspace_id", data.workspaceId)
        .or(`body.ilike.${like},subject.ilike.${like}`)
        .limit(500);
      const { data: leadHits } = await context.supabase
        .from("leads")
        .select("id")
        .eq("workspace_id", data.workspaceId)
        .or(
          `first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like},email.ilike.${like}`,
        )
        .limit(500);
      const convIds = [...new Set((hits ?? []).map((h) => h.conversation_id))];
      const leadIds = [...new Set((leadHits ?? []).map((l) => l.id))];
      const clauses = [`prospect_email.ilike.${like}`, `subject.ilike.${like}`];
      if (convIds.length) clauses.push(`id.in.(${convIds.join(",")})`);
      if (leadIds.length) clauses.push(`lead_id.in.(${leadIds.join(",")})`);
      query = query.or(clauses.join(","));
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const assigneeIds = [
      ...new Set((rows ?? []).map((r) => r.assigned_to).filter(Boolean)),
    ] as string[];
    const nameById = new Map<string, string>();
    if (assigneeIds.length) {
      const { data: people } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", assigneeIds);
      for (const p of people ?? []) nameById.set(p.id, p.full_name ?? p.email ?? "Teammate");
    }

    const items: ConversationListItem[] = (rows ?? []).map((row) => {
      const r = row as typeof row & {
        leads: { first_name: string | null; last_name: string | null; company: string | null } | null;
        campaigns: { name: string } | null;
        sending_accounts: { from_email: string } | null;
      };
      const name = [r.leads?.first_name, r.leads?.last_name].filter(Boolean).join(" ").trim();
      const { leads, campaigns, sending_accounts, ...rest } = r;
      return {
        ...(rest as ConversationListItem),
        lead_name: name || null,
        lead_company: leads?.company ?? null,
        campaign_name: campaigns?.name ?? null,
        sending_account_email: sending_accounts?.from_email ?? null,
        assignee_name: rest.assigned_to ? (nameById.get(rest.assigned_to) ?? null) : null,
      };
    });

    const last = items[items.length - 1];
    return {
      items,
      nextCursor: items.length === data.limit && last ? last.last_message_at : null,
    };
  });

export const getInboxCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { fetchAllRows } = await import("@/lib/supabase-batch");
    const rows = await fetchAllRows<{
      status: string;
      unread: boolean;
      archived: boolean;
      snoozed_until: string | null;
      assigned_to: string | null;
      has_inbound: boolean;
      has_outbound: boolean;
      starred: boolean;
      last_direction: string;
    }>(() =>
      context.supabase
        .from("conversations")
        .select(
          "status, unread, archived, snoozed_until, assigned_to, has_inbound, has_outbound, starred, last_direction",
        )
        .eq("workspace_id", data.workspaceId),
    );
    const now = Date.now();
    const counts: Record<string, number> = {};
    const bump = (key: string) => {
      counts[key] = (counts[key] ?? 0) + 1;
    };
    for (const row of rows ?? []) {
      const snoozed = row.snoozed_until ? new Date(row.snoozed_until).getTime() > now : false;
      bump("all");
      if (row.starred) bump("starred");
      // Sent counts every thread we have emailed, replied to or not.
      if (row.has_outbound && !row.archived) bump("sent");
      // Everything else is reply-driven: no inbound message, no inbox entry.
      if (!row.has_inbound) continue;
      if (row.archived) {
        bump("archived");
        continue;
      }
      if (snoozed) {
        bump("snoozed");
        continue;
      }
      bump("inbox");
      if (row.unread) bump("unread");
      if (row.status === "ooo") bump("auto_replies");
      if (row.has_outbound && row.last_direction === "outbound") bump("replied");
      if (row.assigned_to === context.userId) bump("assigned_to_me");
      bump(row.status);
    }
    return counts;
  });

export const getInboxFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { fetchAllRows } = await import("@/lib/supabase-batch");
    const [campaigns, accounts, members, tagRows] = await Promise.all([
      context.supabase
        .from("campaigns")
        .select("id, name")
        .eq("workspace_id", data.workspaceId)
        .order("created_at", { ascending: false })
        .limit(200),
      context.supabase
        .from("sending_accounts")
        .select("id, from_email, label, status, paused, customer_enabled, warmup_status")
        .eq("workspace_id", data.workspaceId)
        .limit(200),
      context.supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", data.workspaceId)
        .limit(200),
      fetchAllRows<{ tags: string[] | null }>(() =>
        context.supabase.from("conversations").select("tags").eq("workspace_id", data.workspaceId),
      ),
    ]);

    const memberIds = (members.data ?? []).map((m) => m.user_id);
    let people: { id: string; name: string }[] = [];
    if (memberIds.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberIds);
      people = (profiles ?? []).map((p) => ({
        id: p.id,
        name: p.full_name ?? p.email ?? "Teammate",
      }));
    }

    const tags = [...new Set(tagRows.flatMap((r) => r.tags ?? []))].sort();

    return {
      campaigns: campaigns.data ?? [],
      accounts: accounts.data ?? [],
      members: people,
      tags,
      me: context.userId,
    };
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: conversation, error } = await context.supabase
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conversation) throw new Error("Conversation not found");

    const [messagesRes, notesRes, eventsRes, leadRes, campaignRes, accountRes] = await Promise.all([
      context.supabase
        .from("conversation_messages")
        .select(
          "id, direction, from_email, from_name, to_email, cc_emails, subject, body, html, attachments, opened_at, clicked_at, occurred_at, provider_message_id",
        )
        .eq("conversation_id", data.id)
        .order("occurred_at", { ascending: true })
        .limit(300),
      context.supabase
        .from("conversation_notes")
        .select("id, body, author_id, mentions, created_at, updated_at")
        .eq("conversation_id", data.id)
        .order("created_at", { ascending: true })
        .limit(200),
      context.supabase
        .from("conversation_events")
        .select("id, type, detail, created_at")
        .eq("conversation_id", data.id)
        // reply_classified rows are internal recovery state (raw JSON detail);
        // they are not meant for the Activity list.
        .neq("type", "reply_classified")
        .order("created_at", { ascending: false })
        .limit(50),
      conversation.lead_id
        ? context.supabase
            .from("leads")
            .select(
              "id, email, first_name, last_name, company, job_title, phone, website, linkedin_url, city, state, country, custom_fields, status, crm_stage, tags, last_activity_at",
            )
            .eq("id", conversation.lead_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      conversation.campaign_id
        ? context.supabase
            .from("campaigns")
            .select("id, name, status")
            .eq("id", conversation.campaign_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      conversation.sending_account_id
        ? context.supabase
            .from("sending_accounts")
            .select("id, label, from_name, from_email")
            .eq("id", conversation.sending_account_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const authorIds = [
      ...new Set([
        ...((notesRes.data ?? []).map((n) => n.author_id) as string[]),
        ...(conversation.assigned_to ? [conversation.assigned_to] : []),
      ]),
    ];
    const nameById = new Map<string, string>();
    if (authorIds.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", authorIds);
      for (const p of profiles ?? []) nameById.set(p.id, p.full_name ?? p.email ?? "Teammate");
    }

    let replySource: import("@/lib/reply-source").ReplySource | null = null;
    if (conversation.has_inbound) {
      try {
        const { resolveReplySources } = await import("@/lib/reply-source.server");
        replySource = (await resolveReplySources(context.supabase, [data.id])).get(data.id)?.source ?? null;
      } catch {
        replySource = null;
      }
    }

    return {
      replySource,
      conversation: {
        ...conversation,
        assignee_name: conversation.assigned_to
          ? (nameById.get(conversation.assigned_to) ?? null)
          : null,
      },
      messages: (messagesRes.data ?? []) as unknown as ConversationMessage[],
      notes: (notesRes.data ?? []).map((n) => ({
        ...n,
        author_name: nameById.get(n.author_id) ?? null,
      })) as unknown as ConversationNote[],
      events: eventsRes.data ?? [],
      lead: leadRes.data ?? null,
      campaign: campaignRes.data ?? null,
      account: accountRes.data ?? null,
      me: context.userId,
    };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CONVERSATION_STATUS_VALUES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  archived: z.boolean().optional(),
  snoozedUntil: z.string().max(40).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  unread: z.boolean().optional(),
  starred: z.boolean().optional(),
});

export const updateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch["status"] = data.status;
    if (data.assignedTo !== undefined) patch["assigned_to"] = data.assignedTo;
    if (data.archived !== undefined) patch["archived"] = data.archived;
    if (data.snoozedUntil !== undefined) patch["snoozed_until"] = data.snoozedUntil;
    if (data.tags !== undefined) patch["tags"] = data.tags;
    if (data.unread !== undefined) patch["unread"] = data.unread;
    if (data.starred !== undefined) patch["starred"] = data.starred;
    if (!Object.keys(patch).length) return { ok: true };

    const { data: updated, error } = await context.supabase
      .from("conversations")
      .update(patch as never)
      .eq("id", data.id)
      .select("id, workspace_id, lead_id, status, prospect_email")
      .single();
    if (error) throw new Error(error.message);

    // An inbox status change is a CRM change: it moves the contact's lead
    // status AND its pipeline stage through the one shared transition service,
    // so "Won" here is the same Won the CRM board shows. Failures surface.
    let lead: { status: string; stageId: string | null; stageName: string | null } | null = null;
    const mapped = data.status ? TRANSITION_FOR_CONVERSATION_STATUS[data.status] : undefined;
    let leadId: string | null = (updated.lead_id as string | null) ?? null;

    // Replies from people who were never imported as leads have no CRM
    // contact yet. Link an existing contact with the same email, or create
    // one, so the pipeline move actually shows up in the CRM.
    if (mapped && !leadId && updated.prospect_email) {
      const email = String(updated.prospect_email).trim().toLowerCase();
      const { data: existing } = await context.supabase
        .from("leads")
        .select("id")
        .eq("workspace_id", updated.workspace_id)
        .ilike("email", email.replace(/[\\%_]/g, (c: string) => `\\${c}`))
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        leadId = existing.id as string;
      } else {
        const { data: created, error: createError } = await context.supabase
          .from("leads")
          .insert({
            workspace_id: updated.workspace_id,
            email,
            status: "replied",
            lead_source: "inbox",
          } as never)
          .select("id")
          .single();
        if (createError) throw new Error(`Couldn't add this contact to the CRM: ${createError.message}`);
        leadId = created.id as string;
      }
      await context.supabase
        .from("conversations")
        .update({ lead_id: leadId } as never)
        .eq("id", data.id);
    }

    if (mapped && leadId) {
      {
        const { applyLeadTransition } = await import("@/lib/lead-transition.server");
        const result = await applyLeadTransition(context.supabase, {
          leadId,
          status: mapped.status,
          ...(mapped.stageKey ? { stageKey: mapped.stageKey } : {}),
          actorId: context.userId,
          source: "inbox",
        });
        lead = {
          status: result.status,
          stageId: result.stageId,
          stageName: result.stageName,
        };
      }
    }

    // An explicit correction also applies when the lead already had that status.
    if (data.status && leadId) {
      const { syncLeadReplySentiment } = await import("@/lib/positive-reply-sentiment.server");
      await syncLeadReplySentiment(context.supabase, leadId, data.status);
    }

    await context.supabase.from("conversation_events").insert({
      conversation_id: data.id,
      workspace_id: updated.workspace_id,
      type: "updated",
      detail: data.status ? `Manual classification: ${data.status}; ${Object.keys(patch).join(", ")}` : Object.keys(patch).join(", "),
      actor_id: context.userId,
    });

    // The confirmed server state goes back to the caller so the UI shows the
    // real value instead of an optimistic guess.
    return { ok: true, lead };
  });

export const markAllConversationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ unread: false })
      .eq("workspace_id", data.workspaceId)
      .eq("unread", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        body: z.string().trim().min(1).max(5000),
        mentions: z.array(z.string().uuid()).max(20).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conversation, error: convError } = await context.supabase
      .from("conversations")
      .select("id, workspace_id, prospect_email")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) throw new Error("Conversation not found");

    const { data: note, error } = await context.supabase
      .from("conversation_notes")
      .insert({
        conversation_id: data.conversationId,
        workspace_id: conversation.workspace_id,
        author_id: context.userId,
        body: data.body,
        mentions: data.mentions,
      })
      .select("id, body, author_id, mentions, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);

    if (data.mentions.length) {
      await context.supabase.from("notifications").insert(
        data.mentions.map((userId) => ({
          user_id: userId,
          workspace_id: conversation.workspace_id,
          type: "mention",
          title: `You were mentioned on ${conversation.prospect_email}`,
          message: previewOf(data.body, 140),
          entity_type: "conversation",
          entity_id: conversation.id,
        })),
      );
    }

    return { note };
  });

export const updateConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(5000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversation_notes")
      .update({ body: data.body })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversation_notes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendConversationReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        subject: z.string().trim().min(1).max(300),
        body: z.string().trim().min(1).max(50000),
        /** Formatted body from the composer; sanitized again server-side. */
        bodyHtml: z.string().trim().max(200000).optional(),
        cc: z.array(z.string().email()).max(10).default([]),
        attachments: z.array(attachmentInput).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
        /** Identifies this send ATTEMPT so a replayed request never sends twice. */
        sendKey: z.string().trim().min(8).max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conversation } = await context.supabase
      .from("conversations")
      .select("workspace_id")
      .eq("id", data.conversationId)
      .maybeSingle();

    // Same exactly-once guard as Compose, before any allowance is consumed.
    const { claimManualSend } = await import("@/lib/manual-send-idempotency.server");
    type ReplyResult = Awaited<
      ReturnType<typeof import("@/lib/inbox-send.server").sendReplyThroughMailbox>
    >;
    const claim = conversation?.workspace_id
      ? await claimManualSend<ReplyResult>(
          conversation.workspace_id,
          data.sendKey ?? crypto.randomUUID(),
          "reply",
        )
      : null;
    if (claim && !claim.proceed) {
      if (claim.result) return claim.result;
      throw new Error(
        "This reply is already being sent. Check the conversation in a moment before sending it again.",
      );
    }

    let consumedWorkspace: string | null = null;
    if (conversation?.workspace_id) {
      const { requireEntitlement, consumeUsage } = await import("@/lib/billing/usage.server");
      await requireEntitlement(conversation.workspace_id, "unified_inbox");
      await consumeUsage(conversation.workspace_id, "emails_monthly", 1);
      consumedWorkspace = conversation.workspace_id;
    }
    const { sendReplyThroughMailbox } = await import("@/lib/inbox-send.server");
    try {
      const sent = await sendReplyThroughMailbox({
        supabase: context.supabase,
        userId: context.userId,
        ...data,
      });
      if (claim?.proceed) await claim.finish(sent);
      await context.supabase
        .from("notifications")
        .insert({
          user_id: context.userId,
          workspace_id: conversation?.workspace_id ?? null,
          type: "email_sent",
          title: "Reply sent",
          message: data.subject,
          entity_type: "conversation",
          entity_id: data.conversationId,
        })
        .then(({ error }) => error && console.warn("[notifications]", error.message));
      return sent;
    } catch (error) {
      if (claim?.proceed) await claim.release();
      // The allowance must not be burned when the email never left the platform.
      if (consumedWorkspace) {
        const { releaseUsage } = await import("@/lib/billing/usage.server");
        await releaseUsage(consumedWorkspace, "emails_monthly", 1).catch(() => {});
      }
      throw error;
    }
  });


/* ------------------------------------------------------------------ *
 * Compose, drafts and sending accounts available to the inbox.
 * ------------------------------------------------------------------ */

export const listComposeMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Mailboxes the customer connected themselves must be pickable here too,
    // not only the older platform-registered addresses.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncSelfConnectedSendingAccounts } = await import(
      "@/lib/self-connected-account.server"
    );
    await syncSelfConnectedSendingAccounts(supabaseAdmin, data.workspaceId);

    const { data: accounts, error } = await context.supabase
      .from("sending_accounts")
      .select(
        "id, label, from_name, from_email, paused, customer_enabled, status, sent_today, daily_limit, hourly_limit, last_sent_at",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("customer_enabled", true)
      .order("from_email");
    if (error) throw new Error(error.message);

    const { loadMailboxCapacities } = await import("@/lib/mailbox-capacity.server");
    const capacities = await loadMailboxCapacities((accounts ?? []) as never, "reply");
    return { accounts: capacities };
  });

const draftSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  conversationId: z.string().uuid().nullish(),
  leadId: z.string().uuid().nullish(),
  sendingAccountId: z.string().uuid().nullish(),
  to: z.string().trim().max(320).default(""),
  cc: z.array(z.string().trim().max(320)).max(10).default([]),
  bcc: z.array(z.string().trim().max(320)).max(10).default([]),
  subject: z.string().max(300).default(""),
  body: z.string().max(50000).default(""),
  attachments: z.array(attachmentInput).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
});

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => draftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      user_id: context.userId,
      conversation_id: data.conversationId ?? null,
      lead_id: data.leadId ?? null,
      sending_account_id: data.sendingAccountId ?? null,
      to_email: data.to,
      cc_emails: data.cc,
      bcc_emails: data.bcc,
      subject: data.subject,
      body: data.body,
      attachments: data.attachments,
    };
    const query = data.id
      ? context.supabase.from("email_drafts").update(row).eq("id", data.id).select("id").single()
      : context.supabase.from("email_drafts").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    return { id: saved.id as string };
  });

export const listDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: drafts, error } = await context.supabase
      .from("email_drafts")
      .select(
        "id, to_email, cc_emails, bcc_emails, subject, body, attachments, sending_account_id, lead_id, conversation_id, updated_at",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { drafts: drafts ?? [] };
  });

export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_drafts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendComposedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        sendingAccountId: z.string().uuid(),
        to: z.string().email(),
        cc: z.array(z.string().email()).max(10).default([]),
        bcc: z.array(z.string().email()).max(10).default([]),
        subject: z.string().trim().min(1).max(300),
        body: z.string().trim().min(1).max(50000),
        /** Formatted body from the composer; sanitized again server-side. */
        bodyHtml: z.string().trim().max(200000).optional(),
        leadId: z.string().uuid().nullish(),
        draftId: z.string().uuid().nullish(),
        attachments: z.array(attachmentInput).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
        /** Identifies this send ATTEMPT so a replayed request never sends twice. */
        sendKey: z.string().trim().min(8).max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { claimManualSend } = await import("@/lib/manual-send-idempotency.server");
    type ComposeResult = { ok: boolean; conversationId: string; messageId: string };
    const claim = await claimManualSend<ComposeResult>(
      data.workspaceId,
      data.sendKey ?? crypto.randomUUID(),
      "compose",
    );
    if (!claim.proceed) {
      if (claim.result) return claim.result;
      throw new Error(
        "This email is already being sent. Check your sent messages in a moment before sending it again.",
      );
    }

    const { composeAndSend } = await import("@/lib/inbox-compose.server");
    let result: ComposeResult;
    try {
      result = (await composeAndSend({
        supabase: context.supabase,
        userId: context.userId,
        workspaceId: data.workspaceId,
        sendingAccountId: data.sendingAccountId,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        body: data.body,
        bodyHtml: data.bodyHtml ?? null,
        leadId: data.leadId ?? null,
        attachments: data.attachments,
      })) as ComposeResult;
    } catch (error) {
      // Nothing was delivered: free the key so the customer can simply retry.
      await claim.release();
      throw error;
    }
    await claim.finish(result);
    if (data.draftId) {
      await context.supabase.from("email_drafts").delete().eq("id", data.draftId);
    }
    await context.supabase
      .from("notifications")
      .insert({
        user_id: context.userId,
        workspace_id: data.workspaceId,
        type: "email_sent",
        title: `Email sent to ${data.to}`,
        message: data.subject,
        entity_type: "conversation",
        entity_id: result.conversationId ?? null,
      })
      .then(({ error }) => error && console.warn("[notifications]", error.message));
    return result;
  });

// Receiving-infrastructure status is admin-only; it is intentionally not
// exposed to the customer inbox.

/**
 * Short-lived download link for one attachment on a message in this workspace.
 *
 * The conversation is read through the caller's own session first, so RLS decides
 * whether they may see the message at all; only then is the private storage copy
 * signed. Links expire after five minutes and are never stored anywhere.
 */
export const getAttachmentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { messageId: string; name: string }) =>
    z.object({ messageId: z.string().uuid(), name: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: message, error } = await context.supabase
      .from("conversation_messages")
      .select("id, attachments")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!message) throw new Error("This message is no longer available.");

    const files = (message.attachments ?? []) as {
      name?: string;
      path?: string;
      url?: string;
    }[];
    const file = files.find((entry) => entry.name === data.name);
    if (!file) throw new Error("This attachment is no longer available.");
    if (file.url && !file.path) return { url: file.url };
    if (!file.path) {
      throw new Error("This file was sent before attachment copies were kept, so it cannot be downloaded.");
    }

    const { signAttachmentDownload } = await import("@/lib/mail-attachment-store.server");
    return { url: await signAttachmentDownload({ path: file.path }) };
  });
