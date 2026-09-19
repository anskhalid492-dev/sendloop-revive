import { describe, expect, it } from "vitest";

import {
  ARTICLES_BY_UPDATED,
  HELP_ARTICLES,
  HELP_CATEGORIES,
  LEGACY_ARTICLE_SLUGS,
  articleNeighbours,
  categoryCounts,
  getArticle,
  relatedArticles,
  searchArticles,
} from "@/lib/help-center";
import {
  SUPPORT_GUIDE_GROUPS,
  SUPPORT_START_HERE,
  resolveSupportArticles,
} from "@/lib/support-guide-config";

/**
 * Customer-facing Help Center content must never name the third-party services
 * behind MunchReach's sending infrastructure.
 */
const FORBIDDEN_PROVIDER_NAMES = [
  "resend",
  "amazon ses",
  " ses ",
  "sendgrid",
  "mailgun",
  "postmark",
  "brevo",
  "sparkpost",
  "mailchimp",
  "uspeedo",
  "nuntly",
  "elastic email",
  "elasticemail",
  "maileroo",
  "courier",
  "supabase",
];

function haystack(): { slug: string; text: string }[] {
  return HELP_ARTICLES.map((a) => ({
    slug: a.slug,
    text: [
      a.title,
      a.description,
      a.content,
      (a.keywords ?? []).join(" "),
      (a.faqs ?? []).map((f) => `${f.q} ${f.a}`).join(" "),
    ]
      .join("\n")
      .toLowerCase(),
  }));
}

describe("help center integrity", () => {
  it("has a substantial knowledge base", () => {
    expect(HELP_ARTICLES.length).toBeGreaterThanOrEqual(90);
    expect(HELP_CATEGORIES.length).toBe(18);
  });

  it("has unique article slugs", () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique category slugs", () => {
    const slugs = HELP_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("assigns every article to a real category", () => {
    const known = new Set(HELP_CATEGORIES.map((c) => c.slug));
    for (const article of HELP_ARTICLES) {
      expect(known.has(article.category), `${article.slug} -> ${article.category}`).toBe(true);
    }
  });

  it("leaves no category empty", () => {
    const counts = categoryCounts();
    for (const category of HELP_CATEGORIES) {
      expect(counts[category.slug], `${category.slug} has no articles`).toBeGreaterThan(0);
    }
  });

  it("only references related articles that exist", () => {
    const known = new Set(HELP_ARTICLES.map((a) => a.slug));
    for (const article of HELP_ARTICLES) {
      for (const slug of article.related ?? []) {
        expect(known.has(slug), `${article.slug} -> related ${slug}`).toBe(true);
      }
    }
  });

  it("keeps every previously published URL working", () => {
    for (const slug of LEGACY_ARTICLE_SLUGS) {
      expect(getArticle(slug), `legacy slug ${slug} is missing`).toBeDefined();
    }
  });

  it("gives every article real content and metadata", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.title.length, article.slug).toBeGreaterThan(5);
      expect(article.description.length, article.slug).toBeGreaterThan(20);
      expect(article.content.length, article.slug).toBeGreaterThan(300);
      expect(article.updated, article.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("exposes popular and getting-started entry points", () => {
    expect(HELP_ARTICLES.filter((a) => a.popular).length).toBeGreaterThanOrEqual(10);
    expect(HELP_ARTICLES.filter((a) => a.gettingStarted).length).toBeGreaterThanOrEqual(3);
  });

  it("orders recently updated articles newest first", () => {
    for (let i = 1; i < ARTICLES_BY_UPDATED.length; i += 1) {
      expect(ARTICLES_BY_UPDATED[i - 1]!.updated >= ARTICLES_BY_UPDATED[i]!.updated).toBe(true);
    }
  });

  it("returns related articles for every article", () => {
    for (const article of HELP_ARTICLES) {
      const related = relatedArticles(article);
      expect(related.length, article.slug).toBeGreaterThan(0);
      expect(related.some((r) => r.slug === article.slug)).toBe(false);
    }
  });

  it("walks neighbours without leaving the library", () => {
    const first = HELP_ARTICLES[0]!;
    expect(articleNeighbours(first.slug)).toBeDefined();
  });
});

describe("help center search", () => {
  const cases: { query: string; expected: string }[] = [
    { query: "csv import", expected: "csv-import-guide" },
    { query: "claude", expected: "claude-overview" },
    { query: "anthropic key", expected: "connect-claude" },
    { query: "warmup", expected: "how-warmup-works" },
    { query: "spam folder", expected: "spam-placement-first-checks" },
    { query: "api key", expected: "api-keys" },
    { query: "webhook", expected: "api-webhooks" },
    { query: "invoice", expected: "plans-and-invoices" },
    { query: "unsubscribe", expected: "manage-unsubscribes" },
    { query: "gmail", expected: "supported-account-types" },
    { query: "mailbox error", expected: "mailbox-troubleshooting" },
    { query: "campaign not sending", expected: "why-campaign-not-sending" },
    { query: "replies", expected: "inbox-replies-and-threading" },
    { query: "billing", expected: "plans-and-invoices" },
  ];

  for (const { query, expected } of cases) {
    it(`finds ${expected} for "${query}"`, () => {
      const results = searchArticles(query, "all").slice(0, 8);
      expect(results.map((r) => r.slug)).toContain(expected);
    });
  }

  it("returns nothing for gibberish", () => {
    expect(searchArticles("zzzqqqxyzzy", "all")).toHaveLength(0);
  });

  it("restricts results to the selected category", () => {
    const results = searchArticles("domain", "billing");
    for (const result of results) expect(result.category).toBe("billing");
  });

  it("returns the whole category when the query is empty", () => {
    expect(searchArticles("", "warmup").length).toBeGreaterThan(0);
  });
});

describe("logged-in support guide curation", () => {
  it("resolves every Start Here guide from the shared Help Center", () => {
    expect(resolveSupportArticles(SUPPORT_START_HERE)).toHaveLength(SUPPORT_START_HERE.length);
  });

  it("resolves every featured guide without creating a second article source", () => {
    for (const group of SUPPORT_GUIDE_GROUPS) {
      expect(resolveSupportArticles(group.articles), group.slug).toHaveLength(group.articles.length);
    }
  });

  it("includes all requested guides, including intentional cross-category links", () => {
    const placements = SUPPORT_GUIDE_GROUPS.flatMap((group) => [...group.articles]);
    expect(placements).toHaveLength(63);
    expect(new Set(placements).size).toBe(60);
  });

  it("includes every requested Support category", () => {
    expect(SUPPORT_GUIDE_GROUPS.map((group) => group.slug)).toEqual([
      "getting-started", "campaigns", "leads", "email-accounts", "ai", "sending",
      "inbox", "warmup", "analytics", "billing", "troubleshooting",
    ]);
  });

  it("does not expose domain verification or sending-domain guides", () => {
    const text = HELP_ARTICLES.map((article) => `${article.slug} ${article.title} ${article.description} ${article.content}`).join("\n").toLowerCase();
    expect(HELP_CATEGORIES.map((category) => category.slug)).not.toContain("domains");
    expect(text).not.toContain("domain verification");
    expect(text).not.toContain("verify domain");
    expect(text).not.toContain("sending domain");
  });
});

describe("customer privacy audit", () => {
  it("never names internal sending infrastructure providers", () => {
    const offences: string[] = [];
    for (const { slug, text } of haystack()) {
      for (const name of FORBIDDEN_PROVIDER_NAMES) {
        if (text.includes(name)) offences.push(`${slug}: "${name.trim()}"`);
      }
    }
    expect(offences).toEqual([]);
  });

  it("has no public Email Providers category", () => {
    for (const category of HELP_CATEGORIES) {
      expect(category.name.toLowerCase()).not.toContain("email provider");
      expect(category.slug).not.toBe("email-providers");
    }
  });
});
