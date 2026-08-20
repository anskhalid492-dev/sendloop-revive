/**
 * CRM server functions.
 *
 * Leads are the contact record — there is no parallel contacts table — so the
 * CRM shares campaigns, conversations, notes, tasks and activities with the
 * rest of the app. Everything runs through `requireSupabaseAuth`, so RLS
 * enforces workspace isolation on every read and write.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  CrmActivity,
  CrmCampaignLink,
  CrmContact,
  CrmConversationLink,
  CrmStage,
} from "@/lib/crm-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const sel = (s: string): string => s;

const CONTACT_SELECT =
  "id, stage_id, email, first_name, last_name, company, job_title, phone, website, city, state, country, linkedin_url, status, tags, owner_id, lead_source, deal_value, last_activity_at, created_at";

/* ------------------------------------------------------------------ stages */

export const listCrmStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    // Idempotent: seeds the default pipeline the first time a workspace opens
    // the CRM, and is membership-checked inside the function.
    await client.rpc("ensure_crm_stages", { _workspace_id: data.workspaceId });

    const { data: stages, error } = await client
      .from("crm_stages")
      .select(sel("id, key, name, color, position, is_won, is_lost"))
      .eq("workspace_id", data.workspaceId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return (stages ?? []) as CrmStage[];
  });

export const createCrmStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().trim().min(1).max(40),
        color: z.string().trim().min(2).max(20).default("slate"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: last } = await client
      .from("crm_stages")
      .select(sel("position"))
      .eq("workspace_id", data.workspaceId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const key = `${data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 30) || "stage"}_${Math.random().toString(36).slice(2, 6)}`;

    const { data: created, error } = await client
      .from("crm_stages")
      .insert({
        workspace_id: data.workspaceId,
        key,
        name: data.name,
        color: data.color,
        position: ((last?.position as number | undefined) ?? -1) + 1,
      })
      .select(sel("id, key, name, color, position, is_won, is_lost"))
      .single();
    if (error) throw new Error(error.message);
    return created as CrmStage;
  });

export const updateCrmStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(40).optional(),
        color: z.string().trim().min(2).max(20).optional(),
        isWon: z.boolean().optional(),
        isLost: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.color !== undefined) patch["color"] = data.color;
    if (data.isWon !== undefined) patch["is_won"] = data.isWon;
    if (data.isLost !== undefined) patch["is_lost"] = data.isLost;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await (context.supabase as Client)
      .from("crm_stages")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderCrmStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        orderedIds: z.array(z.string().uuid()).min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    for (const [index, id] of data.orderedIds.entries()) {
      const { error } = await client
        .from("crm_stages")
        .update({ position: index })
        .eq("id", id)
        .eq("workspace_id", data.workspaceId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteCrmStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), moveToStageId: z.string().uuid().nullable().default(null) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Client).rpc("delete_crm_stage", {
      _stage_id: data.id,
      _move_to: data.moveToStageId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------------------------------------- contacts */

export const listCrmContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        search: z.string().trim().max(120).optional(),
        stageId: z.string().uuid().optional(),
        campaignId: z.string().uuid().optional(),
        ownerId: z.string().uuid().optional(),
        tag: z.string().trim().max(40).optional(),
        source: z.string().trim().max(60).optional(),
        limit: z.number().int().min(20).max(1000).default(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;

    let query = client
      .from("leads")
      .select(sel(CONTACT_SELECT))
      .eq("workspace_id", data.workspaceId)
      .eq("archived", false)
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);

    if (data.stageId) query = query.eq("stage_id", data.stageId);
    if (data.ownerId) query = query.eq("owner_id", data.ownerId);
    if (data.source) query = query.eq("lead_source", data.source);
    if (data.tag) query = query.contains("tags", [data.tag]);
    if (data.search) {
      const term = `%${data.search.replace(/[%,]/g, "")}%`;
      query = query.or(
        `email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},company.ilike.${term},job_title.ilike.${term}`,
      );
    }
    if (data.campaignId) {
      const { data: recipients } = await client
        .from("campaign_recipients")
        .select(sel("lead_id"))
        .eq("campaign_id", data.campaignId)
        .limit(5000);
      const ids = (recipients ?? [])
        .map((r: { lead_id: string | null }) => r.lead_id)
        .filter(Boolean) as string[];
      if (ids.length === 0) return { contacts: [] as CrmContact[] };
      query = query.in("id", ids);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const leads = (rows ?? []) as Array<Record<string, unknown>>;
    const ids = leads.map((l) => l["id"] as string);
    if (ids.length === 0) return { contacts: [] as CrmContact[] };

    // Real counts only — from tasks and conversations that actually exist.
    const [{ data: tasks }, { data: conversations }] = await Promise.all([
      client
        .from("lead_tasks")
        .select(sel("lead_id, due_at, completed"))
        .in("lead_id", ids)
        .eq("completed", false),
      client
        .from("conversations")
        .select(sel("lead_id, unread, last_message_at, last_direction"))
        .in("lead_id", ids),
    ]);

    const contacts: CrmContact[] = leads.map((lead) => {
      const id = lead["id"] as string;
      const leadTasks = (tasks ?? []).filter(
        (t: { lead_id: string }) => t.lead_id === id,
      ) as Array<{ due_at: string | null }>;
      const due = leadTasks
        .map((t) => t.due_at)
        .filter(Boolean)
        .sort() as string[];
      const convos = (conversations ?? []).filter(
        (c: { lead_id: string | null }) => c.lead_id === id,
      ) as Array<{ unread: boolean; last_message_at: string; last_direction: string }>;
      const inbound = convos
        .filter((c) => c.last_direction === "inbound")
        .map((c) => c.last_message_at)
        .sort();

      return {
        ...(lead as unknown as Omit<
          CrmContact,
          "openTasks" | "nextTaskAt" | "lastReplyAt" | "unreadReplies"
        >),
        openTasks: leadTasks.length,
        nextTaskAt: due[0] ?? null,
        lastReplyAt: inbound.length ? inbound[inbound.length - 1]! : null,
        unreadReplies: convos.filter((c) => c.unread).length,
      };
    });

    return { contacts };
  });

export const moveCrmContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ leadId: z.string().uuid(), stageId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;

    // RLS guarantees both rows belong to a workspace the caller is in; the
    // explicit workspace comparison stops cross-workspace stage assignment.
    const [{ data: lead }, { data: stage }] = await Promise.all([
      client
        .from("leads")
        .select(sel("id, workspace_id, stage_id"))
        .eq("id", data.leadId)
        .maybeSingle(),
      client
        .from("crm_stages")
        .select(sel("id, workspace_id, name"))
        .eq("id", data.stageId)
        .maybeSingle(),
    ]);
    if (!lead || !stage) throw new Error("Contact or stage not found");
    if (lead.workspace_id !== stage.workspace_id) {
      throw new Error("That stage belongs to another workspace");
    }
    if (lead.stage_id === data.stageId) return { ok: true };

    const now = new Date().toISOString();
    const { error } = await client
      .from("leads")
      .update({ stage_id: data.stageId, last_activity_at: now })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    await client.from("lead_activities").insert({
      lead_id: data.leadId,
      workspace_id: lead.workspace_id,
      type: "stage_changed",
      detail: `Moved to ${stage.name}`,
      created_at: now,
    });

    try {
      const { emitAutomationEvent } = await import("@/lib/automation-engine.server");
      await emitAutomationEvent({
        workspaceId: lead.workspace_id,
        type: "crm.stage_changed",
        leadId: data.leadId,
        idempotencyKey: `crm.stage_changed:${data.leadId}:${data.stageId}:${now}`,
        payload: { stageId: data.stageId, stageName: stage.name },
      });
    } catch {
      /* automations never block a pipeline move */
    }

    return { ok: true };
  });

/** Moves many contacts at once; the RPC re-checks workspace membership. */
export const moveCrmContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadIds: z.array(z.string().uuid()).min(1).max(500),
        stageId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: moved, error } = await client.rpc("move_crm_contacts", {
      _lead_ids: data.leadIds,
      _stage_id: data.stageId,
    });
    if (error) throw new Error(error.message);
    return { moved: Number(moved ?? 0) };
  });

export const upsertCrmContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email(),
        firstName: z.string().trim().max(80).optional(),
        lastName: z.string().trim().max(80).optional(),
        company: z.string().trim().max(120).optional(),
        jobTitle: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(40).optional(),
        website: z.string().trim().max(200).optional(),
        city: z.string().trim().max(80).optional(),
        country: z.string().trim().max(80).optional(),
        linkedinUrl: z.string().trim().max(200).optional(),
        leadSource: z.string().trim().max(60).optional(),
        dealValue: z.number().min(0).max(1_000_000_000).nullable().optional(),
        ownerId: z.string().uuid().nullable().optional(),
        stageId: z.string().uuid().optional(),
        tags: z.array(z.string().trim().max(40)).max(30).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Plan × feature matrix is enforced server-side, not just in the UI.
    const { assertFeatureKey } = await import("@/lib/billing/entitlements.server");
    await assertFeatureKey(data.workspaceId, "crm");
    const client = context.supabase as Client;
    const patch: Record<string, unknown> = {
      email: data.email,
      first_name: data.firstName || null,
      last_name: data.lastName || null,
      company: data.company || null,
      job_title: data.jobTitle || null,
      phone: data.phone || null,
      website: data.website || null,
      city: data.city || null,
      country: data.country || null,
      linkedin_url: data.linkedinUrl || null,
      lead_source: data.leadSource || null,
    };
    if (data.dealValue !== undefined) patch["deal_value"] = data.dealValue;
    if (data.ownerId !== undefined) patch["owner_id"] = data.ownerId;
    if (data.stageId) patch["stage_id"] = data.stageId;
    if (data.tags) patch["tags"] = data.tags;

    if (data.id) {
      const { error } = await client.from("leads").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id, created: false };
    }

    // Email is the duplicate key: the same person is never created twice.
    const { data: existing } = await client
      .from("leads")
      .select(sel("id"))
      .eq("workspace_id", data.workspaceId)
      .eq("email", data.email)
      .maybeSingle();
    if (existing) {
      const { error } = await client.from("leads").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id as string, created: false };
    }

    const { data: created, error } = await client
      .from("leads")
      .insert({ ...patch, workspace_id: data.workspaceId, status: "new" })
      .select(sel("id"))
      .single();
    if (error) throw new Error(error.message);

    await client.from("lead_activities").insert({
      lead_id: created.id,
      workspace_id: data.workspaceId,
      type: "created",
      detail: "Contact created in CRM",
    });

    try {
      const { emitAutomationEvent } = await import("@/lib/automation-engine.server");
      await emitAutomationEvent({
        workspaceId: data.workspaceId,
        type: "lead.created",
        leadId: created.id as string,
        idempotencyKey: `lead.created:${created.id}`,
        payload: { email: data.email },
      });
    } catch {
      /* automations never block contact creation */
    }

    return { id: created.id as string, created: true };
  });

export const archiveCrmContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), archived: z.boolean().default(true) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Client)
      .from("leads")
      .update({ archived: data.archived })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCrmContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Client)
      .from("leads")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------- contact detail */

export const getCrmContact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;

    const { data: contact, error } = await client
      .from("leads")
      .select(sel(`${CONTACT_SELECT}, workspace_id`))
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!contact) throw new Error("Contact not found");

    const [
      { data: activities },
      { data: notes },
      { data: tasks },
      { data: conversations },
      { data: recipients },
    ] = await Promise.all([
      client
        .from("lead_activities")
        .select(sel("id, type, detail, campaign_id, created_at"))
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("lead_notes")
        .select(sel("id, body, created_at, author_id"))
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("lead_tasks")
        .select(sel("id, title, due_at, completed, created_at"))
        .eq("lead_id", data.id)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(100),
      client
        .from("conversations")
        .select(
          sel(
            "id, subject, status, unread, last_message_at, last_preview, last_direction, message_count, campaign_id, sending_account_id",
          ),
        )
        .eq("lead_id", data.id)
        .order("last_message_at", { ascending: false })
        .limit(25),
      client
        .from("campaign_recipients")
        .select(sel("campaign_id, status, current_step, next_send_at"))
        .eq("lead_id", data.id)
        .limit(50),
    ]);

    const campaignIds = new Set<string>();
    (conversations ?? []).forEach((c: { campaign_id: string | null }) => {
      if (c.campaign_id) campaignIds.add(c.campaign_id);
    });
    (recipients ?? []).forEach((r: { campaign_id: string }) => campaignIds.add(r.campaign_id));
    const accountIds = (conversations ?? [])
      .map((c: { sending_account_id: string | null }) => c.sending_account_id)
      .filter(Boolean) as string[];

    const [{ data: campaigns }, { data: accounts }, { data: messages }] = await Promise.all([
      campaignIds.size
        ? client.from("campaigns").select(sel("id, name")).in("id", [...campaignIds])
        : Promise.resolve({ data: [] }),
      accountIds.length
        ? client.from("sending_accounts").select(sel("id, from_email")).in("id", accountIds)
        : Promise.resolve({ data: [] }),
      client
        .from("campaign_messages")
        .select(sel("id, campaign_id, subject, status, sent_at, scheduled_at"))
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const campaignName = (id: string | null) =>
      (campaigns ?? []).find((c: { id: string }) => c.id === id)?.name ?? null;

    const conversationLinks: CrmConversationLink[] = (conversations ?? []).map(
      (c: Record<string, unknown>) => ({
        id: c["id"] as string,
        subject: (c["subject"] as string) || "(no subject)",
        status: c["status"] as string,
        unread: Boolean(c["unread"]),
        last_message_at: c["last_message_at"] as string,
        last_preview: (c["last_preview"] as string | null) ?? null,
        last_direction: c["last_direction"] as string,
        message_count: (c["message_count"] as number) ?? 0,
        campaign_name: campaignName((c["campaign_id"] as string | null) ?? null),
        mailbox:
          (accounts ?? []).find(
            (a: { id: string }) => a.id === (c["sending_account_id"] as string | null),
          )?.from_email ?? null,
      }),
    );

    const msgRows = (messages ?? []) as Array<{
      campaign_id: string;
      status: string;
      sent_at: string | null;
      scheduled_at: string | null;
    }>;

    const campaignLinks: CrmCampaignLink[] = (recipients ?? []).map(
      (r: {
        campaign_id: string;
        status: string;
        current_step: number | null;
        next_send_at: string | null;
      }) => {
        const mine = msgRows.filter((m) => m.campaign_id === r.campaign_id);
        const sentAts = mine
          .filter((m) => m.status === "sent" && m.sent_at)
          .map((m) => m.sent_at!)
          .sort();
        return {
          campaign_id: r.campaign_id,
          campaign_name: campaignName(r.campaign_id) ?? "Campaign",
          status: r.status,
          current_step: r.current_step,
          sent: sentAts.length,
          replies: conversationLinks.filter(
            (c) => c.campaign_name === campaignName(r.campaign_id) && c.last_direction === "inbound",
          ).length,
          last_email_at: sentAts.length ? sentAts[sentAts.length - 1]! : null,
          next_email_at: r.next_send_at,
        };
      },
    );

    const timeline: CrmActivity[] = [
      ...(activities ?? []).map((a: Record<string, unknown>) => ({
        id: `a-${a["id"]}`,
        kind: "activity" as const,
        type: a["type"] as string,
        detail: (a["detail"] as string | null) ?? "",
        at: a["created_at"] as string,
        campaignId: (a["campaign_id"] as string | null) ?? null,
      })),
      ...(notes ?? []).map((n: Record<string, unknown>) => ({
        id: `n-${n["id"]}`,
        kind: "note" as const,
        type: "note",
        detail: n["body"] as string,
        at: n["created_at"] as string,
      })),
      ...(tasks ?? []).map((t: Record<string, unknown>) => ({
        id: `t-${t["id"]}`,
        kind: "task" as const,
        type: t["completed"] ? "task_completed" : "task",
        detail: t["title"] as string,
        at: (t["due_at"] as string | null) ?? (t["created_at"] as string),
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    return {
      contact: contact as CrmContact & { workspace_id: string },
      timeline,
      tasks: (tasks ?? []) as Array<{
        id: string;
        title: string;
        due_at: string | null;
        completed: boolean;
      }>,
      notes: (notes ?? []) as Array<{ id: string; body: string; created_at: string }>,
      conversations: conversationLinks,
      campaigns: campaignLinks,
    };
  });

/* ------------------------------------------------------------ notes/tasks */

export const addCrmNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ leadId: z.string().uuid(), body: z.string().trim().min(1).max(4000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: lead } = await client
      .from("leads")
      .select(sel("id, workspace_id"))
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Contact not found");

    const { error } = await client.from("lead_notes").insert({
      lead_id: data.leadId,
      workspace_id: lead.workspace_id,
      body: data.body,
      author_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addCrmTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        title: z.string().trim().min(1).max(200),
        dueAt: z.string().max(40).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: lead } = await client
      .from("leads")
      .select(sel("id, workspace_id"))
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Contact not found");

    const { error } = await client.from("lead_tasks").insert({
      lead_id: data.leadId,
      workspace_id: lead.workspace_id,
      title: data.title,
      due_at: data.dueAt || null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCrmTaskDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), completed: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Client)
      .from("lead_tasks")
      .update({ completed: data.completed })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
