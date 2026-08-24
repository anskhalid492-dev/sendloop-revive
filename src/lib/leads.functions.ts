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

    let leadCountQuery = context.supabase
      .from("leads")
      .select(sel("list_id"));
    if (input.workspaceId) leadCountQuery = leadCountQuery.eq("workspace_id", input.workspaceId);
    const { data: leadRows, error: countError } = await leadCountQuery
      .returns<Array<{ list_id: string | null }>>();
    if (countError) throw new Error(countError.message);

    return (data ?? []).map((list) => ({
      ...list,
      leadCount: (leadRows ?? []).filter((l) => l.list_id === list.id).length,
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

export const deleteLeadList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), deleteLeads: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.deleteLeads) {
      const { error } = await context.supabase.from("leads").delete().eq("list_id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("leads")
        .update({ list_id: null })
        .eq("list_id", data.id);
      if (error) throw new Error(error.message);
    }
    const { error } = await context.supabase.from("lead_lists").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ leads */

function escapeLike(value: string) {
  return value.replace(/[%,()]/g, " ").trim();
}

export const listLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const input: ListInput = data;

    let restrictIds: string[] | null = null;
    if (input.campaignId) {
      const { data: recipients, error } = await context.supabase
        .from("campaign_recipients")
        .select(sel("lead_id"))
        .eq("campaign_id", input.campaignId)
        .returns<Array<{ lead_id: string }>>();
      if (error) throw new Error(error.message);
      restrictIds = (recipients ?? []).map((r) => r.lead_id);
      if (restrictIds.length === 0) return { rows: [] as LeadRow[], total: 0 };
    }

    let query = context.supabase
      .from("leads")
      .select(sel(LEAD_SELECT), { count: "exact" })
      .order(input.sortBy, { ascending: input.sortDir === "asc", nullsFirst: false });

    if (input.workspaceId) query = query.eq("workspace_id", input.workspaceId);
    if (input.listId) query = query.eq("list_id", input.listId);
    if (restrictIds) query = query.in("id", restrictIds);
    if (input.statuses?.length) query = query.in("status", input.statuses);
    if (input.tags?.length) query = query.contains("tags", input.tags);
    if (input.email) query = query.ilike("email", `%${escapeLike(input.email)}%`);
    if (input.company) query = query.ilike("company", `%${escapeLike(input.company)}%`);
    if (input.jobTitle) query = query.ilike("job_title", `%${escapeLike(input.jobTitle)}%`);
    if (input.createdFrom) query = query.gte("created_at", input.createdFrom);
    if (input.createdTo) query = query.lte("created_at", `${input.createdTo}T23:59:59`);
    if (input.name) {
      const term = escapeLike(input.name);
      query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
    }
    if (input.location) {
      const term = escapeLike(input.location);
      query = query.or(`city.ilike.%${term}%,state.ilike.%${term}%,country.ilike.%${term}%`);
    }
    if (input.search) {
      const term = escapeLike(input.search);
      query = query.or(
        `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,company.ilike.%${term}%`,
      );
    }
    if (input.customKey && input.customValue) {
      query = query.contains("custom_fields", { [input.customKey]: input.customValue });
    }

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
    const { error } = await context.supabase
      .from("leads")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
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

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(2000),
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
  listId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  tag: z.string().trim().max(40).optional(),
  status: z.string().trim().max(40).optional(),
  workspaceId: z.string().uuid().optional(),
});

export const bulkLeadAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => bulkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    if (data.action === "delete") {
      const { error } = await supabase.from("leads").delete().in("id", data.ids);
      if (error) throw new Error(error.message);
      return { affected: data.ids.length };
    }

    if (data.action === "add_to_list" || data.action === "remove_from_list") {
      const listId = data.action === "add_to_list" ? data.listId : null;
      if (data.action === "add_to_list" && !listId) throw new Error("Pick a list first");
      const { error } = await supabase
        .from("leads")
        .update({ list_id: listId ?? null })
        .in("id", data.ids);
      if (error) throw new Error(error.message);
      return { affected: data.ids.length };
    }

    if (data.action === "set_status") {
      if (!data.status) throw new Error("Pick a status first");
      const { error } = await supabase
        .from("leads")
        .update({ status: data.status })
        .in("id", data.ids);
      if (error) throw new Error(error.message);
      return { affected: data.ids.length };
    }

    if (data.action === "add_tag" || data.action === "remove_tag") {
      const tag = data.tag?.trim();
      if (!tag) throw new Error("Enter a tag first");
      const { data: rows, error } = await supabase
        .from("leads")
        .select(sel("id, tags"))
        .in("id", data.ids)
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
      }
      return { affected: (rows ?? []).length };
    }

    if (!data.campaignId) throw new Error("Pick a campaign first");

    if (data.action === "remove_from_campaign") {
      const { error } = await supabase
        .from("campaign_recipients")
        .delete()
        .eq("campaign_id", data.campaignId)
        .in("lead_id", data.ids);
      if (error) throw new Error(error.message);
      return { affected: data.ids.length };
    }

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select(sel("id, workspace_id"))
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");
    const campaignWorkspaceId = (campaign as unknown as { workspace_id: string }).workspace_id;

    // Every selected lead must live in the campaign's workspace, otherwise the
    // recipient insert would cross tenants (and RLS would reject it).
    const { data: leadRows, error: lErr } = await supabase
      .from("leads")
      .select(sel("id, workspace_id"))
      .in("id", data.ids)
      .returns<Array<{ id: string; workspace_id: string }>>();
    if (lErr) throw new Error(lErr.message);
    if ((leadRows ?? []).length !== data.ids.length) throw new Error("Some leads are no longer available");
    if ((leadRows ?? []).some((l) => l.workspace_id !== campaignWorkspaceId)) {
      throw new Error("That campaign belongs to a different workspace");
    }


    const { data: existing } = await supabase
      .from("campaign_recipients")
      .select(sel("lead_id"))
      .eq("campaign_id", data.campaignId)
      .in("lead_id", data.ids)
      .returns<Array<{ lead_id: string }>>();
    const already = new Set((existing ?? []).map((r) => r.lead_id));
    const toInsert = data.ids
      .filter((id) => !already.has(id))
      .map((id) => ({
        campaign_id: data.campaignId!,
        workspace_id: (campaign as unknown as { workspace_id: string }).workspace_id,
        lead_id: id,
        current_step: 0,
        status: "pending" as const,
      }));

    for (let i = 0; i < toInsert.length; i += 500) {
      const { error } = await supabase
        .from("campaign_recipients")
        .insert(toInsert.slice(i, i + 500) as never);
      if (error) throw new Error(error.message);
    }
    return { affected: toInsert.length };
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

export const importLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        listId: z.string().uuid().nullable().optional(),
        tags: z.array(z.string().trim().max(40)).max(10).optional(),
        // Rows stay loose here on purpose: a single bad cell must never reject the batch.
        rows: z.array(z.record(z.string(), z.unknown())).min(1).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
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
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await context.supabase.from("leads").insert(chunk as never);
      if (error) throw new Error(error.message);
      inserted += chunk.length;
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
