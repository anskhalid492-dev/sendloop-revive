/**
 * Contact (lead) endpoints for the public API.
 *
 * Contacts are workspace-scoped on every read and write. Creation upserts on
 * (workspace, email) so integrations that replay their source data update the
 * existing record instead of duplicating a prospect — the same rule the
 * dashboard import and the integrations webhook already follow.
 */
import { z } from "zod";

import { ApiError } from "../errors";
import { decodeCursor, paginate, parseLimit } from "../pagination";
import { serializeContact } from "../serializers";
import type { ApiContext } from "../runtime.server";
import { parseQuery, parseWith, pathId } from "../validate";

const FIELDS =
  "id, workspace_id, email, first_name, last_name, company, job_title, phone, website, linkedin_url, city, state, country, status, crm_stage, stage_id, list_id, owner_id, tags, deal_value, lead_source, custom_fields, archived, last_activity_at, created_at, updated_at";

const contactSchema = z
  .object({
    email: z.string().email().max(320),
    first_name: z.string().max(120).nullish(),
    last_name: z.string().max(120).nullish(),
    company: z.string().max(200).nullish(),
    job_title: z.string().max(200).nullish(),
    phone: z.string().max(50).nullish(),
    website: z.string().max(500).nullish(),
    linkedin_url: z.string().max(500).nullish(),
    city: z.string().max(120).nullish(),
    state: z.string().max(120).nullish(),
    country: z.string().max(120).nullish(),
    status: z.enum(["new", "contacted", "replied", "bounced", "unsubscribed", "won", "lost"]).optional(),
    list_id: z.string().uuid().nullish(),
    tags: z.array(z.string().min(1).max(50)).max(50).optional(),
    deal_value: z.number().min(0).max(1_000_000_000).nullish(),
    lead_source: z.string().max(120).nullish(),
    custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  })
  .strict();

const contactPatchSchema = contactSchema.partial().strict();

function toRow(input: z.infer<typeof contactPatchSchema>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  if (input.email) out["email"] = input.email.trim().toLowerCase();
  return out;
}

export async function listContacts(ctx: ApiContext) {
  const q = parseQuery(
    z
      .object({
        limit: z.string().optional(),
        cursor: z.string().optional(),
        search: z.string().max(200).optional(),
        status: z.string().max(60).optional(),
        list_id: z.string().uuid().optional(),
        tag: z.string().max(50).optional(),
        archived: z.enum(["true", "false"]).optional(),
      })
      .passthrough(),
    ctx.url,
  );
  const limit = parseLimit(q.limit ?? null);

  let query = ctx.admin
    .from("leads")
    .select(FIELDS)
    .eq("workspace_id", ctx.auth.workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  query = query.eq("archived", q.archived === "true");
  if (q.status) query = query.in("status", q.status.split(",").map((s) => s.trim()));
  if (q.list_id) query = query.eq("list_id", q.list_id);
  if (q.tag) query = query.contains("tags", [q.tag]);
  if (q.search) {
    const term = q.search.replace(/[%_,]/g, "");
    query = query.or(
      `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,company.ilike.%${term}%`,
    );
  }
  if (q.cursor) {
    const cursor = decodeCursor(q.cursor);
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new ApiError("internal_error", "Could not list contacts.");
  const page = paginate(data ?? [], limit, (row: { created_at: string; id: string }) => ({
    createdAt: row.created_at,
    id: row.id,
  }));
  return { object: "list", ...page, data: page.data.map(serializeContact) };
}

export async function createContact(ctx: ApiContext) {
  const input = parseWith(contactSchema, ctx.body);
  const row = toRow(input);

  // Upsert hides whether this was a create or an update, so ask first: only a
  // genuinely new contact may fire `lead.created`.
  const { data: existing } = await ctx.admin
    .from("leads")
    .select("id")
    .eq("workspace_id", ctx.auth.workspaceId)
    .eq("email", row["email"] as string)
    .maybeSingle();

  const { data, error } = await ctx.admin
    .from("leads")
    .upsert({ ...row, workspace_id: ctx.auth.workspaceId }, { onConflict: "workspace_id,email" })
    .select(FIELDS)
    .single();
  if (error) throw new ApiError("invalid_request", "The contact could not be saved.", {
    details: { reason: error.message },
  });

  if (!existing) {
    const { emitLeadCreated } = await import("@/lib/lead-events.server");
    await emitLeadCreated({
      workspaceId: ctx.auth.workspaceId,
      leadIds: [data.id as string],
      inline: true,
    });
  }
  return { data: serializeContact(data) };
}

async function loadContact(ctx: ApiContext, id: string) {
  const { data } = await ctx.admin
    .from("leads")
    .select(FIELDS)
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId)
    .maybeSingle();
  if (!data) throw new ApiError("contact_not_found", "No contact with that id exists.");
  return data;
}

export async function getContact(ctx: ApiContext) {
  const id = pathId(ctx.params["contactId"], "contact id");
  return { data: serializeContact(await loadContact(ctx, id)) };
}

export async function updateContact(ctx: ApiContext) {
  const id = pathId(ctx.params["contactId"], "contact id");
  await loadContact(ctx, id);
  const patch = toRow(parseWith(contactPatchSchema, ctx.body));
  if (Object.keys(patch).length === 0) {
    throw new ApiError("invalid_request", "Provide at least one field to update.");
  }
  const { data, error } = await ctx.admin
    .from("leads")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId)
    .select(FIELDS)
    .single();
  if (error) throw new ApiError("invalid_request", "The contact could not be updated.", {
    details: { reason: error.message },
  });
  return { data: serializeContact(data) };
}

export async function deleteContact(ctx: ApiContext) {
  const id = pathId(ctx.params["contactId"], "contact id");
  await loadContact(ctx, id);
  const { error } = await ctx.admin
    .from("leads")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId);
  if (error) throw new ApiError("conflict", "The contact could not be deleted.");
  return { data: { id, object: "contact", deleted: true } };
}

// ---------------------------------------------------------------------------
// Bulk
// ---------------------------------------------------------------------------

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    contacts: z.array(contactSchema).min(1).max(1000),
  }),
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string().uuid()).min(1).max(1000),
  }),
  z.object({
    action: z.literal("archive"),
    ids: z.array(z.string().uuid()).min(1).max(1000),
    archived: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("tag"),
    ids: z.array(z.string().uuid()).min(1).max(1000),
    add: z.array(z.string().min(1).max(50)).max(25).default([]),
    remove: z.array(z.string().min(1).max(50)).max(25).default([]),
  }),
  z.object({
    action: z.literal("move_list"),
    ids: z.array(z.string().uuid()).min(1).max(1000),
    list_id: z.string().uuid().nullable(),
  }),
]);

export async function bulkContacts(ctx: ApiContext) {
  const input = parseWith(bulkSchema, ctx.body);
  const workspaceId = ctx.auth.workspaceId;

  if (input.action === "upsert") {
    const rows = input.contacts.map((c) => ({ ...toRow(c), workspace_id: workspaceId }));

    // Which of these emails already exist? Only the rest are new leads.
    const emails = rows
      .map((r) => (r as Record<string, unknown>)["email"] as string | undefined)
      .filter((email): email is string => Boolean(email));
    const existingEmails = new Set<string>();
    for (let i = 0; i < emails.length; i += 500) {
      const { data: found } = await ctx.admin
        .from("leads")
        .select("email")
        .eq("workspace_id", workspaceId)
        .in("email", emails.slice(i, i + 500));
      for (const row of (found ?? []) as Array<{ email: string }>) existingEmails.add(row.email);
    }

    const { data, error } = await ctx.admin
      .from("leads")
      .upsert(rows, { onConflict: "workspace_id,email" })
      .select("id, email");
    if (error) throw new ApiError("invalid_request", "The contacts could not be saved.", {
      details: { reason: error.message },
    });

    const newIds = ((data ?? []) as Array<{ id: string; email: string }>)
      .filter((row) => !existingEmails.has(row.email))
      .map((row) => row.id);
    if (newIds.length) {
      const { emitLeadCreated } = await import("@/lib/lead-events.server");
      await emitLeadCreated({ workspaceId, leadIds: newIds });
    }

    return { data: { action: input.action, processed: data?.length ?? 0 } };
  }

  // Every other action is id-based: restrict to ids that really are ours, so a
  // foreign id is a silent no-op rather than a cross-workspace write.
  const { data: owned } = await ctx.admin
    .from("leads")
    .select("id, tags")
    .eq("workspace_id", workspaceId)
    .in("id", input.ids);
  const ownedRows = (owned ?? []) as Array<{ id: string; tags: string[] | null }>;
  const ownedIds = ownedRows.map((r) => r.id);
  const skipped = input.ids.filter((id) => !ownedIds.includes(id));

  if (ownedIds.length === 0) {
    return { data: { action: input.action, processed: 0, skipped } };
  }

  if (input.action === "delete") {
    const { error } = await ctx.admin
      .from("leads")
      .delete()
      .eq("workspace_id", workspaceId)
      .in("id", ownedIds);
    if (error) throw new ApiError("conflict", "The contacts could not be deleted.");
  } else if (input.action === "archive") {
    const { error } = await ctx.admin
      .from("leads")
      .update({ archived: input.archived })
      .eq("workspace_id", workspaceId)
      .in("id", ownedIds);
    if (error) throw new ApiError("conflict", "The contacts could not be archived.");
  } else if (input.action === "move_list") {
    const { error } = await ctx.admin
      .from("leads")
      .update({ list_id: input.list_id })
      .eq("workspace_id", workspaceId)
      .in("id", ownedIds);
    if (error) throw new ApiError("conflict", "The contacts could not be moved.");
  } else {
    // Tags are per-row set arithmetic, so this one cannot be a single update.
    for (const row of ownedRows) {
      const next = new Set(row.tags ?? []);
      for (const tag of input.add) next.add(tag);
      for (const tag of input.remove) next.delete(tag);
      await ctx.admin
        .from("leads")
        .update({ tags: [...next] })
        .eq("id", row.id)
        .eq("workspace_id", workspaceId);
    }
  }

  return { data: { action: input.action, processed: ownedIds.length, skipped } };
}

/** Streams the workspace's contacts as CSV. Bounded, so it stays a single call. */
export async function exportContacts(ctx: ApiContext): Promise<Response> {
  const q = parseQuery(
    z.object({ list_id: z.string().uuid().optional(), limit: z.string().optional() }).passthrough(),
    ctx.url,
  );
  const max = Math.min(Number(q.limit ?? 5000) || 5000, 10000);

  let query = ctx.admin
    .from("leads")
    .select(FIELDS)
    .eq("workspace_id", ctx.auth.workspaceId)
    .order("created_at", { ascending: false })
    .limit(max);
  if (q.list_id) query = query.eq("list_id", q.list_id);

  const { data, error } = await query;
  if (error) throw new ApiError("internal_error", "Could not export contacts.");

  const columns = [
    "id",
    "email",
    "first_name",
    "last_name",
    "company",
    "job_title",
    "phone",
    "website",
    "linkedin_url",
    "city",
    "state",
    "country",
    "status",
    "tags",
    "lead_source",
    "created_at",
  ];
  const escape = (value: unknown) => {
    const text = Array.isArray(value) ? value.join("|") : value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [
    columns.join(","),
    ...(data ?? []).map((row: Record<string, unknown>) => columns.map((c) => escape(row[c])).join(",")),
  ].join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="contacts.csv"',
      "x-request-id": ctx.requestId,
      "cache-control": "no-store",
    },
  });
}
