import { z } from "zod";
import { HELP_ARTICLES, HELP_CATEGORIES, type HelpArticle } from "./help-center";

export const helpArticleSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(3).max(160),
  category: z.string().refine((v) => HELP_CATEGORIES.some((c) => c.slug === v), "Choose an existing category"),
  description: z.string().trim().max(400),
  content: z.string().trim().max(100000),
  seoTitle: z.string().trim().max(160).default(""),
  metaDescription: z.string().trim().max(320).default(""),
  published: z.boolean().default(false),
}).refine((v) => !v.published || v.content.length > 0, { message: "Published articles need content", path: ["content"] });

export type HelpArticleDraft = z.infer<typeof helpArticleSchema>;
export type HelpCmsRow = {
  id: string; slug: string; title: string; category: string; summary: string; body: string;
  published: boolean; updated_at: string; deleted_at: string | null;
  help_metadata: Partial<HelpArticle> | null;
};

export function rowToHelpArticle(row: HelpCmsRow): HelpArticle {
  const { seoTitle, metaDescription, ...metadata } = row.help_metadata ?? {};
  return { ...metadata, slug: row.slug, title: row.title, category: row.category,
    description: row.summary, content: row.body, updated: row.updated_at.slice(0, 10),
    ...(seoTitle?.trim() ? { seoTitle: seoTitle.trim() } : {}),
    ...(metaDescription?.trim() ? { metaDescription: metaDescription.trim() } : {}) };
}

/** An unpublished override masks the original without exposing draft content. */
export function mergeHelpArticles(rows: HelpCmsRow[], overridden: string[]): HelpArticle[] {
  const hidden = new Set(overridden);
  const articles = new Map(HELP_ARTICLES.filter((a) => !hidden.has(a.slug)).map((a) => [a.slug, a]));
  for (const row of rows) if (row.published && !row.deleted_at) articles.set(row.slug, rowToHelpArticle(row));
  return [...articles.values()];
}

export function safeHelpUrl(value: string): boolean {
  return /^\/(?!\/)/.test(value) || /^https:\/\//i.test(value);
}