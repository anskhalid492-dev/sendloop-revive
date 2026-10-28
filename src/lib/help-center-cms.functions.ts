import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HELP_ARTICLES } from "./help-center";
import { helpArticleSchema, rowToHelpArticle, type HelpCmsRow } from "./help-center-cms";

export const listPublicHelpArticles = createServerFn({ method: "GET" }).handler(async () => {
  const { publicContentClient } = await import("./trust-center.server");
  const { readHelpCatalogue } = await import("./help-center-cms.server");
  return readHelpCatalogue(await publicContentClient());
});

export const listAdminHelpArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { HELP_CMS_COLUMNS } = await import("./help-center-cms.server");
    const rows: HelpCmsRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await (context.supabase as any).from("guide_articles")
        .select(HELP_CMS_COLUMNS).eq("help_center", true).order("id").range(offset, offset + 999);
      if (error) throw new Error("Help Center setup is required. Apply the Help Center CMS SQL before editing articles.");
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
    const overridden = new Set(rows.map((r) => r.slug));
    return [
      ...HELP_ARTICLES.filter((a) => !overridden.has(a.slug)).map((a) => ({ ...a, id: undefined, published: true, deleted: false })),
      ...rows.map((r) => ({ ...rowToHelpArticle(r), id: r.id, published: r.published, deleted: Boolean(r.deleted_at) })),
    ];
  });

export const saveHelpArticle = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => helpArticleSchema.parse(input)).handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const db = context.supabase as any;
    const { data: existing, error: readError } = await db.from("guide_articles")
      .select("id,slug,help_center,help_metadata").eq("slug", data.slug).maybeSingle();
    if (readError) throw new Error("Could not check article identity");
    if (existing && (!existing.help_center || (data.id && existing.id !== data.id))) throw new Error("That slug is already used by another article");
    if (data.id) {
      const { data: current, error } = await db.from("guide_articles").select("slug,help_center").eq("id", data.id).single();
      if (error || !current?.help_center || current.slug !== data.slug) throw new Error("Existing article slugs cannot be changed");
    }
    const original = HELP_ARTICLES.find((a) => a.slug === data.slug);
    const metadata = { ...(original ?? {}), ...(existing?.help_metadata ?? {}), seoTitle: data.seoTitle, metaDescription: data.metaDescription };
    const row = { slug: data.slug, title: data.title, category: data.category, summary: data.description,
      body: data.content, published: data.published, help_center: true, help_metadata: metadata, deleted_at: null };
    const id = data.id ?? existing?.id;
    const query = id ? db.from("guide_articles").update(row).eq("id", id).eq("help_center", true) : db.from("guide_articles").insert(row);
    const { data: saved, error } = await query.select("id").single();
    if (error) throw new Error("Article could not be saved. Check the slug and Help Center setup.");
    return { id: saved.id as string };
  });

/** Reversible deletion preserves the original content and built-in override. */
export const deleteHelpArticle = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slug: z.string().min(2).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const db = context.supabase as any;
    const { data: row, error: lookupError } = await db.from("guide_articles").select("id,help_center").eq("slug", data.slug).maybeSingle();
    if (lookupError || (row && !row.help_center)) throw new Error("Article could not be removed");
    const original = HELP_ARTICLES.find((a) => a.slug === data.slug);
    if (!row && !original) throw new Error("Article not found");
    const deleted = { published: false, deleted_at: new Date().toISOString() };
    const query = row ? db.from("guide_articles").update(deleted).eq("id", row.id).eq("help_center", true)
      : db.from("guide_articles").insert({ ...deleted, help_center: true, slug: original?.slug,
        title: original?.title, category: original?.category, summary: original?.description, body: original?.content, help_metadata: original });
    const { error } = await query;
    if (error) throw new Error("Article could not be removed");
    return { ok: true };
  });