/** Shared, client-safe blog types and helpers. */

export type BlogStatus = "draft" | "scheduled" | "published" | "archived";
export type BlogContentType =
  | "article"
  | "guide"
  | "case_study"
  | "template"
  | "tutorial"
  | "product_update";

export const CONTENT_TYPE_LABELS: Record<BlogContentType, string> = {
  article: "Article",
  guide: "Guide",
  case_study: "Case Study",
  template: "Template",
  tutorial: "Tutorial",
  product_update: "Product Update",
};

export const STATUS_LABELS: Record<BlogStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

export type BlogAuthor = {
  id: string;
  slug: string;
  name: string;
  role: string;
  bio: string;
  avatar_url: string | null;
};

export type BlogCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  cover_image_url: string | null;
  content_type: BlogContentType;
  status: BlogStatus;
  featured: boolean;
  popular_guide: boolean;
  reading_minutes: number;
  tags: string[];
  seo_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  og_image_url: string | null;
  published_at: string | null;
  updated_at: string;
  category: BlogCategory | null;
  author: BlogAuthor | null;
};

export const POST_COLUMNS =
  "id, slug, title, subtitle, excerpt, content, cover_image_url, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, canonical_url, og_image_url, published_at, updated_at, category:blog_categories(id, slug, name, description, sort_order), author:blog_authors(id, slug, name, role, bio, avatar_url)";

export function formatBlogDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Deterministic cover gradient so every card has artwork without stock photos. */
export function coverGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  const second = (hash + 48) % 360;
  return `linear-gradient(135deg, hsl(${hash} 72% 46%) 0%, hsl(${second} 68% 32%) 100%)`;
}
