# Rebuild the logged-in Support Help Center

## Outcome
Replace the seven outdated in-dashboard guides with a practical Support homepage backed by the existing 169-article MunchReach Help Center. Keep the current “Need a hand?” header, prominent search, New request action, Help Center tab, and separate My tickets experience.

## Implementation
1. **Use one knowledge base**
   - Remove the logged-in page’s separate seven-article source and import the existing Help Center article library and weighted search.
   - Preserve every existing article and URL; reuse existing articles instead of creating duplicates.
   - Add only the one requested guide not already represented: **Warmup troubleshooting**, using the current warmup statuses and controls.

2. **Rebuild the Help Center tab**
   - Add a prominent search that searches all Help Center titles, descriptions, keywords, FAQs, and article bodies.
   - Show the requested search examples as quick searches.
   - Add a numbered **Start here** path with six direct article links.
   - Add **Popular guides** as a responsive category grid for Getting Started, Campaigns, Leads, Mailboxes, AI, Sending, Inbox, Warmup, Domains, Analytics, Billing, and Troubleshooting.
   - Show 3–5 priority articles per category and a **View all →** control that reveals the complete category without leaving Support.
   - Open guides through the existing `/help-center/:slug` article pages, retaining one canonical article experience instead of embedding a second copy.
   - Keep no-results support escalation, while leaving ticket lists and conversations exclusively under **My tickets**.

3. **Improve requested guide quality in place**
   - Audit the requested guides against the current product UI and rewrite outdated or thin entries in their existing article files.
   - For each important task guide, use a short answer/TL;DR, prerequisites, numbered steps with real MunchReach labels and paths, success state, common problems, quick troubleshooting, and existing related-article links where applicable.
   - Keep conceptual guides structured around the same practical sections without forcing fake steps.
   - Remove outdated mailbox/domain-first wording and any exposed internal sending-provider language; use “MunchReach sending infrastructure/system.”

4. **Verification**
   - Add focused tests proving Support search uses the complete Help Center, requested category/Start Here slugs resolve, guide slugs remain unique, related links resolve, and forbidden provider names stay absent.
   - Run the Help Center/support tests and TypeScript check.
   - Verify `/support` on desktop and mobile: search, category expansion, article links, New request, and My tickets remain usable and visually match the existing dashboard.

## Scope safeguards
- No database, sending, scheduling, mailbox, verification, ticket, or provider-routing logic changes.
- No deletion of existing articles, duplicate knowledge base, invented controls, screenshots, statistics, limits, or promises.
- No changes to the public Help Center layout beyond shared article content corrections required for accuracy.
