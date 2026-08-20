/**
 * Website content data access.
 *
 * Public reads use the publishable key so RLS is the gate; admin writes are
 * always called from server functions that verified the platform admin role
 * first. Nothing here trusts the caller on its own.
 */
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/config";
import {
  normalizePath,
  renderRobots,
  type FooterConfig,
  type NavItem,
  type RobotsConfig,
  type SitePage,
  type SiteRedirect,
} from "@/lib/site-content-model";

export const DEFAULT_ROBOTS: RobotsConfig = {
  rules: [{ user_agent: "*", allow: ["/"], disallow: [] }],
  sitemap_url: "/sitemap.xml",
  extra: "",
};

export const DEFAULT_FOOTER: FooterConfig = {
  tagline:
    "Send personalized cold emails, automate follow-ups, and manage every reply from one workspace.",
  copyright: "Sendloop. All rights reserved.",
};

export async function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || SUPABASE_PUBLISHABLE_KEY;
  const url = process.env["SUPABASE_URL"] || SUPABASE_URL;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
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
  }) as any;
}

export type PageSeoEntry = {
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  robots: string | null;
  structuredData: string | null;
  status: string;
};

export type SiteContentBundle = {
  seo: Record<string, PageSeoEntry>;
  header: NavItem[];
  footer: NavItem[];
  social: NavItem[];
  footerConfig: FooterConfig;
  redirects: { source: string; destination: string; statusCode: number }[];
};

/** Everything the public website needs to render nav, footer and page SEO. */
export async function loadSiteContent(): Promise<SiteContentBundle> {
  const db = await publicClient();
  const [pages, nav, redirects, settings] = await Promise.all([
    db
      .from("site_pages")
      .select(
        "path, status, seo_title, meta_description, canonical_url, og_title, og_description, og_image_url, robots_index, robots_follow, structured_data",
      )
      .limit(500),
    db
      .from("site_nav_items")
      .select("id, location, group_label, label, href, description, icon, is_external, is_visible, sort_order")
      .eq("is_visible", true)
      .order("sort_order")
      .limit(400),
    db
      .from("site_redirects")
      .select("source_path, destination_path, status_code")
      .eq("is_active", true)
      .limit(500),
    db.from("site_settings").select("key, value").limit(20),
  ]);

  const seo: Record<string, PageSeoEntry> = {};
  for (const row of (pages.data ?? []) as any[]) {
    const robots = [row.robots_index ? "index" : "noindex", row.robots_follow ? "follow" : "nofollow"].join(
      ", ",
    );
    seo[row.path] = {
      title: row.seo_title,
      description: row.meta_description,
      canonical: row.canonical_url,
      ogTitle: row.og_title,
      ogDescription: row.og_description,
      ogImage: row.og_image_url,
      robots,
      structuredData: row.structured_data ? JSON.stringify(row.structured_data) : null,
      status: row.status,
    };
  }

  const navRows = ((nav.data ?? []) as any[]) as NavItem[];
  const settingsMap = new Map(
    ((settings.data ?? []) as any[]).map((r) => [r.key, r.value as Record<string, unknown>]),
  );

  return {
    seo,
    header: navRows.filter((n) => n.location === "header"),
    footer: navRows.filter((n) => n.location === "footer"),
    social: navRows.filter((n) => n.location === "social"),
    footerConfig: { ...DEFAULT_FOOTER, ...((settingsMap.get("footer") as FooterConfig) ?? {}) },
    redirects: ((redirects.data ?? []) as any[]).map((r) => ({
      source: r.source_path,
      destination: r.destination_path,
      statusCode: r.status_code,
    })),
  };
}

export async function loadRobotsConfig(): Promise<RobotsConfig> {
  const db = await publicClient();
  const { data } = await db.from("site_settings").select("value").eq("key", "robots").maybeSingle();
  return { ...DEFAULT_ROBOTS, ...((data?.value as RobotsConfig) ?? {}) };
}

export async function renderRobotsTxt(origin: string): Promise<string> {
  const config = await loadRobotsConfig();
  const sitemap = config.sitemap_url?.startsWith("http")
    ? config.sitemap_url
    : `${origin}${config.sitemap_url || "/sitemap.xml"}`;
  return renderRobots(config, sitemap);
}

export type SitemapEntry = {
  path: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
};

/** Never emits admin, dashboard, auth, unpublished or noindex URLs. */
const PRIVATE_PREFIXES = [
  "/admin",
  "/dashboard",
  "/auth",
  "/signin",
  "/signup",
  "/reset-password",
  "/forgot-password",
  "/verify-email",
  "/invite",
  "/api",
  "/diagnostics",
];

export function isPrivatePath(path: string) {
  return PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function buildSitemap(): Promise<{
  entries: SitemapEntry[];
  excluded: { path: string; reason: string }[];
}> {
  const db = await publicClient();
  const [pages, posts] = await Promise.all([
    db
      .from("site_pages")
      .select("path, status, robots_index, include_in_sitemap, changefreq, priority, updated_at")
      .order("path")
      .limit(500),
    db
      .from("blog_posts")
      .select("slug, status, updated_at, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1000),
  ]);

  const entries: SitemapEntry[] = [];
  const excluded: { path: string; reason: string }[] = [];

  for (const page of (pages.data ?? []) as any[]) {
    const path = normalizePath(page.path);
    if (isPrivatePath(path)) {
      excluded.push({ path, reason: "Private / authenticated area" });
      continue;
    }
    if (page.status !== "published") {
      excluded.push({ path, reason: `Page is ${page.status}` });
      continue;
    }
    if (!page.robots_index) {
      excluded.push({ path, reason: "Marked noindex" });
      continue;
    }
    if (!page.include_in_sitemap) {
      excluded.push({ path, reason: "Excluded by admin" });
      continue;
    }
    entries.push({
      path,
      changefreq: page.changefreq,
      priority: String(page.priority),
    });
  }

  for (const post of (posts.data ?? []) as any[]) {
    entries.push({
      path: `/blog/${post.slug}`,
      changefreq: "monthly",
      priority: "0.6",
      ...(post.updated_at ? { lastmod: String(post.updated_at).slice(0, 10) } : {}),
    });
  }

  return { entries, excluded };
}

export function renderSitemapXml(entries: SitemapEntry[], baseUrl: string): string {
  const urls = entries.map((e) =>
    [
      "  <url>",
      `    <loc>${baseUrl}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      "  </url>",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
}

/** Writes an entry to the shared admin audit log. */
export async function logContentChange(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any).from("admin_audit_log").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}

export type AdminSiteData = {
  pages: SitePage[];
  nav: NavItem[];
  redirects: SiteRedirect[];
  robots: RobotsConfig;
  footerConfig: FooterConfig;
};
