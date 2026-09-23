import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LEAD_FIELDS,
  MAX_WEBSITE_LENGTH,
  validateWebsite,
  type LeadRow,
} from "@/lib/lead-model";

export { LEAD_FIELDS };
export type { LeadRow };

/** Keeps supabase-js from parsing select strings at the type level. */
const sel = (s: string): string => s;

const LEAD_SELECT =
  "id, list_id, email, first_name, last_name, company, job_title, phone, website, linkedin_url, city, state, country, status, crm_stage, tags, custom_fields, last_activity_at, created_at";

export type LeadList = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  leadCount: number;
};

export type Lead = LeadRow;

const SORTABLE = [
  "created_at",
  "email",
  "first_name",
  "company",
  "job_title",
  "status",
  "last_activity_at",
] as const;

const filtersSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  listId: z.string().uuid().optional(),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(160).optional(),
  company: z.string().trim().max(160).optional(),
  jobTitle: z.string().trim().max(160).optional(),
  location: z.string().trim().max(120).optional(),
  statuses: z.array(z.string().max(40)).max(20).optional(),
  campaignId: z.string().uuid().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  createdFrom: z.string().max(40).optional(),
  createdTo: z.string().max(40).optional(),
  customKey: z.string().trim().max(60).optional(),
  customValue: z.string().trim().max(120).optional(),
});

const listInputSchema = filtersSchema.extend({
  page: z.number().int().min(1).max(2000).default(1),
  pageSize: z.number().int().min(10).max(200).default(50),
  sortBy: z.enum(SORTABLE).default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

type ListInput = z.infer<typeof listInputSchema>;




/* ------------------------------------------------------------------ lists */

export const listLeadLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid().optional() }).optional().parse(input) ?? {},
  )
  .handler(async ({ data: input, context }) => {
    let listsQuery = context.supabase
      .from("lead_lists")
      .select(sel("id, name, description, created_at"))
      .order("created_at", { ascending: false });
    if (input.workspaceId) listsQuery = listsQuery.eq("workspace_id", input.workspaceId);
    const { data, error } = await listsQuery
      .returns<Array<{ id: string; name: string; description: string | null; created_at: string }>>();
    if (error) throw new Error(error.message);

    const lists = data ?? [];

    // Counts come from exact head counts per list. Selecting every lead row and
    // counting client-side silently truncated at PostgREST's row ceiling, which
    // is why large lists reported 0 leads.
    const counts = await Promise.all(
      lists.map(async (list) => {
        let countQuery = context.supabase
          .from("leads")
          .select(sel("id"), { count: "exact", head: true })
          .eq("list_id", list.id);
        if (input.workspaceId) countQuery = countQuery.eq("workspace_id", input.workspaceId);
        const { count, error: countError } = await countQuery;
        if (countError) throw new Error(countError.message);
        return count ?? 0;
      }),
    );

    return lists.map((list, index) => ({
      ...list,
      leadCount: counts[index] ?? 0,
    })) as LeadList[];
  });


export const createLeadList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(280).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: list, error } = await context.supabase
      .from("lead_lists")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        description: data.description || null,
        created_by: context.userId,
      })
      .select(sel("id, name, description, created_at"))
      .single();
    if (error) throw new Error(error.message);
    return { ...(list as unknown as Omit<LeadList, "leadCount">), leadCount: 0 } as LeadList;
  });

export const renameLeadList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(280).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_lists")
      .update({ name: data.name, description: data.description ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Deleting a list touches every lead in it. A single statement over tens of
 * thousands of rows (plus cascading child rows) blows past Postgres'
 * statement_timeout, so the work is chunked into small batches instead.
 */
export const deleteLeadList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), deleteLeads: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const BATCH = 300;
    let processed = 0;
    let lastFirstId: string | null = null;

    // Loop until no lead references the list any more. Each pass reads a small
    // page of ids and mutates only those, keeping every statement short.
    for (let guard = 0; guard < 10_000; guard += 1) {
      const { data: rows, error: readError } = await context.supabase
        .from("leads")
        .select("id")
        .eq("list_id", data.id)
        .limit(BATCH);
      if (readError) throw new Error(readError.message);
      const ids = (rows ?? []).map((r) => (r as { id: string }).id);
      if (ids.length === 0) break;

      // No progress between passes means the rows cannot be changed (permissions
      // or a blocking reference); stop instead of spinning.
      if (ids[0] === lastFirstId) {
        throw new Error("Some leads in this list could not be updated. Please contact support.");
      }
      lastFirstId = ids[0] ?? null;

      if (data.deleteLeads) {
        const { error } = await context.supabase.from("leads").delete().in("id", ids);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await context.supabase
          .from("leads")
          .update({ list_id: null })
          .in("id", ids);
        if (error) throw new Error(error.message);
      }
      processed += ids.length;
      if (ids.length < BATCH) break;
    }


    const { error } = await context.supabase.from("lead_lists").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, processed };
  });


/* ------------------------------------------------------------------ leads */

export const listLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const input: ListInput = data;
    const { applyLeadFilters } = await import("@/lib/leads-query");
    const { resolveCampaignLeadIds } = await import("@/lib/leads-bulk.server");

    let restrictIds: string[] | null = null;
    if (input.campaignId) {
      restrictIds = await resolveCampaignLeadIds(context.supabase, input.campaignId);
      if (restrictIds.length === 0) return { rows: [] as LeadRow[], total: 0 };
    }

    let query = context.supabase
      .from("leads")
      .select(sel(LEAD_SELECT), { count: "exact" })
      .order(input.sortBy, { ascending: input.sortDir === "asc", nullsFirst: false });

    query = applyLeadFilters(query, { ...input, campaignId: undefined }, restrictIds);

    const from = (input.page - 1) * input.pageSize;
    const { data: rows, count, error } = await query
      .range(from, from + input.pageSize - 1)
      .returns<LeadRow[]>();
    if (error) throw new Error(error.message);


    const leads = (rows ?? []) as LeadRow[];
    if (leads.length === 0) return { rows: leads, total: count ?? 0 };

    // Campaign membership for the visible page only.
    const { data: memberships } = await context.supabase
      .from("campaign_recipients")
      .select(sel("lead_id, campaigns(name)"))
      .in(
        "lead_id",
        leads.map((l) => l.id),
      )
      .returns<Array<{ lead_id: string; campaigns: { name: string } | null }>>();

    const byLead = new Map<string, string[]>();
    for (const row of memberships ?? []) {
      if (!row.campaigns?.name) continue;
      const current = byLead.get(row.lead_id) ?? [];
      if (!current.includes(row.campaigns.name)) current.push(row.campaigns.name);
      byLead.set(row.lead_id, current);
    }

    return {
      rows: leads.map((l) => ({ ...l, campaignNames: byLead.get(l.id) ?? [] })),
      total: count ?? leads.length,
    };
  });

export const listLeadTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select(sel("tags"))
      .returns<Array<{ tags: string[] | null }>>();
    if (error) throw new Error(error.message);
    const tags = new Set<string>();
    for (const row of data ?? []) for (const tag of row.tags ?? []) tags.add(tag);
    return Array.from(tags).sort();
  });

export const getLeadDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select(sel(LEAD_SELECT))
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead not found");

    const [{ data: recipients }, { data: activities }, { data: notes }, { data: tasks }] =
      await Promise.all([
        context.supabase
          .from("campaign_recipients")
          .select(sel("id, campaign_id, status, current_step, last_sent_at, next_send_at, campaigns(name)"))
          .eq("lead_id", data.id)
          .returns<
            Array<{
              id: string;
              campaign_id: string;
              status: string;
              current_step: number;
              last_sent_at: string | null;
              next_send_at: string | null;
              campaigns: { name: string } | null;
            }>
          >(),
        context.supabase
          .from("lead_activities")
          .select(sel("id, type, detail, created_at, campaign_id"))
          .eq("lead_id", data.id)
          .order("created_at", { ascending: false })
          .limit(100)
          .returns<
            Array<{
              id: string;
              type: string;
              detail: string | null;
              created_at: string;
              campaign_id: string | null;
            }>
          >(),
        context.supabase
          .from("lead_notes")
          .select(sel("id, body, created_at, author_id"))
          .eq("lead_id", data.id)
          .order("created_at", { ascending: false })
          .returns<Array<{ id: string; body: string; created_at: string; author_id: string }>>(),
        context.supabase
          .from("lead_tasks")
          .select(sel("id, title, due_at, completed, created_at"))
          .eq("lead_id", data.id)
          .order("created_at", { ascending: false })
          .returns<
            Array<{
              id: string;
              title: string;
              due_at: string | null;
              completed: boolean;
              created_at: string;
            }>
          >(),
      ]);

    const { data: replyRows } = await context.supabase

      .from("campaign_replies")
      .select(
        sel(
          "id, campaign_id, message_id, from_email, to_email, subject, body, sentiment, received_at, campaigns(name)",
        ),
      )
      .eq("lead_id", data.id)
      .order("received_at", { ascending: false })
      .limit(100)
      .returns<
        Array<{
          id: string;
          campaign_id: string | null;
          message_id: string | null;
          from_email: string;
          to_email: string | null;
          subject: string | null;
          body: string | null;
          sentiment: string;
          received_at: string;
          campaigns: { name: string } | null;
        }>
      >();

    return {
      lead: lead as unknown as LeadRow,
      campaigns: recipients ?? [],
      activities: activities ?? [],
      notes: notes ?? [],
      tasks: tasks ?? [],
      replies: replyRows ?? [],
    };
  });


const leadWriteSchema = z.object({
  email: z.string().trim().email().max(200),
  first_name: z.string().trim().max(120).optional().nullable(),
  last_name: z.string().trim().max(120).optional().nullable(),
  company: z.string().trim().max(160).optional().nullable(),
  job_title: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(60).optional().nullable(),
  website: z.string().trim().max(MAX_WEBSITE_LENGTH).optional().nullable(),
  linkedin_url: z.string().trim().max(MAX_WEBSITE_LENGTH).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  status: z.string().trim().max(40).optional(),
  crm_stage: z.string().trim().max(40).optional(),
  /** Canonical pipeline stage key — the only supported way to move a contact. */
  stage_key: z.enum(CANONICAL_STAGE_KEYS).optional(),
  tags: z.array(z.string().trim().max(40)).max(30).optional(),
  list_id: z.string().uuid().nullable().optional(),
  custom_fields: z.record(z.string(), z.string()).optional(),
});

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), lead: leadWriteSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Server-side plan enforcement (API callers included).
    const { checkUsageLimit } = await import("@/lib/billing/usage.server");
    await checkUsageLimit(data.workspaceId, "leads", 1);

    const { data: existing } = await context.supabase
      .from("leads")
      .select(sel("id"))
      .eq("email", data.lead.email.toLowerCase())
      .maybeSingle();
    if (existing) throw new Error("A lead with that email already exists in this workspace");

    const { data: created, error } = await context.supabase
      .from("leads")
      .insert({
        ...data.lead,
        email: data.lead.email.toLowerCase(),
        workspace_id: data.workspaceId,
      } as never)
      .select(sel("id"))
      .single();
    if (error) throw new Error(error.message);

    const { emitLeadCreated } = await import("@/lib/lead-events.server");
    await emitLeadCreated({
      workspaceId: data.workspaceId,
      leadIds: [(created as unknown as { id: string }).id],
      inline: true,
    });

    return created as unknown as { id: string };
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), patch: leadWriteSchema.partial() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch = { ...data.patch };
    if (patch.email) patch.email = patch.email.toLowerCase();
    // A status change goes through the shared transition service so the CRM
    // stage, timeline and automations follow; the rest is a plain field edit.
    const status = patch.status;
    delete patch.status;
    // The Leads detail sheet still offers the older stage names; they resolve to
    // the real pipeline stage instead of being written as loose text.
    const legacyStage = (patch as { crm_stage?: string }).crm_stage;
    delete (patch as { crm_stage?: string }).crm_stage;
    const { STAGE_KEY_FOR_LEGACY_CRM_STAGE } = await import("@/lib/lead-stage-map");
    const stageKey = legacyStage ? STAGE_KEY_FOR_LEGACY_CRM_STAGE[legacyStage] : undefined;
    if (Object.keys(patch).length) {
      const { error } = await context.supabase
        .from("leads")
        .update(patch as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    if (status || stageKey) {
      const { applyLeadTransition } = await import("@/lib/lead-transition.server");
      await applyLeadTransition(context.supabase, {
        leadId: data.id,
        ...(status ? { status } : {}),
        ...(stageKey ? { stageKey } : {}),
        actorId: context.userId,
        source: "leads",
      });
    }
    return { ok: true };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ----------------------------------------------------------- bulk actions */

const selectionSchema = z.union([
  z.object({ mode: z.literal("ids"), ids: z.array(z.string().uuid()).max(5000) }),
  z.object({ mode: z.literal("all"), excluded: z.array(z.string().uuid()).max(5000).default([]) }),
]);

const bulkSchema = z.object({
  /** Either an explicit id set, or "everything the current filters match". */
  selection: selectionSchema,
  /** The exact filters the customer is looking at; re-applied server-side. */
  filters: filtersSchema.default({}),
  action: z.enum([
    "add_to_list",
    "remove_from_list",
    "add_tag",
    "remove_tag",
    "set_status",
    "add_to_campaign",
    "remove_from_campaign",
    "delete",
  ]),
  listId: z.string().uuid().nullable().optional(),
  campaignId: z.string().uuid().optional(),
  tag: z.string().trim().max(40).optional(),
  status: z.string().trim().max(40).optional(),
  workspaceId: z.string().uuid().optional(),
});

export type BulkLeadResult = {
  affected: number;
  failed: number;
  reasons: Array<{ count: number; reason: string }>;
  /** Deletes are capped per call so one request stays short; >0 means call again. */
  remaining?: number;
};

/** Ids deleted in a single request; the client loops until nothing remains. */
const DELETE_CAP = 1000;

export const bulkLeadAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => bulkSchema.parse(input))
  .handler(async ({ data, context }): Promise<BulkLeadResult> => {
    const { supabase } = context;
    const { resolveSelectionIds } = await import("@/lib/leads-bulk.server");

    const filters = { ...data.filters, ...(data.workspaceId ? { workspaceId: data.workspaceId } : {}) };

    // Never trust ids from the browser: they are re-resolved through the
    // caller's own RLS-scoped client with the active filters applied.
    const ids = await resolveSelectionIds(supabase, filters, data.selection);

    const requested =
      data.selection.mode === "ids" ? data.selection.ids.length : ids.length;
    const reasons: Array<{ count: number; reason: string }> = [];
    const dropped = Math.max(0, requested - ids.length);
    if (dropped > 0) {
      reasons.push({ count: dropped, reason: "Not available in your workspace anymore" });
    }
    if (ids.length === 0) return { affected: 0, failed: dropped, reasons };

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

    if (data.action === "delete") {
      // Large selections are deleted in capped slices: each request stays well
      // inside the statement timeout and the caller repeats until none remain.
      const work = ids.slice(0, DELETE_CAP);
      const remaining = Math.max(0, ids.length - work.length);
      let affected = 0;
      for (let i = 0; i < work.length; i += 200) {
        const chunk = work.slice(i, i + 200);
        const { data: rows, error } = await supabase
          .from("leads")
          .delete()
          .in("id", chunk)
          .select(sel("id"))
          .returns<Array<{ id: string }>>();
        if (error) throw new Error(error.message);
        affected += (rows ?? []).length;
      }
      return { affected, failed: dropped + (work.length - affected), reasons, remaining };
    }

    if (data.action === "add_to_list" || data.action === "remove_from_list") {
      let listId: string | null = null;
      if (data.action === "add_to_list") {
        if (!data.listId) throw new Error("Pick a list first");
        // Destination list must be readable by the caller and live in the same
        // workspace as every lead being moved.
        const { data: list, error: listErr } = await supabase
          .from("lead_lists")
          .select(sel("id, workspace_id"))
          .eq("id", data.listId)
          .maybeSingle();
        if (listErr) throw new Error(listErr.message);
        if (!list) throw new Error("That list is not available in your workspace");
        const listWorkspaceId = (list as unknown as { workspace_id: string }).workspace_id;
        listId = data.listId;

        for (const chunk of chunks) {
          const { data: rows, error } = await supabase
            .from("leads")
            .select(sel("id, workspace_id"))
            .in("id", chunk)
            .neq("workspace_id", listWorkspaceId)
            .returns<Array<{ id: string }>>();
          if (error) throw new Error(error.message);
          if ((rows ?? []).length) {
            throw new Error("Those leads belong to a different workspace than the destination list");
          }
        }
      }

      let affected = 0;
      for (const chunk of chunks) {
        const { data: rows, error } = await supabase
          .from("leads")
          .update({ list_id: listId })
          .in("id", chunk)
          .select(sel("id"))
          .returns<Array<{ id: string }>>();
        if (error) throw new Error(error.message);
        affected += (rows ?? []).length;
      }
      const failed = dropped + (ids.length - affected);
      if (ids.length - affected > 0) {
        reasons.push({ count: ids.length - affected, reason: "Update rejected by workspace rules" });
      }
      return { affected, failed, reasons };
    }

    if (data.action === "set_status") {
      if (!data.status) throw new Error("Pick a status first");
      let affected = 0;
      const touched: string[] = [];
      // Same status → stage mapping as every other entry point, resolved once
      // for the workspace so a bulk change lands on the CRM board too.
      const { resolveStageForStatus, stagePatchForStatus } = await import(
        "@/lib/lead-transition.server"
      );
      const { data: firstLead } = await supabase
        .from("leads")
        .select(sel("workspace_id"))
        .eq("id", ids[0] as string)
        .maybeSingle();
      const workspaceId = (firstLead as { workspace_id?: string } | null)?.workspace_id ?? null;
      const stage = workspaceId
        ? await resolveStageForStatus(supabase, workspaceId, data.status)
        : null;
      const statusPatch = stagePatchForStatus(data.status, stage);
      for (const chunk of chunks) {
        const { data: rows, error } = await supabase
          .from("leads")
          .update(statusPatch as never)
          .in("id", chunk)
          .select(sel("id"))
          .returns<Array<{ id: string }>>();
        if (error) throw new Error(error.message);
        affected += (rows ?? []).length;
        for (const r of rows ?? []) touched.push(r.id);
      }
      if (workspaceId && touched.length) {
        const detail = stage
          ? `Lead status set to ${data.status} and moved to ${stage.name} (via Leads bulk action)`
          : `Lead status set to ${data.status} (via Leads bulk action)`;
        for (let i = 0; i < touched.length; i += 200) {
          const rows = touched.slice(i, i + 200).map((leadId) => ({
            lead_id: leadId,
            workspace_id: workspaceId,
            type: "status_changed",
            detail,
          }));
          await supabase.from("lead_activities").insert(rows as never);
        }
      }
      const { sentimentForStatus } = await import("@/lib/positive-reply-sentiment");
      if (touched.length && sentimentForStatus(data.status)) {
        const { syncLeadReplySentiment } = await import("@/lib/positive-reply-sentiment.server");
        for (const id of touched) await syncLeadReplySentiment(supabase, id, data.status);
      }
      return { affected, failed: dropped + (ids.length - affected), reasons };
    }

    if (data.action === "add_tag" || data.action === "remove_tag") {
      const tag = data.tag?.trim();
      if (!tag) throw new Error("Enter a tag first");
      let affected = 0;
      for (const chunk of chunks) {
        const { data: rows, error } = await supabase
          .from("leads")
          .select(sel("id, tags"))
          .in("id", chunk)
          .returns<Array<{ id: string; tags: string[] | null }>>();
        if (error) throw new Error(error.message);
        for (const row of rows ?? []) {
          const current = row.tags ?? [];
          const next =
            data.action === "add_tag"
              ? current.includes(tag)
                ? current
                : [...current, tag]
              : current.filter((t) => t !== tag);
          if (next === current) continue;
          const { error: upErr } = await supabase
            .from("leads")
            .update({ tags: next })
            .eq("id", row.id);
          if (upErr) throw new Error(upErr.message);
          affected += 1;
        }
      }
      return { affected, failed: dropped, reasons };
    }

    if (!data.campaignId) throw new Error("Pick a campaign first");

    if (data.action === "remove_from_campaign") {
      let affected = 0;
      for (const chunk of chunks) {
        const { data: rows, error } = await supabase
          .from("campaign_recipients")
          .delete()
          .eq("campaign_id", data.campaignId)
          .in("lead_id", chunk)
          .select(sel("id"))
          .returns<Array<{ id: string }>>();
        if (error) throw new Error(error.message);
        affected += (rows ?? []).length;
      }
      return { affected, failed: dropped, reasons };
    }

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select(sel("id, workspace_id"))
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");
    const campaignWorkspaceId = (campaign as unknown as { workspace_id: string }).workspace_id;

    let affected = 0;
    let skipped = 0;
    for (const chunk of chunks) {
      // Every selected lead must live in the campaign's workspace, otherwise the
      // recipient insert would cross tenants (and RLS would reject it).
      const { data: leadRows, error: lErr } = await supabase
        .from("leads")
        .select(sel("id, workspace_id"))
        .in("id", chunk)
        .returns<Array<{ id: string; workspace_id: string }>>();
      if (lErr) throw new Error(lErr.message);
      if ((leadRows ?? []).some((l) => l.workspace_id !== campaignWorkspaceId)) {
        throw new Error("That campaign belongs to a different workspace");
      }

      const { data: existing } = await supabase
        .from("campaign_recipients")
        .select(sel("lead_id"))
        .eq("campaign_id", data.campaignId)
        .in("lead_id", chunk)
        .returns<Array<{ lead_id: string }>>();
      const already = new Set((existing ?? []).map((r) => r.lead_id));
      const toInsert = chunk
        .filter((id) => !already.has(id))
        .map((id) => ({
          campaign_id: data.campaignId!,
          workspace_id: campaignWorkspaceId,
          lead_id: id,
          current_step: 0,
          status: "pending" as const,
        }));
      skipped += chunk.length - toInsert.length;
      if (toInsert.length === 0) continue;
      const { error } = await supabase
        .from("campaign_recipients")
        .insert(toInsert as never);
      if (error) throw new Error(error.message);
      affected += toInsert.length;
    }
    if (skipped > 0) reasons.push({ count: skipped, reason: "Already in this campaign" });
    return { affected, failed: dropped, reasons };
  });


/* ---------------------------------------------------------------- import */

const rowSchema = z.object({
  _row: z.number().int().min(1).optional(),
  email: z.string().trim().email(),
  first_name: z.string().trim().max(120).optional(),
  last_name: z.string().trim().max(120).optional(),
  company: z.string().trim().max(160).optional(),
  job_title: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(60).optional(),
  website: z.string().trim().max(MAX_WEBSITE_LENGTH).optional(),
  linkedin_url: z.string().trim().max(MAX_WEBSITE_LENGTH).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  custom_fields: z.record(z.string(), z.string()).optional(),
});

export type ImportRowError = { row: number; field: string; reason: string; email: string };


export const checkImportDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ emails: z.array(z.string().trim().max(320)).min(1).max(10000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const emails = Array.from(new Set(data.emails.map((e) => e.toLowerCase())));
    const found = new Set<string>();
    for (let i = 0; i < emails.length; i += 500) {
      const { data: rows, error } = await context.supabase
        .from("leads")
        .select(sel("email"))
        .in("email", emails.slice(i, i + 500))
        .returns<Array<{ email: string }>>();
      if (error) throw new Error(error.message);
      for (const row of rows ?? []) found.add(row.email);
    }
    return { existing: Array.from(found) };
  });

/** Human label for a failed field, used in the import summary. */
const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
  company: "Company",
  job_title: "Job title",
  phone: "Phone",
  website: "Website",
  linkedin_url: "LinkedIn",
  city: "City",
  state: "State",
  country: "Country",
  custom_fields: "Custom fields",
};

/** Shown when a customer imports a list they have not verified. */
export const UNVERIFIED_LIST_MESSAGE =
  "This list cannot be imported because it has not been verified. Please verify your email list before importing it into MunchReach.";

export const importLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        listId: z.string().uuid().nullable().optional(),
        tags: z.array(z.string().trim().max(40)).max(10).optional(),
        // The customer must confirm the list is verified before any contact is
        // inserted; an unverified list is rejected outright.
        listVerified: z.boolean().optional(),
        // Rows stay loose here on purpose: a single bad cell must never reject the batch.
        rows: z.array(z.record(z.string(), z.unknown())).min(1).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.listVerified !== true) throw new Error(UNVERIFIED_LIST_MESSAGE);


    const seen = new Set<string>();
    const cleaned: Array<Record<string, unknown>> = [];
    const failed: Array<{ row: number; field: string; reason: string; email: string }> = [];
    let duplicatesInFile = 0;

    data.rows.forEach((raw, index) => {
      const rowNumber = typeof raw["_row"] === "number" ? (raw["_row"] as number) : index + 1;
      const rawEmail = typeof raw["email"] === "string" ? raw["email"] : "";

      // Website is validated with the shared URL rules, never truncated.
      const site = validateWebsite(raw["website"]);
      if (!site.ok) {
        failed.push({ row: rowNumber, field: "Website", reason: site.reason, email: rawEmail });
        return;
      }

      const parsed = rowSchema.safeParse({ ...raw, website: site.value ?? undefined });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const key = String(issue?.path?.[0] ?? "row");
        failed.push({
          row: rowNumber,
          field: FIELD_LABELS[key] ?? key,
          reason: issue?.message ?? "Invalid value",
          email: rawEmail,
        });
        return;
      }

      const row = parsed.data;
      const email = row.email.toLowerCase();
      if (seen.has(email)) {
        duplicatesInFile += 1;
        return;
      }
      seen.add(email);
      cleaned.push({
        workspace_id: data.workspaceId,
        list_id: data.listId ?? null,
        email,
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        company: row.company || null,
        job_title: row.job_title || null,
        phone: row.phone || null,
        website: row.website || null,
        linkedin_url: row.linkedin_url || null,
        city: row.city || null,
        state: row.state || null,
        country: row.country || null,
        tags: data.tags ?? [],
        custom_fields: row.custom_fields ?? {},
      });
    });

    const emails = Array.from(seen);
    const existingEmails = new Set<string>();
    for (let i = 0; i < emails.length; i += 500) {
      const { data: existing, error } = await context.supabase
        .from("leads")
        .select(sel("email"))
        .in("email", emails.slice(i, i + 500))
        .returns<Array<{ email: string }>>();
      if (error) throw new Error(error.message);
      for (const row of existing ?? []) existingEmails.add(row.email);
    }

    const toInsert = cleaned.filter((row) => !existingEmails.has(row["email"] as string));

    // Imports must fit inside the plan's lead allowance.
    const { checkUsageLimit } = await import("@/lib/billing/usage.server");
    if (toInsert.length) await checkUsageLimit(data.workspaceId, "leads", toInsert.length);

    let inserted = 0;
    const insertedIds: string[] = [];
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { data: rows, error } = await context.supabase
        .from("leads")
        .insert(chunk as never)
        .select(sel("id"))
        .returns<Array<{ id: string }>>();
      if (error) throw new Error(error.message);
      for (const row of rows ?? []) insertedIds.push(row.id);
      inserted += chunk.length;
    }

    if (insertedIds.length) {
      const { emitLeadCreated } = await import("@/lib/lead-events.server");
      await emitLeadCreated({ workspaceId: data.workspaceId, leadIds: insertedIds });
    }

    return {
      received: data.rows.length,
      inserted,
      duplicatesInFile,
      duplicatesInWorkspace: existingEmails.size,
      failed,

    };
  });

/* ---------------------------------------------------------- notes & tasks */

export const addLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_notes").insert({
      lead_id: data.leadId,
      workspace_id: data.workspaceId,
      author_id: context.userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addLeadTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        title: z.string().trim().min(1).max(200),
        dueAt: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_tasks").insert({
      lead_id: data.leadId,
      workspace_id: data.workspaceId,
      created_by: context.userId,
      title: data.title,
      due_at: data.dueAt ? new Date(data.dueAt).toISOString() : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setLeadTaskCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), completed: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_tasks")
      .update({ completed: data.completed })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
