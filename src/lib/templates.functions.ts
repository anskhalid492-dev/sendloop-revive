/**
 * Template library.
 *
 * Official MunchReach templates have `workspace_id = null` and `is_official = true`;
 * customer templates always belong to a workspace. RLS is the real boundary:
 * customers can only write rows in workspaces where they hold a manager role,
 * and only platform admins can touch official rows. The checks below give
 * friendlier errors on top of that.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  TEMPLATE_COLUMNS,
  extractTemplateVariables,
  type EmailTemplateRow,
} from "@/lib/templates-model";

async function isPlatformAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

const templateInput = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid().nullable(),
  isOfficial: z.boolean().default(false),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).nullable().optional(),
  subject: z.string().max(300).default(""),
  body: z.string().max(20000).default(""),
  featured: z.boolean().default(false),
  published: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(9999).default(0),
});

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const query = context.supabase
      .from("email_templates")
      .select(TEMPLATE_COLUMNS)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    const { data: rows, error } = data.workspaceId
      ? await query.or(`is_official.eq.true,workspace_id.eq.${data.workspaceId}`)
      : await query.eq("is_official", true);
    if (error) throw new Error(error.message);

    let recent: string[] = [];
    if (data.workspaceId) {
      const { data: uses } = await context.supabase
        .from("template_uses")
        .select("template_id, used_at")
        .eq("workspace_id", data.workspaceId)
        .order("used_at", { ascending: false })
        .limit(40);
      const seen = new Set<string>();
      for (const use of uses ?? []) {
        if (!seen.has(use.template_id)) seen.add(use.template_id);
      }
      recent = [...seen].slice(0, 8);
    }

    const templates = ((rows ?? []) as unknown as EmailTemplateRow[]).filter(
      (t) => !t.is_official || t.published || false,
    );
    return { templates, recent };
  });

/** Admin view: every official template, published or not. */
export const listOfficialTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Forbidden: admin role required");
    const { data, error } = await context.supabase
      .from("email_templates")
      .select(TEMPLATE_COLUMNS)
      .eq("is_official", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as EmailTemplateRow[];
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => templateInput.parse(input))
  .handler(async ({ data, context }) => {
    const official = data.isOfficial;
    if (official && !(await isPlatformAdmin(context)))
      throw new Error("Only MunchReach staff can manage official templates.");
    if (!official && !data.workspaceId) throw new Error("Pick a workspace for this template.");

    const row = {
      workspace_id: official ? null : data.workspaceId,
      is_official: official,
      name: data.name,
      category: data.category,
      description: data.description ?? null,
      subject: data.subject,
      body: data.body,
      variables: extractTemplateVariables(data.subject, data.body),
      featured: data.featured,
      published: data.published,
      display_order: data.displayOrder,
      created_by: context.userId,
    };

    if (data.id) {
      const { created_by: _skip, ...patch } = row;
      const { data: updated, error } = await context.supabase
        .from("email_templates")
        .update(patch)
        .eq("id", data.id)
        .select(TEMPLATE_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) throw new Error("You cannot edit this template.");
      return updated as unknown as EmailTemplateRow;
    }

    const { data: created, error } = await context.supabase
      .from("email_templates")
      .insert(row)
      .select(TEMPLATE_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return created as unknown as EmailTemplateRow;
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("email_templates")
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("You cannot delete this template.");
    return { ok: true };
  });

export const duplicateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        workspaceId: z.string().uuid().nullable().optional(),
        asOfficial: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: source, error } = await context.supabase
      .from("email_templates")
      .select(TEMPLATE_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!source) throw new Error("Template not found");
    const t = source as unknown as EmailTemplateRow;

    const official = Boolean(data.asOfficial);
    if (official && !(await isPlatformAdmin(context)))
      throw new Error("Only MunchReach staff can manage official templates.");
    if (!official && !data.workspaceId) throw new Error("Pick a workspace for this copy.");

    const { data: copy, error: insErr } = await context.supabase
      .from("email_templates")
      .insert({
        workspace_id: official ? null : (data.workspaceId ?? null),
        is_official: official,
        name: `${t.name} (copy)`,
        category: t.category,
        description: t.description,
        subject: t.subject,
        body: t.body,
        variables: t.variables,
        featured: false,
        published: official ? false : true,
        display_order: t.display_order,
        created_by: context.userId,
      })
      .select(TEMPLATE_COLUMNS)
      .maybeSingle();
    if (insErr) throw new Error(insErr.message);
    return copy as unknown as EmailTemplateRow;
  });

export const recordTemplateUse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ templateId: z.string().uuid(), workspaceId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("template_uses").insert({
      template_id: data.templateId,
      workspace_id: data.workspaceId,
      user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
