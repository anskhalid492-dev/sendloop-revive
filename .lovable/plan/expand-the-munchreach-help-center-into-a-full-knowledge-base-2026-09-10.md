# Expand the MunchReach Help Center into a full knowledge base

## What exists today

The Help Center is a static content library (`src/lib/help-center-content.ts`) with 11 categories and 18 articles, a search + category browser page, and an article page with table of contents, related articles, previous/next and a helpfulness vote. There is no database, no admin-only documentation area, and Help Center pages are not listed in the sitemap.

All 18 existing articles are accurate and already avoid naming the sending providers. They will be kept, re-filed into the new category structure, and lightly expanded — none will be duplicated.

## What will change

### Categories (18, customer-facing only)

Getting Started · Account & Workspace · Campaigns · Leads & Contacts · Email Accounts & Mailboxes · AI & Personalization · Claude · Sending & Scheduling · Inbox & Conversations · Warmup · Analytics & Reporting · Domains & DNS · Deliverability · Compliance & Suppression · Integrations · Billing & Subscriptions · API & Developers · Troubleshooting · Security & Privacy

No "Email Providers" category. No article will name the underlying sending services; they are described as "MunchReach sending infrastructure".

### Articles

Roughly 90–110 substantial articles, written against the real product (real page names, buttons, statuses), grouped so each category has genuine depth rather than filler. Priority order follows the 26 high-value articles in the request, then the remaining topics.

Each article gets: a short answer, when you need it, numbered steps using real UI labels, notes, common problems, FAQ entries where useful, keywords for search, and explicit related-article links.

API and webhook articles will be written from the actual v1 catalog (`src/lib/api/v1/catalog.ts`) — auth, campaigns, sequence steps, contacts, mailboxes, replies, analytics, webhooks and deliveries. No invented endpoints.

Features that do not exist in the product will not be documented. Google/Microsoft mailbox connection will only be described if the connect flow actually supports it; otherwise the mailbox articles cover the connection types that do exist.

### Structure and code

- Split content into `src/lib/help-center/` (types, categories, per-section article files, index) so the library stays maintainable, keeping the existing exported helper API so both routes keep working.
- Add `keywords` and `related` fields to the article type; related articles use explicit links first, then same-category fallback.
- Search: weighted matching over title, keywords, description, category and body, plus synonym handling ("DKIM", "CSV", "not sending", "Claude"). Category filter and quick-search chips updated.
- Homepage: 18 category cards with counts and icons, updated search placeholder "Search MunchReach Help...", popular and getting-started rails.
- Article page: add FAQ rendering and FAQPage JSON-LD, breadcrumb JSON-LD, canonical (already present via `metaFor`).
- Add every Help Center article and category to `sitemap.xml`.

### Admin documentation

Internal provider/routing documentation is out of scope for the customer Help Center. Rather than building a second gated docs system, admin infrastructure notes stay where they already live: the repo `docs/` folder and Admin → Email Providers. Nothing internal is added to any public route, so there is no customer-reachable internal URL to guard.

## Verification

- Full-text audit of the content library for the ten internal provider names; build fails loudly if any appears (a test in `tests/`).
- Test coverage for: unique slugs, every `related` slug resolves, every article's category exists, search returns the expected article for the sample queries in the request.
- Browser check of `/help-center`, a sample article, search, and mobile width.
- Typecheck plus the full test suite.

## Report

A final summary listing retained/new/updated articles, categories, search and SEO changes, API and troubleshooting coverage, and the provider-name audit result.
