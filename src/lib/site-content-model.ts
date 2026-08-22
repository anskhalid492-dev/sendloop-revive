/**
 * Shared, client-safe types and validation for the website content system
 * (pages & SEO, navigation, footer, redirects, robots.txt, sitemap).
 *
 * The rules here are the same ones the admin UI shows and the server enforces,
 * so a link or robots rule can never be published in a state that would break
 * the public website.
 */

export type PageStatus = "draft" | "published" | "unpublished";

export type SitePage = {
  id: string;
  path: string;
  title: string;
  section: string;
  status: PageStatus;
  seo_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  robots_index: boolean;
  robots_follow: boolean;
  structured_data: unknown | null;
  include_in_sitemap: boolean;
  changefreq: string;
  priority: number;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
};

export type NavLocation = "header" | "footer" | "social";

export type NavItem = {
  id: string;
  location: NavLocation;
  group_label: string | null;
  label: string;
  href: string;
  description: string | null;
  icon: string | null;
  is_external: boolean;
  is_visible: boolean;
  sort_order: number;
};

export type SiteRedirect = {
  id: string;
  source_path: string;
  destination_path: string;
  status_code: 301 | 302;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type GlobalSeoConfig = {
  site_title: string;
  title_template: string;
  meta_description: string;
  og_image_url: string;
  og_site_name: string;
  twitter_handle: string;
  google_verification: string;
  bing_verification: string;
  head_scripts: string;
  body_scripts: string;
  index_site: boolean;
};

export type RobotsRule = {
  user_agent: string;
  allow: string[];
  disallow: string[];
};

export type RobotsConfig = {
  rules: RobotsRule[];
  sitemap_url: string;
  extra: string;
};

export type FooterConfig = {
  tagline: string;
  copyright: string;
};

export const HEADER_GROUPS = [
  { value: "core", label: "Mega menu — Core platform" },
  { value: "more", label: "Mega menu — More from MunchReach" },
  { value: "usecase", label: "Mega menu — By use case" },
  { value: "resources", label: "Mega menu — Resources" },
  { value: "top", label: "Top-level links" },
] as const;

export const CHANGEFREQS = [
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
] as const;

/**
 * A link is publishable when it points somewhere real. Social slots may be left
 * empty on purpose — an empty social URL simply hides that platform.
 */
export function validateHref(href: string, isExternal: boolean, allowEmpty = false): string | null {
  const value = href.trim();
  if (!value) return allowEmpty ? null : "Link URL is required";

  if (isExternal) {
    if (!/^https?:\/\/\S+\.\S+/.test(value)) return "External links must be a full https:// URL";
    return null;
  }
  if (!value.startsWith("/")) return "Internal links must start with /";
  if (/\s/.test(value)) return "Links cannot contain spaces";
  return null;
}

export function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return `/${trimmed}`;
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : "/";
}

/**
 * Redirect safety: a new or edited rule must not point at itself, must not
 * create a chain that loops back, and must not collide with an existing rule.
 */
export function validateRedirect(
  candidate: { id?: string; source: string; destination: string },
  existing: Pick<SiteRedirect, "id" | "source_path" | "destination_path" | "is_active">[],
): string | null {
  const source = normalizePath(candidate.source);
  const destination = candidate.destination.trim();
  if (!source.startsWith("/")) return "Source must be a path starting with /";
  if (!destination) return "Destination is required";
  const external = /^https?:\/\//.test(destination);
  if (!external && !destination.startsWith("/")) {
    return "Destination must be a path starting with / or a full https:// URL";
  }
  if (!external && normalizePath(destination) === source) {
    return "Source and destination are the same";
  }
  const clash = existing.find((r) => r.id !== candidate.id && r.source_path === source);
  if (clash) return `A redirect for ${source} already exists`;
  if (external) return null;

  // Walk the chain: source -> destination -> ... and stop if we return home.
  const map = new Map<string, string>();
  for (const r of existing) {
    if (r.id === candidate.id) continue;
    map.set(r.source_path, r.destination_path);
  }
  map.set(source, normalizePath(destination));
  let cursor = normalizePath(destination);
  for (let hops = 0; hops < 12; hops += 1) {
    const next = map.get(cursor);
    if (!next) return null;
    if (next === source || next === cursor) return "This would create a redirect loop";
    cursor = next;
  }
  return "This redirect chain is too long";
}

/** Renders the stored configuration into a robots.txt body. */
export function renderRobots(config: RobotsConfig, sitemapUrl?: string): string {
  const blocks = config.rules.map((rule) => {
    const lines = [`User-agent: ${rule.user_agent.trim() || "*"}`];
    for (const path of rule.allow) if (path.trim()) lines.push(`Allow: ${path.trim()}`);
    for (const path of rule.disallow) if (path.trim()) lines.push(`Disallow: ${path.trim()}`);
    if (lines.length === 1) lines.push("Allow: /");
    return lines.join("\n");
  });
  const body = blocks.join("\n\n");
  const sitemap = (sitemapUrl ?? config.sitemap_url ?? "").trim();
  const extra = (config.extra ?? "").trim();
  return [body, extra, sitemap ? `Sitemap: ${sitemap}` : ""].filter(Boolean).join("\n\n") + "\n";
}

/** Blocks a robots.txt that would de-index the whole public website. */
export function validateRobots(config: RobotsConfig): string | null {
  if (!config.rules.length) return "At least one user-agent rule is required";
  for (const rule of config.rules) {
    if (!rule.user_agent.trim()) return "Every rule needs a user-agent";
    for (const path of [...rule.allow, ...rule.disallow]) {
      if (path.trim() && !path.trim().startsWith("/")) {
        return `Paths must start with / — "${path}" does not`;
      }
    }
  }
  const wildcard = config.rules.find((r) => r.user_agent.trim() === "*");
  if (wildcard && wildcard.disallow.map((p) => p.trim()).includes("/")) {
    return "Disallow: / for * would hide the entire website from search engines";
  }
  for (const rule of config.rules) {
    if (rule.disallow.map((p) => p.trim()).includes("/") && !rule.allow.length) {
      return `Disallow: / for ${rule.user_agent} would block that crawler entirely`;
    }
  }
  return null;
}

export type SeoIssue = {
  path: string;
  title: string;
  severity: "error" | "warning" | "info";
  issue: string;
  detail: string;
};

/**
 * SEO audit computed from the real page rows — never a made-up score.
 * Every issue below is a fact about the stored metadata.
 */
export function auditPages(
  pages: SitePage[],
  options: { sitemapPaths: string[]; internalLinks: string[] },
): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const live = pages.filter((p) => p.status === "published");

  const byTitle = new Map<string, SitePage[]>();
  const byDescription = new Map<string, SitePage[]>();
  for (const page of live) {
    const title = (page.seo_title ?? "").trim().toLowerCase();
    const description = (page.meta_description ?? "").trim().toLowerCase();
    if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), page]);
    if (description) {
      byDescription.set(description, [...(byDescription.get(description) ?? []), page]);
    }
  }

  const sitemapSet = new Set(options.sitemapPaths);
  const knownPaths = new Set(pages.map((p) => p.path));

  for (const page of live) {
    const add = (severity: SeoIssue["severity"], issue: string, detail: string) =>
      issues.push({ path: page.path, title: page.title, severity, issue, detail });

    if (!page.seo_title?.trim()) add("error", "Missing title", "No SEO title is set for this page.");
    else if (page.seo_title.trim().length > 65) {
      add("info", "Long title", `${page.seo_title.trim().length} characters — search results truncate around 60.`);
    }

    if (!page.meta_description?.trim()) {
      add("error", "Missing meta description", "No meta description is set for this page.");
    } else if (page.meta_description.trim().length > 165) {
      add("info", "Long description", `${page.meta_description.trim().length} characters — snippets truncate around 160.`);
    }

    if (!page.canonical_url?.trim()) {
      add("warning", "Missing canonical", "No canonical URL, so duplicate paths can compete.");
    }

    if (!page.og_title?.trim() || !page.og_description?.trim()) {
      add("warning", "Missing OG metadata", "Social previews fall back to the page title only.");
    }

    if (!page.robots_index) {
      add("warning", "Noindex", "This published page asks search engines not to index it.");
    }

    if (page.robots_index && page.include_in_sitemap && !sitemapSet.has(page.path)) {
      add("error", "Missing sitemap entry", "Indexable page that the sitemap does not list.");
    }

    if (!page.structured_data) {
      add("info", "No structured data", "No schema.org JSON-LD is attached to this page.");
    }
  }

  for (const [title, group] of byTitle) {
    if (group.length > 1) {
      for (const page of group) {
        issues.push({
          path: page.path,
          title: page.title,
          severity: "error",
          issue: "Duplicate title",
          detail: `Shared with ${group.filter((p) => p.id !== page.id).map((p) => p.path).join(", ")} ("${title}")`,
        });
      }
    }
  }
  for (const [, group] of byDescription) {
    if (group.length > 1) {
      for (const page of group) {
        issues.push({
          path: page.path,
          title: page.title,
          severity: "warning",
          issue: "Duplicate description",
          detail: `Shared with ${group.filter((p) => p.id !== page.id).map((p) => p.path).join(", ")}`,
        });
      }
    }
  }

  // Internal links that point at a page which is not published or not known.
  for (const href of new Set(options.internalLinks)) {
    if (!href.startsWith("/")) continue;
    const path = normalizePath(href);
    const page = pages.find((p) => p.path === path);
    if (!knownPaths.has(path)) continue;
    if (page && page.status !== "published") {
      issues.push({
        path,
        title: page.title,
        severity: "error",
        issue: "Broken internal link",
        detail: `Navigation links to ${path}, but that page is ${page.status}.`,
      });
    }
  }

  return issues;
}
