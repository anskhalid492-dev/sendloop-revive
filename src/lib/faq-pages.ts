/**
 * Marketing pages that render a page-scoped FAQ section.
 *
 * The slug is what the admin assigns FAQs to, and what each page passes to
 * <PageFaqs page="…" />. Pages absent from this list intentionally have no FAQ
 * section.
 */
export const FAQ_PAGE_SLUGS = [
  "home",
  "features",
  "pricing",
  "how-it-works",
  "about",
  "why-munchreach",
  "integrations",
  "campaigns",
  "follow-ups",
  "unified-inbox",
  "warmup",
  "crm",
  "analytics",
  "email-accounts",
  "workspaces",
  "templates",
  "automations",
  "contact",
  "referral",
  "blog",
] as const;

export type FaqPageSlug = (typeof FAQ_PAGE_SLUGS)[number];
