/**
 * Website content server functions.
 *
 * `getSiteContent` is public (publishable key + RLS). Everything else requires
 * an authenticated session that holds the platform admin role, re-checked
 * server-side through the `has_role` security-definer function.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CHANGEFREQS,
  normalizePath,
  validateHref,
  validateRedirect,
  validateRobots,
  type RobotsConfig,
} from "@/lib/site-content-model";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
}

/** Public: nav, footer, SEO overrides and redirects for the marketing site. */
export const getSiteContent = createServerFn({ method: "GET" }).handler(async () => {
  const { loadSiteContent } = await import("@/lib/site-content.server");
  return loadSiteContent();
});

/** Admin: everything the content console edits. */
export const getAdminSiteData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { DEFAULT_ROBOTS, DEFAULT_FOOTER } = await import("@/lib/site-content.server");
    const db = context.supabase as any;
    const [pages, nav, redirects, settings] = await Promise.all([
      db.from("site_pages").select("*").order("path").limit(500),
      db.from("site_nav_items").select("*").order("location").order("sort_order").limit(400),
      db.from("site_redirects").select("*").order("source_path").limit(500),
      db.from("site_settings").select("key, value").limit(20),
    ]);
    for (const res of [pages, nav, redirects, settings]) {
      if (res.error) throw new Error(res.error.message);
    }
    const settingsMap = new Map(((settings.data ?? []) as any[]).map((r) => [r.key, r.value]));
    return {
      pages: (pages.data ?? []) as any[],
      nav: (nav.data ?? []) as any[],
      redirects: (redirects.data ?? []) as any[],
      robots: { ...DEFAULT_ROBOTS, ...((settingsMap.get("robots") as RobotsConfig) ?? {}) },
      footerConfig: { ...DEFAULT_FOOTER, ...((settingsMap.get("footer") as any) ?? {}) },
    };
  });

const pageInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  section: z.string().trim().max(60).default("marketing"),
  status: z.enum(["draft", "published", "unpublished"]),
  seoTitle: z.string().trim().max(200).nullable(),
  metaDescription: z.string().trim().max(400).nullable(),
  canonicalUrl: z.string().trim().max(600).nullable(),
  ogTitle: z.string().trim().max(200).nullable(),
  ogDescription: z.string().trim().max(400).nullable(),
  ogImageUrl: z.string().trim().max(600).nullable(),
  robotsIndex: z.boolean(),
  robotsFollow: z.boolean(),
  includeInSitemap: z.boolean(),
  changefreq: z.enum(CHANGEFREQS),
  priority: z.number().min(0).max(1),
  structuredData: z.string().trim().max(8000).nullable(),
});

/** Admin: update a page's SEO record. Paths are never editable from the UI. */
export const saveSitePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pageInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { logContentChange } = await import("@/lib/site-content.server");
    let structured: unknown = null;
    if (data.structuredData) {
      try {
        structured = JSON.parse(data.structuredData);
      } catch {
        throw new Error("Structured data must be valid JSON");
      }
    }
    const db = context.supabase as any;
    const { data: before } = await db.from("site_pages").select("*").eq("id", data.id).maybeSingle();
    const patch = {
      title: data.title,
      section: data.section,
      status: data.status,
      seo_title: data.seoTitle || null,
      meta_description: data.metaDescription || null,
      canonical_url: data.canonicalUrl || null,
      og_title: data.ogTitle || null,
      og_description: data.ogDescription || null,
      og_image_url: data.ogImageUrl || null,
      robots_index: data.robotsIndex,
      robots_follow: data.robotsFollow,
      include_in_sitemap: data.includeInSitemap,
      changefreq: data.changefreq,
      priority: data.priority,
      structured_data: structured,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("site_pages").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logContentChange(context.userId, "site_page.update", "site_page", data.id, {
      path: before?.path ?? null,
      before,
      after: patch,
    });
    return { ok: true };
  });

const navInput = z.object({
  id: z.string().uuid().optional(),
  location: z.enum(["header", "footer", "social"]),
  groupLabel: z.string().trim().max(80).nullable(),
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(600),
  description: z.string().trim().max(240).nullable(),
  icon: z.string().trim().max(60).nullable(),
  isExternal: z.boolean(),
  isVisible: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

/** Admin: create or update a navigation / footer / social link. */
export const saveNavItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => navInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { logContentChange } = await import("@/lib/site-content.server");
    const hrefError = validateHref(data.href, data.isExternal);
    if (hrefError) throw new Error(hrefError);

    const db = context.supabase as any;
    if (!data.isExternal) {
      const path = normalizePath(data.href.split("#")[0]!.split("?")[0]!);
      const { data: target } = await db
        .from("site_pages")
        .select("path, status")
        .eq("path", path)
        .maybeSingle();
      if (target && target.status !== "published" && data.isVisible) {
        throw new Error(`${path} is ${target.status} — publish that page before linking to it`);
      }
    }

    const row = {
      location: data.location,
      group_label: data.groupLabel || null,
      label: data.label,
      href: data.href.trim(),
      description: data.description || null,
      icon: data.icon || null,
      is_external: data.isExternal,
      is_visible: data.isVisible,
      sort_order: data.sortOrder,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? db.from("site_nav_items").update(row).eq("id", data.id).select("id").single()
      : db.from("site_nav_items").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await logContentChange(
      context.userId,
      data.id ? "site_nav.update" : "site_nav.create",
      "site_nav_item",
      saved.id,
      row,
    );
    return { id: saved.id as string };
  });

/** Admin: reorder links within a menu group. */
export const reorderNavItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0).max(999) })).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    for (const item of data.items) {
      const { error } = await db
        .from("site_nav_items")
        .update({ sort_order: item.sortOrder })
        .eq("id", item.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Admin: delete a navigation link. */
export const deleteNavItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { logContentChange } = await import("@/lib/site-content.server");
    const db = context.supabase as any;
    const { data: before } = await db.from("site_nav_items").select("*").eq("id", data.id).maybeSingle();
    const { error } = await db.from("site_nav_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logContentChange(context.userId, "site_nav.delete", "site_nav_item", data.id, { before });
    return { ok: true };
  });

const redirectInput = z.object({
  id: z.string().uuid().optional(),
  source: z.string().trim().min(1).max(400),
  destination: z.string().trim().min(1).max(600),
  statusCode: z.union([z.literal(301), z.literal(302)]),
  isActive: z.boolean(),
  note: z.string().trim().max(240).nullable(),
});

/** Admin: create or update a redirect, refusing loops and duplicate sources. */
export const saveRedirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => redirectInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { logContentChange } = await import("@/lib/site-content.server");
    const db = context.supabase as any;
    const { data: existing, error: listError } = await db
      .from("site_redirects")
      .select("id, source_path, destination_path, is_active")
      .limit(500);
    if (listError) throw new Error(listError.message);
    const problem = validateRedirect(
      { ...(data.id ? { id: data.id } : {}), source: data.source, destination: data.destination },
      (existing ?? []) as any[],
    );
    if (problem) throw new Error(problem);

    const row = {
      source_path: normalizePath(data.source),
      destination_path: /^https?:\/\//.test(data.destination.trim())
        ? data.destination.trim()
        : normalizePath(data.destination),
      status_code: data.statusCode,
      is_active: data.isActive,
      note: data.note || null,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? db.from("site_redirects").update(row).eq("id", data.id).select("id").single()
      : db.from("site_redirects").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await logContentChange(
      context.userId,
      data.id ? "site_redirect.update" : "site_redirect.create",
      "site_redirect",
      saved.id,
      row,
    );
    return { id: saved.id as string };
  });

/** Admin: delete a redirect. */
export const deleteRedirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { logContentChange } = await import("@/lib/site-content.server");
    const db = context.supabase as any;
    const { data: before } = await db.from("site_redirects").select("*").eq("id", data.id).maybeSingle();
    const { error } = await db.from("site_redirects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logContentChange(context.userId, "site_redirect.delete", "site_redirect", data.id, { before });
    return { ok: true };
  });

const robotsInput = z.object({
  rules: z
    .array(
      z.object({
        user_agent: z.string().trim().min(1).max(80),
        allow: z.array(z.string().trim().max(200)).max(50),
        disallow: z.array(z.string().trim().max(200)).max(50),
      }),
    )
    .min(1)
    .max(20),
  sitemap_url: z.string().trim().max(600).default("/sitemap.xml"),
  extra: z.string().trim().max(2000).default(""),
});

/** Admin: save robots.txt, refusing rules that would hide the whole site. */
export const saveRobotsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => robotsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { logContentChange } = await import("@/lib/site-content.server");
    const problem = validateRobots(data as RobotsConfig);
    if (problem) throw new Error(problem);
    const db = context.supabase as any;
    const { error } = await db
      .from("site_settings")
      .upsert({ key: "robots", value: data, updated_by: context.userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await logContentChange(context.userId, "site_settings.robots", "site_settings", "robots", { after: data });
    return { ok: true };
  });

/** Admin: footer tagline + copyright. */
export const saveFooterConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tagline: z.string().trim().max(400), copyright: z.string().trim().max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { logContentChange } = await import("@/lib/site-content.server");
    const db = context.supabase as any;
    const { error } = await db
      .from("site_settings")
      .upsert({ key: "footer", value: data, updated_by: context.userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await logContentChange(context.userId, "site_settings.footer", "site_settings", "footer", { after: data });
    return { ok: true };
  });

/** Admin: sitemap preview — the exact URLs the live sitemap emits. */
export const getSitemapPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { buildSitemap } = await import("@/lib/site-content.server");
    return buildSitemap();
  });
