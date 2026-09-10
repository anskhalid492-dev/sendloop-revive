/**
 * Shared types for the customer-facing Help Center knowledge base.
 *
 * Every article in this library is customer-facing. Internal sending
 * infrastructure (the third-party services MunchReach uses to deliver mail),
 * provider routing, provider priority and provider credentials must never be
 * named here — `tests/help-center-content.test.ts` fails the build if they are.
 */

export type HelpCategory = {
  slug: string;
  name: string;
  description: string;
};

export type HelpFaq = {
  q: string;
  a: string;
};

export type HelpArticle = {
  slug: string;
  title: string;
  description: string;
  /** Category slug. Must exist in HELP_CATEGORIES. */
  category: string;
  /** ISO date, YYYY-MM-DD. */
  updated: string;
  popular?: boolean;
  gettingStarted?: boolean;
  /** Extra search terms that do not appear verbatim in the body. */
  keywords?: string[];
  /** Explicit related article slugs, shown before category fallbacks. */
  related?: string[];
  faqs?: HelpFaq[];
  /** Markdown-lite: "## Heading" lines, paragraphs, and "- " list items. */
  content: string;
};
