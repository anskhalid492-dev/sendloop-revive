/**
 * Blog content hub.
 *
 * Public reads go through a publishable-key client, so RLS only ever exposes
 * posts that are published. Admin writes re-check the platform admin role on
 * top of the RLS policies.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/config";
import { POST_COLUMNS, type BlogAuthor, type BlogCategory, type BlogPost } from "@/lib/blog-model";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || SUPABASE_PUBLISHABLE_KEY;
  const url = process.env["SUPABASE_URL"] || SUPABASE_URL;
  return import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    }),
  );
}

async function isPlatformAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export type BlogIndexData = {
  featured: BlogPost | null;
  posts: BlogPost[];
  total: number;
  guides: BlogPost[];
  categories: BlogCategory[];
  authors: (BlogAuthor & { post_count: number })[];
};

const listInput = z.object({
  category: z.string().trim().max(80).optional(),
  author: z.string().trim().max(80).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(48).default(12),
  offset: z.number().int().min(0).max(5000).default(0),
});

/** Public: paginated post list with optional category / author / search filters. */
export const listBlogPosts = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => listInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<{ posts: BlogPost[]; total: number }> => {
    const supabase = await publicClient();
    let query = (supabase as any)
      .from("blog_posts")
      .select(POST_COLUMNS, { count: "exact" })
      .order("published_at", { ascending: false });

    if (data.category && data.category !== "all") {
      const { data: cat } = await (supabase as any)
        .from("blog_categories")
        .select("id")
        .eq("slug", data.category)
        .maybeSingle();
      if (!cat) return { posts: [], total: 0 };
      query = query.eq("category_id", cat.id);
    }
    if (data.author) {
      const { data: author } = await (supabase as any)
        .from("blog_authors")
        .select("id")
        .eq("slug", data.author)
        .maybeSingle();
      if (!author) return { posts: [], total: 0 };
      query = query.eq("author_id", author.id);
    }
    if (data.search) {
      const term = data.search.replace(/[%,()]/g, " ").trim();
      if (term) {
        query = query.or(
          [
            `title.ilike.%${term}%`,
            `subtitle.ilike.%${term}%`,
            `excerpt.ilike.%${term}%`,
            `tags.cs.{${term.toLowerCase()}}`,
          ].join(","),
        );
      }
    }

    const { data: rows, error, count } = await query.range(data.offset, data.offset + data.limit - 1);
    if (error) return { posts: [], total: 0 };
    let posts = (rows ?? []) as BlogPost[];

    // Category / author name matches are resolved client-side of the DB query
    // because they live on joined tables.
    if (data.search) {
      const term = data.search.toLowerCase();
      const { data: extra } = await (supabase as any)
        .from("blog_posts")
        .select(POST_COLUMNS)
        .order("published_at", { ascending: false })
        .limit(60);
      const matches = ((extra ?? []) as BlogPost[]).filter(
        (p) =>
          p.category?.name.toLowerCase().includes(term) ||
          p.author?.name.toLowerCase().includes(term) ||
          p.tags.some((t) => t.toLowerCase().includes(term)),
      );
      const seen = new Set(posts.map((p) => p.id));
      for (const m of matches) if (!seen.has(m.id)) posts.push(m);
      posts = posts.slice(0, data.limit);
    }

    return { posts, total: count ?? posts.length };
  });

/** Public: everything the blog index needs in one round trip. */
export const getBlogIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<BlogIndexData> => {
    const supabase = await publicClient();
    const [postsRes, catsRes, authorsRes] = await Promise.all([
      (supabase as any)
        .from("blog_posts")
        .select(POST_COLUMNS, { count: "exact" })
        .order("published_at", { ascending: false })
        .limit(60),
      (supabase as any).from("blog_categories").select("id, slug, name, description, sort_order").order("sort_order"),
      (supabase as any).from("blog_authors").select("id, slug, name, role, bio, avatar_url").order("name"),
    ]);

    const all = ((postsRes.data ?? []) as BlogPost[]);
    const featured = all.find((p) => p.featured) ?? all[0] ?? null;
    const posts = all.filter((p) => p.id !== featured?.id);
    const authors = ((authorsRes.data ?? []) as BlogAuthor[]).map((a) => ({
      ...a,
      post_count: all.filter((p) => p.author?.id === a.id).length,
    }));

    return {
      featured,
      posts,
      total: postsRes.count ?? all.length,
      guides: all.filter((p) => p.popular_guide),
      categories: (catsRes.data ?? []) as BlogCategory[],
      authors,
    };
  },
);

/** Public: a single published post plus related posts. */
export const getBlogPost = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => z.object({ slug: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }): Promise<{ post: BlogPost | null; related: BlogPost[]; redirectTo?: string }> => {
    const supabase = await publicClient();
    let { data: post } = await (supabase as any)
      .from("blog_posts")
      .select(POST_COLUMNS)
      .eq("slug", data.slug)
      .maybeSingle();

    // Old slug? Resolve through the slug history and tell the route to redirect
    // to the canonical URL instead of rendering a 404.
    if (!post) {
      const { data: historic } = await (supabase as any)
        .from("blog_post_slugs")
        .select("post_id")
        .eq("slug", data.slug)
        .maybeSingle();
      if (historic?.post_id) {
        const { data: canonical } = await (supabase as any)
          .from("blog_posts")
          .select(POST_COLUMNS)
          .eq("id", historic.post_id)
          .maybeSingle();
        if (canonical) {
          return { post: null, related: [], redirectTo: (canonical as BlogPost).slug };
        }
      }
    }
    if (!post) return { post: null, related: [] };

    const { data: pool } = await (supabase as any)
      .from("blog_posts")
      .select(POST_COLUMNS)
      .neq("id", (post as BlogPost).id)
      .order("published_at", { ascending: false })
      .limit(40);

    const typed = post as BlogPost;
    const scored = ((pool ?? []) as BlogPost[])
      .map((p) => {
        let score = 0;
        if (p.category?.id && p.category.id === typed.category?.id) score += 3;
        score += p.tags.filter((t) => typed.tags.includes(t)).length * 2;
        if (p.author?.id && p.author.id === typed.author?.id) score += 1;
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.p);

    return { post: typed, related: scored };
  });

/** Public: one author with their published posts. */
export const getBlogAuthor = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }): Promise<{ author: BlogAuthor | null; posts: BlogPost[] }> => {
    const supabase = await publicClient();
    const { data: author } = await (supabase as any)
      .from("blog_authors")
      .select("id, slug, name, role, bio, avatar_url")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!author) return { author: null, posts: [] };
    const { data: posts } = await (supabase as any)
      .from("blog_posts")
      .select(POST_COLUMNS)
      .eq("author_id", (author as BlogAuthor).id)
      .order("published_at", { ascending: false });
    return { author: author as BlogAuthor, posts: (posts ?? []) as BlogPost[] };
  });

/** Public: one category with its published posts. */
export const getBlogCategory = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }): Promise<{ category: BlogCategory | null; posts: BlogPost[] }> => {
    const supabase = await publicClient();
    const { data: category } = await (supabase as any)
      .from("blog_categories")
      .select("id, slug, name, description, sort_order")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!category) return { category: null, posts: [] };
    const { data: posts } = await (supabase as any)
      .from("blog_posts")
      .select(POST_COLUMNS)
      .eq("category_id", (category as BlogCategory).id)
      .order("published_at", { ascending: false });
    return { category: category as BlogCategory, posts: (posts ?? []) as BlogPost[] };
  });

/**
 * Public: newsletter signup. Duplicate addresses resolve to the same row.
 *
 * Validation failures are returned as data (never thrown) so the form can show
 * an accurate message instead of a generic network error.
 */
export const subscribeToNewsletter = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; source?: string }) =>
    z
      .object({ email: z.string().max(320).default(""), source: z.string().max(40).default("blog") })
      .parse(input),
  )

  .handler(async ({ data }): Promise<{ ok: boolean; duplicate: boolean; message: string }> => {
    const email = data.email.trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) && email.length <= 200;
    if (!valid) {
      return { ok: false, duplicate: false, message: "Enter a valid email address." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Single atomic upsert against the unique constraint on email: concurrent
    // requests for the same address can never create a second row.
    const { data: upserted, error } = await (supabaseAdmin as any)
      .from("newsletter_subscribers")
      .upsert({ email, source: data.source }, { onConflict: "email", ignoreDuplicates: true })
      .select("id");
    if (error) {
      if (error.code === "23505") return { ok: true, duplicate: true, message: "You are already subscribed." };
      return { ok: false, duplicate: false, message: "Could not subscribe right now. Please try again." };
    }
    if (!upserted || upserted.length === 0) {
      return { ok: true, duplicate: true, message: "You are already subscribed." };
    }
    return { ok: true, duplicate: false, message: "You are subscribed. Check your inbox soon." };
  });

/** Returns a unique slug, suffixing -2, -3 ... when the base slug is taken. */
async function uniqueSlug(client: any, base: string, ignoreId: string | null): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 60; i += 1) {
    let query = client.from("blog_posts").select("id").eq("slug", candidate).limit(1);
    if (ignoreId) query = query.neq("id", ignoreId);
    const { data: hit } = await query;
    const taken = Array.isArray(hit) && hit.length > 0;
    if (!taken) {
      const { data: historic } = await client
        .from("blog_post_slugs")
        .select("post_id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!historic || (ignoreId && historic.post_id === ignoreId)) return candidate;
    }
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/* ------------------------------ Admin ------------------------------ */

/** Admin: every post regardless of status. */
export const listAllBlogPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    const [posts, categories, authors] = await Promise.all([
      (context.supabase as any)
        .from("blog_posts")
        .select(POST_COLUMNS)
        .order("published_at", { ascending: false, nullsFirst: false }),
      (context.supabase as any)
        .from("blog_categories")
        .select("id, slug, name, description, sort_order")
        .order("sort_order"),
      (context.supabase as any).from("blog_authors").select("id, slug, name, role, bio, avatar_url").order("name"),
    ]);
    return {
      posts: (posts.data ?? []) as BlogPost[],
      categories: (categories.data ?? []) as BlogCategory[],
      authors: (authors.data ?? []) as BlogAuthor[],
    };
  });

const postInput = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers and dashes"),
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300).default(""),
  excerpt: z.string().trim().max(600).default(""),
  content: z.string().max(300000).default(""),
  contentFormat: z.enum(["markdown", "html"]).default("html"),
  coverImageUrl: z.string().trim().max(600).nullable().default(null),
  categoryId: z.string().uuid().nullable().default(null),
  authorId: z.string().uuid().nullable().default(null),
  contentType: z.enum(["article", "guide", "case_study", "template", "tutorial", "product_update"]),
  status: z.enum(["draft", "scheduled", "published", "archived"]),
  featured: z.boolean().default(false),
  popularGuide: z.boolean().default(false),
  readingMinutes: z.number().int().min(1).max(120).default(5),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  seoTitle: z.string().trim().max(200).nullable().default(null),
  metaDescription: z.string().trim().max(400).nullable().default(null),
  canonicalUrl: z.string().trim().max(600).nullable().default(null),
  ogImageUrl: z.string().trim().max(600).nullable().default(null),
  publishedAt: z.string().nullable().default(null),
});

/** Admin: create or update a post. */
export const saveBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => postInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");

    // Slugs must stay unique; silently suffix duplicates rather than failing.
    const slug = await uniqueSlug(context.supabase, data.slug, data.id ?? null);

    // A "published" post with a future timestamp is invisible to the public
    // RLS policy. Clamp it to now — future dates belong to "scheduled".
    const requested = data.publishedAt ? new Date(data.publishedAt) : null;
    const valid = requested && !Number.isNaN(requested.getTime()) ? requested : null;
    let publishedAt: string | null = valid ? valid.toISOString() : null;
    if (data.status === "published") {
      if (!publishedAt || new Date(publishedAt).getTime() > Date.now()) {
        publishedAt = new Date().toISOString();
      }
    } else if (data.status === "draft" || data.status === "archived") {
      publishedAt = valid ? valid.toISOString() : null;
    }

    const row: Record<string, unknown> = {
      slug,
      title: data.title,
      subtitle: data.subtitle,
      excerpt: data.excerpt || data.subtitle,
      content: data.content,
      content_format: data.contentFormat,
      cover_image_url: data.coverImageUrl || null,
      category_id: data.categoryId,
      author_id: data.authorId,
      content_type: data.contentType,
      status: data.status,
      featured: data.featured,
      popular_guide: data.popularGuide,
      reading_minutes: data.readingMinutes,
      tags: data.tags,
      seo_title: data.seoTitle || null,
      meta_description: data.metaDescription || null,
      canonical_url: data.canonicalUrl || null,
      og_image_url: data.ogImageUrl || null,
      published_at: publishedAt,
    };

    const query = data.id
      ? (context.supabase as any).from("blog_posts").update(row).eq("id", data.id).select("id").single()
      : (context.supabase as any).from("blog_posts").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);

    // Only one post can be featured at a time.
    if (data.featured) {
      await (context.supabase as any)
        .from("blog_posts")
        .update({ featured: false })
        .neq("id", (saved as { id: string }).id)
        .eq("featured", true);
    }
    return { id: (saved as { id: string }).id };
  });

/** Admin: quick status change (publish, unpublish, archive, schedule). */
export const setBlogPostStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string; publishedAt?: string | null }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "scheduled", "published", "archived"]),
        publishedAt: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "published") patch["published_at"] = data.publishedAt ?? new Date().toISOString();
    if (data.status === "scheduled" && data.publishedAt) patch["published_at"] = data.publishedAt;
    const { error } = await (context.supabase as any).from("blog_posts").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: delete a post. */
export const deleteBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    const { error } = await (context.supabase as any).from("blog_posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: create or update an author. */
export const saveBlogAuthor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9-]+$/),
        name: z.string().trim().min(1).max(120),
        role: z.string().trim().max(120).default(""),
        bio: z.string().trim().max(1000).default(""),
        avatarUrl: z.string().trim().max(600).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    const row = {
      slug: data.slug,
      name: data.name,
      role: data.role,
      bio: data.bio,
      avatar_url: data.avatarUrl || null,
    };
    const query = data.id
      ? (context.supabase as any).from("blog_authors").update(row).eq("id", data.id).select("id").single()
      : (context.supabase as any).from("blog_authors").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    return { id: (saved as { id: string }).id };
  });

/** Admin: delete an author (posts keep existing but lose the byline). */
export const deleteBlogAuthor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    await (context.supabase as any).from("blog_posts").update({ author_id: null }).eq("author_id", data.id);
    const { error } = await (context.supabase as any).from("blog_authors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: create or update a category. */
export const saveBlogCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(600).default(""),
        sortOrder: z.number().int().min(0).max(999).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    const row = {
      slug: data.slug,
      name: data.name,
      description: data.description,
      sort_order: data.sortOrder,
    };
    const query = data.id
      ? (context.supabase as any).from("blog_categories").update(row).eq("id", data.id).select("id").single()
      : (context.supabase as any).from("blog_categories").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    return { id: (saved as { id: string }).id };
  });

/** Admin: delete a category. Posts stay published, just uncategorised. */
export const deleteBlogCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    await (context.supabase as any).from("blog_posts").update({ category_id: null }).eq("category_id", data.id);
    const { error } = await (context.supabase as any).from("blog_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- Media library --------------------------- */

/** Admin: list the media library. */
export const listBlogMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    const { data, error } = await (context.supabase as any)
      .from("blog_media")
      .select("id, storage_path, public_url, file_name, mime_type, size_bytes, alt_text, caption, folder, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return { items: (data ?? []) as any[] };
  });

/** Admin: record an uploaded file in the library (the upload itself is a direct storage write). */
export const registerBlogMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        storagePath: z.string().trim().min(1).max(400),
        publicUrl: z.string().trim().min(1).max(600),
        fileName: z.string().trim().min(1).max(200),
        mimeType: z.string().trim().max(120).default("image/png"),
        sizeBytes: z.number().int().min(0).max(50_000_000).default(0),
        altText: z.string().trim().max(300).default(""),
        caption: z.string().trim().max(400).default(""),
        folder: z.string().trim().max(60).default("library"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    const { data: saved, error } = await (context.supabase as any)
      .from("blog_media")
      .insert({
        storage_path: data.storagePath,
        public_url: data.publicUrl,
        file_name: data.fileName,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        alt_text: data.altText,
        caption: data.caption,
        folder: data.folder,
        uploaded_by: context.userId,
      })
      .select("id, storage_path, public_url, file_name, mime_type, size_bytes, alt_text, caption, folder, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { item: saved as any };
  });

/** Admin: edit alt text / caption on a library item. */
export const updateBlogMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        altText: z.string().trim().max(300).default(""),
        caption: z.string().trim().max(400).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    const { error } = await (context.supabase as any)
      .from("blog_media")
      .update({ alt_text: data.altText, caption: data.caption, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: delete a library item and its stored file. */
export const deleteBlogMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    const { data: row } = await (context.supabase as any)
      .from("blog_media")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.storage_path) {
      await (context.supabase as any).storage.from("blog-media").remove([row.storage_path]);
    }
    const { error } = await (context.supabase as any).from("blog_media").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: searchable internal link targets (site pages + blog posts). */
export const searchInternalLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().max(120).default("") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context))) throw new Error("Admin access required");
    const term = data.query.trim();
    const pagesQuery = (context.supabase as any)
      .from("site_pages")
      .select("id, path, title, status")
      .order("path")
      .limit(40);
    const postsQuery = (context.supabase as any)
      .from("blog_posts")
      .select("id, slug, title, status")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(40);
    if (term) {
      pagesQuery.or(`title.ilike.%${term}%,path.ilike.%${term}%`);
      postsQuery.or(`title.ilike.%${term}%,slug.ilike.%${term}%`);
    }
    const [pages, posts] = await Promise.all([pagesQuery, postsQuery]);
    return {
      results: [
        ...((pages.data ?? []) as any[]).map((p) => ({
          id: p.id,
          label: p.title,
          href: p.path,
          kind: "page" as const,
          status: p.status as string,
        })),
        ...((posts.data ?? []) as any[]).map((p) => ({
          id: p.id,
          label: p.title,
          href: `/blog/${p.slug}`,
          kind: "post" as const,
          status: p.status as string,
        })),
      ],
    };
  });
