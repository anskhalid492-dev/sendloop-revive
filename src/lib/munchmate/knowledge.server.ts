/**
 * MunchMate knowledge index. Reads ONLY approved public sources: Help Center
 * articles, published blog posts, published FAQs, public plans, and
 * admin-approved public MunchReach pages. Never reads customer tables.
 */
import { readHelpCatalogue } from "@/lib/help-center-cms.server";
import { publicContentClient } from "@/lib/trust-center.server";
import { isAllowedLink, type KnowledgeDoc } from "@/lib/munchmate/retrieval";
import { helpKnowledge, pricingKnowledge, productOverview, PRICING_COLUMNS, type PublicKnowledgePlan, type PublicKnowledgeFeature } from "./grounding";

type Row = { source: string; source_key: string; title: string; url: string | null; content: string };

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h\d|li|section|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function loadPublicPricingKnowledge(): Promise<KnowledgeDoc[]> {
  const db = await publicContentClient();
  const [plans, features] = await Promise.all([
    db.from("plans").select(PRICING_COLUMNS).order("sort_order"),
    db.from("plan_features").select("plan_id,name,included,value,feature_key").order("sort_order"),
  ]);
  if (plans.error || features.error) throw new Error("Current public pricing could not be confirmed");
  return pricingKnowledge((plans.data ?? []) as unknown as PublicKnowledgePlan[], (features.data ?? []) as PublicKnowledgeFeature[]);
}

async function collectSources(pages: string[]): Promise<Row[]> {
  const db = await admin();
  const helpArticles = await readHelpCatalogue(await publicContentClient());
  const help = helpKnowledge(helpArticles);
  const rows: Row[] = [...help, ...productOverview(help)].map((d) => ({ source: "help", source_key: d.key, title: d.title, url: d.url, content: d.content }));

  const [blog, faqs, pricing] = await Promise.all([
    db.from("blog_posts").select("slug, title, excerpt, content").eq("status", "published").limit(500),
    db.from("site_faqs").select("id, page_slug, question, answer").eq("published", true).limit(1000),
    loadPublicPricingKnowledge(),
  ]);
  if (blog.error || faqs.error) throw new Error("Public knowledge could not be refreshed; the existing index is preserved");
  for (const p of (blog.data ?? []) as Array<{ slug: string; title: string; excerpt: string; content: string }>) {
    rows.push({
      source: "blog",
      source_key: `blog:${p.slug}`,
      title: p.title,
      url: `/blog/${p.slug}`,
      content: `${p.excerpt}\n\n${htmlToText(p.content ?? "")}`.slice(0, 20000),
    });
  }
  for (const f of (faqs.data ?? []) as Array<{ id: string; page_slug: string; question: string; answer: string }>) {
    rows.push({
      source: "faq",
      source_key: `faq:${f.id}`,
      title: f.question,
      url: f.page_slug && f.page_slug !== "global" ? `/${f.page_slug.replace(/^\//, "")}` : null,
      content: `${f.question}\n${f.answer}`,
    });
  }
  rows.push(...pricing.map((d) => ({ source: "pricing", source_key: d.key, title: d.title, url: d.url, content: d.content })));

  // Fetch in small batches so a long page list stays quick and light.
  const list = pages.filter(isAllowedLink).slice(0, 100);
  for (let i = 0; i < list.length; i += 8) {
    const batch = await Promise.all(list.slice(i, i + 8).map(async (page): Promise<Row | null> => {
      const url = page.startsWith("/") ? `https://munchreach.com${page}` : page;
      try {
        const res = await fetch(url, { headers: { "user-agent": "MunchMate-Indexer" } });
        if (!res.ok) return null;
        const html = await res.text();
        const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || url;
        return {
          source: "page",
          source_key: `page:${new URL(url).pathname}`,
          title,
          url: new URL(url).pathname,
          content: htmlToText(html).slice(0, 20000),
        };
      } catch {
        return null; /* skip unreachable page */
      }
    }));
    for (const r of batch) if (r) rows.push(r);
  }
  return rows;
}

/** Rebuild automatic sources. Custom admin entries are never touched. */
export async function refreshKnowledgeIndex(pages: string[]): Promise<{ indexed: number; removed: number }> {
  const db = await admin();
  const rows = await collectSources(pages);
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200).map((r) => ({ ...r, updated_at: now }));
    const { error } = await db.from("munchmate_knowledge").upsert(batch, { onConflict: "source_key", ignoreDuplicates: false });
    if (error) throw new Error(error.message);
  }
  // Remove automatic entries whose public source disappeared (unpublished etc).
  const keys = new Set(rows.map((r) => r.source_key));
  const { data: existing } = await db.from("munchmate_knowledge").select("id, source_key, source").neq("source", "custom");
  const stale = ((existing ?? []) as Array<{ id: string; source_key: string }>).filter((r) => !keys.has(r.source_key));
  if (stale.length) await db.from("munchmate_knowledge").delete().in("id", stale.map((r) => r.id));
  return { indexed: rows.length, removed: stale.length };
}

/** Fresh published Help/pricing always augment the index, even when it is nonempty. */
export async function loadKnowledge(): Promise<KnowledgeDoc[]> {
  const db = await admin();
  const helpArticles = await readHelpCatalogue(await publicContentClient());
  const help = helpKnowledge(helpArticles);
  const pricing = await loadPublicPricingKnowledge().catch(() => []);
  const { data } = await db
    .from("munchmate_knowledge")
    .select("source_key, title, url, content")
    .eq("enabled", true)
    .limit(3000);
  const docs = ((data ?? []) as Array<{ source_key: string; title: string; url: string | null; content: string }>).filter(
    // Never use stale indexed Help overrides or stale indexed pricing as current facts.
    (r) => !r.source_key.startsWith("help:") && !r.source_key.startsWith("pricing:") && r.source_key !== "product:overview",
  ).map(
    (r) => ({ key: r.source_key, title: r.title, url: r.url, content: r.content }),
  );
  return [...productOverview(help), ...pricing, ...help, ...docs];
}
