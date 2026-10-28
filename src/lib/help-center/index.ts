/**
 * Customer-facing Help Center knowledge base.
 *
 * Articles live in ./articles, one file per section. Nothing in this library
 * may name the third-party services behind MunchReach's sending
 * infrastructure — see tests/help-center-content.test.ts.
 */
import { HELP_CATEGORIES } from "./categories";
import type { HelpArticle, HelpCategory, HelpFaq } from "./types";

import { GETTING_STARTED_ARTICLES } from "./articles/getting-started";
import { ACCOUNT_ARTICLES } from "./articles/account";
import { CAMPAIGN_ARTICLES } from "./articles/campaigns";
import { LEAD_ARTICLES } from "./articles/leads";
import { EMAIL_ACCOUNT_ARTICLES } from "./articles/email-accounts";
import { AI_ARTICLES } from "./articles/ai";
import { CLAUDE_ARTICLES } from "./articles/claude";
import { SENDING_ARTICLES } from "./articles/sending";
import { INBOX_ARTICLES } from "./articles/inbox";
import { WARMUP_ARTICLES } from "./articles/warmup";
import { ANALYTICS_ARTICLES } from "./articles/analytics";
import { DELIVERABILITY_ARTICLES } from "./articles/deliverability";
import { COMPLIANCE_ARTICLES } from "./articles/compliance";
import { INTEGRATION_ARTICLES } from "./articles/integrations";
import { BILLING_ARTICLES } from "./articles/billing";
import { API_ARTICLES } from "./articles/api";
import { TROUBLESHOOTING_ARTICLES } from "./articles/troubleshooting";
import { SECURITY_ARTICLES } from "./articles/security";

export type { HelpArticle, HelpCategory, HelpFaq };
export { HELP_CATEGORIES };

export const HELP_ARTICLES: HelpArticle[] = [
  ...GETTING_STARTED_ARTICLES,
  ...ACCOUNT_ARTICLES,
  ...CAMPAIGN_ARTICLES,
  ...LEAD_ARTICLES,
  ...EMAIL_ACCOUNT_ARTICLES,
  ...AI_ARTICLES,
  ...CLAUDE_ARTICLES,
  ...SENDING_ARTICLES,
  ...INBOX_ARTICLES,
  ...WARMUP_ARTICLES,
  ...ANALYTICS_ARTICLES,
  ...DELIVERABILITY_ARTICLES,
  ...COMPLIANCE_ARTICLES,
  ...INTEGRATION_ARTICLES,
  ...BILLING_ARTICLES,
  ...API_ARTICLES,
  ...TROUBLESHOOTING_ARTICLES,
  ...SECURITY_ARTICLES,
];

const BY_SLUG = new Map(HELP_ARTICLES.map((a) => [a.slug, a]));

export function categoryName(slug: string): string {
  return HELP_CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
}

export function articlesInCategory(slug: string): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === slug);
}

export function categoryCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const category of HELP_CATEGORIES) counts[category.slug] = 0;
  for (const article of HELP_ARTICLES) {
    counts[article.category] = (counts[article.category] ?? 0) + 1;
  }
  return counts;
}

export function readingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

export function formatUpdated(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function getArticle(slug: string): HelpArticle | undefined {
  return BY_SLUG.get(slug);
}

export const ARTICLES_BY_UPDATED = [...HELP_ARTICLES].sort((a, b) =>
  a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.title.localeCompare(b.title),
);

export const POPULAR_ARTICLES = HELP_ARTICLES.filter((a) => a.popular);
export const GETTING_STARTED_PATH = HELP_ARTICLES.filter((a) => a.gettingStarted);

/**
 * Search synonyms: terms customers type that never appear in the copy.
 */
const SYNONYMS: Record<string, string[]> = {
  smtp: ["mailbox", "sending", "connect"],
  imap: ["mailbox", "inbox", "receiving"],
  gmail: ["mailbox", "supported"],
  google: ["mailbox", "supported"],
  outlook: ["mailbox", "supported"],
  microsoft: ["mailbox", "supported"],
  dns: ["domain", "record"],
  bounce: ["bounced", "deliverability"],
  gpt: ["ai", "openai"],
  openai: ["ai", "personalization"],
  anthropic: ["claude"],
  ai: ["personalization"],
  cancel: ["billing", "subscription"],
  refund: ["billing"],
  price: ["billing", "plan"],
  broken: ["troubleshooting"],
  error: ["troubleshooting"],
  webhook: ["api"],
  token: ["api", "key"],
};

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 1);
}

function scoreArticle(article: HelpArticle, terms: string[]): number {
  const title = article.title.toLowerCase();
  const description = article.description.toLowerCase();
  const keywords = (article.keywords ?? []).join(" ").toLowerCase();
  const category = categoryName(article.category).toLowerCase();
  const content = article.content.toLowerCase();
  const faqs = (article.faqs ?? []).map((f) => `${f.q} ${f.a}`).join(" ").toLowerCase();

  let score = 0;
  for (const term of terms) {
    let hit = 0;
    if (title.includes(term)) hit += 10;
    if (article.slug.includes(term)) hit += 8;
    if (keywords.includes(term)) hit += 6;
    if (description.includes(term)) hit += 4;
    if (category.includes(term)) hit += 3;
    if (faqs.includes(term)) hit += 2;
    if (content.includes(term)) hit += 1;
    if (hit === 0) {
      for (const synonym of SYNONYMS[term] ?? []) {
        if (title.includes(synonym) || keywords.includes(synonym) || category.includes(synonym)) {
          hit += 3;
          break;
        }
      }
    }
    score += hit;
  }
  if (score > 0 && article.popular) score += 1;
  return score;
}

export function searchArticles(query: string, category: string, articles = HELP_ARTICLES): HelpArticle[] {
  const pool = category === "all" ? articles : articles.filter((a) => a.category === category);
  const terms = tokenize(query);
  if (terms.length === 0) return pool;

  return pool
    .map((article) => ({ article, score: scoreArticle(article, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
    .map((entry) => entry.article);
}

export function relatedArticles(article: HelpArticle, limit = 4, articles = HELP_ARTICLES): HelpArticle[] {
  const picked: HelpArticle[] = [];
  const seen = new Set([article.slug]);

  for (const slug of article.related ?? []) {
    const match = articles.find((a) => a.slug === slug);
    if (match && !seen.has(match.slug)) {
      picked.push(match);
      seen.add(match.slug);
    }
    if (picked.length >= limit) return picked;
  }

  for (const candidate of articles.filter((a) => a.category === article.category)) {
    if (seen.has(candidate.slug)) continue;
    picked.push(candidate);
    seen.add(candidate.slug);
    if (picked.length >= limit) break;
  }

  return picked;
}

export function articleNeighbours(slug: string, articles = HELP_ARTICLES) {
  const ordered = HELP_CATEGORIES.flatMap((category) => articles.filter((a) => a.category === category.slug));
  const index = ordered.findIndex((a) => a.slug === slug);
  return {
    previous: index > 0 ? ordered[index - 1] : undefined,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : undefined,
  };
}

/** Slugs that must never break: they were published before the rewrite. */
export const LEGACY_ARTICLE_SLUGS = [
  "quick-start",
  "connect-a-mailbox",
  "smtp-550-5-7-1",
  "why-import-skipped-rows",
  "stop-rules",
  "variables-and-fallbacks",
  "launch-readiness",
  "mailbox-stuck-warming-up",
  "inbox-replies-and-threading",
  "crm-pipeline-basics",
  "reading-analytics",
  "connect-integrations",
  "team-roles-and-visibility",
  "transfer-workspace-ownership",
  "export-workspace-data",
  "plans-and-invoices",
  "cancel-downgrade-refunds",
  "spam-placement-first-checks",
] as const;
