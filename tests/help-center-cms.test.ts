import { describe, expect, it, vi } from "vitest";
import { HELP_ARTICLES } from "@/lib/help-center";
import { helpArticleSchema, mergeHelpArticles, safeHelpUrl, type HelpCmsRow } from "@/lib/help-center-cms";
import { readHelpCatalogue } from "@/lib/help-center-cms.server";

const slug = HELP_ARTICLES[0]?.slug ?? "quick-start";
const row = (values: Partial<HelpCmsRow> = {}): HelpCmsRow => ({ id: "fixture-help-article", slug, title: "Fixture edited article", category: "getting-started", summary: "Fixture summary", body: "## Steps\nFixture content", published: true, updated_at: "2026-10-28T12:00:00Z", deleted_at: null, help_metadata: { seoTitle: "Fixture SEO title" }, ...values });

describe("Help Center CMS isolated fixtures", () => {
  it("published overrides retain one existing slug with updated content and SEO", () => {
    const articles = mergeHelpArticles([row()], [slug]);
    expect(articles.filter((a) => a.slug === slug)).toHaveLength(1);
    expect(articles.find((a) => a.slug === slug)?.title).toBe("Fixture edited article");
    expect(articles.find((a) => a.slug === slug)?.seoTitle).toBe("Fixture SEO title");
  });
  it("draft overrides hide the original rather than republish it", () => {
    expect(mergeHelpArticles([row({ published: false })], [slug]).some((a) => a.slug === slug)).toBe(false);
  });
  it("deleted articles remain absent until restored", () => {
    expect(mergeHelpArticles([row({ deleted_at: "2026-10-28" })], [slug]).some((a) => a.slug === slug)).toBe(false);
  });
  it("new published articles appear without losing built-in articles", () => {
    const articles = mergeHelpArticles([row({ slug: "fixture-new-help" })], ["fixture-new-help"]);
    expect(articles.length).toBe(HELP_ARTICLES.length + 1);
    expect(articles.some((a) => a.slug === "fixture-new-help")).toBe(true);
  });
  it("empty SEO fields preserve public title and description fallbacks", () => {
    const article = mergeHelpArticles([row({ help_metadata: { seoTitle: "", metaDescription: "" } })], [slug]).find((a) => a.slug === slug);
    expect(article?.seoTitle).toBeUndefined();
    expect(article?.metaDescription).toBeUndefined();
    expect(article?.description).toBe("Fixture summary");
  });
  it("requires an existing category", () => {
    expect(helpArticleSchema.safeParse({ slug: "fixture-help", title: "Fixture title", category: "invented", description: "", content: "", published: false }).success).toBe(false);
  });
  it("drafts can be empty but publishing requires content", () => {
    const data = { slug: "fixture-help", title: "Fixture title", category: "campaigns", description: "", content: "" };
    expect(helpArticleSchema.safeParse({ ...data, published: false }).success).toBe(true);
    expect(helpArticleSchema.safeParse({ ...data, published: true }).success).toBe(false);
  });
  it("rejects executable and protocol-relative article URLs", () => {
    expect(safeHelpUrl("javascript:alert(1)")).toBe(false);
    expect(safeHelpUrl("//evil.example")).toBe(false);
    expect(safeHelpUrl("/api/public/media/fixture.png")).toBe(true);
    expect(safeHelpUrl("https://munchreach.com/pricing")).toBe(true);
  });
  it("older schemas preserve the built-in catalogue", async () => {
    const builder: any = { then: (resolve: any) => resolve({ error: { code: "42703" }, data: null }) };
    for (const name of ["select", "eq", "is", "order", "range"]) builder[name] = vi.fn(() => builder);
    expect(await readHelpCatalogue({ from: () => builder, rpc: () => builder })).toEqual(HELP_ARTICLES);
  });
});