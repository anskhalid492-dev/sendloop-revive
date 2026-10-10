# Roadmap

## Analytics targeted restoration
- [ ] Restore original screenshot-led Engagement Overview layout while keeping theme series colors and organized lower cards.
- [ ] Trace metric source/filter differences and show unconfirmed delivery honestly without changing rate formulas.
- [ ] Add isolated metric/filter regression tests, verify presentation, and report limitations without deploying.

## Open tracking pre-deployment review
- [x] Review signature validation, scanner evidence, persistence, privacy and campaign/warmup isolation.
- [x] Add missing isolated regression tests and run tracking, campaign analytics and security coverage (114 passed, 15 release-blocking failures).
- [x] Deliver PASS/FAIL/NOT TESTED report in docs/open-tracking-predeployment-review.md; no deployment, formula or historical-data changes.

## Analytics and automatic prospect replies
- [x] Audit analytics calculations, theme, inbound classification, CRM and queue integration.
- [x] Upgrade engagement chart and metric cards using shared filters and accurate data.
- [x] Harden automatic classification, manual overrides, compliance and idempotent CRM sync.
- [x] Run 180 isolated regression tests and rendered UI checks; report limitations without publishing (docs/analytics-reply-upgrade-report.md).
- [ ] Complete authenticated visual/RLS and database-backed recovery checks before publishing.

## Homepage hero presentation
- [x] Integrate genuine review-platform links above a centered headline and remove the standalone homepage review strip.
- [x] Verify the unchanged copy, links and product visualization on desktop, tablet and mobile.
- [x] Redesign only the hero and its product visualization, preserving all existing messaging and CTAs.
- [x] Verify desktop, tablet and mobile presentation, product imagery, copy preservation and relevant checks.

- [x] Audit the existing Support page, Help Center content, search, and current product workflows.
- [x] Rebuild /support around Start Here and categorized popular guides without duplicating the knowledge base.
- [x] Update existing articles and add only missing guides with practical step-by-step content.
- [x] Verify complete Help Center search, ticket separation, responsive layout, metadata, type-check, and focused tests.
- [x] Remove domain-verification and sending-domain articles from the public Help Center and logged-in Support.
- [x] Create the public Email Signature product page using only existing feature capabilities.
- [x] Add Email Signature to the existing Products menu and footer without duplicates.
- [x] Verify metadata, internal links, tests, and responsive rendering.
- [x] Replace pricing-page sending-capacity wording with Email Accounts.
- [x] Rebuild the existing pricing comparison from verified product capabilities and live plan limits.
- [x] Verify pricing comparison tests and responsive rendering.
- [x] Audit all nine existing legal pages for legacy domain and DNS framing.
- [x] Update legal content around connected mailboxes, email sending, customer data, and compliance.
- [x] Verify all legal routes, links, terminology, and provider-name exclusions.

## Plan entitlement enforcement (done)
- Central gates: src/lib/billing/gates.server.ts (mailbox capacity, warmup, contacts, campaigns, team, AI, sending).
- Enforced at: mailbox connection (customer-mailboxes), setMailboxWarmup, bulkSetWarmup, saveWarmupSettings, runWarmupNow, warmup runner (schedule + queued job + manual run).
- Mailbox count is now the union of mailboxes + sending_accounts addresses, used by both the gate and the Billing usage panel.
- Over-limit workspaces keep their data; further mailboxes/warmup are refused.

## Pricing and plan limits update
- [x] Inspect existing pricing, grants, checkout mappings, period metering, and limit gates.
- [x] Update existing plan records and feature rows without creating a second pricing system.
- [x] Keep Free Trial unchanged and preserve existing customer subscriptions/campaigns.
- [x] Update pricing and lifetime pages/comparison copy.
- [x] Verify backend limits, yearly monthly allowances, lifetime monthly sends, and focused tests.

## Founder-led About page rebuild
- [x] Replace the existing `/about` content with the supplied company-voice founder story.
- [x] Preserve the route, global header, footer, typography, branding, and design system.
- [x] Verify desktop and mobile rendering, metadata, links, and factual guardrails.

## Background job reliability (plan: background-job-reliability-staged-migration)
- [x] Phase A: atomic leases (campaign, transactional, mailbox poll), retry jitter, inbound dead-letter fix, birthday once/day, structured logs, tests.
- [x] Phase B/D SQL written: supabase/manual/background-jobs.sql, supabase/manual/stagger-cron-schedules.sql.
- [ ] Apply Phase B/D SQL in production — blocked: needs backups/PITR first and manual run by owner.
- [ ] Phase C queue mode per worker: inbound code ready (flag still legacy) — waiting on owner activation; then transactional, warmup, mailbox, campaign.
- [ ] Phase E admin worker health page — blocked on Phase B tables.

- [x] Open-tracking blocker remediation (secrets, grammar, attribution, scanner, persistence, concurrency, logs) — unpublished, awaiting approval
- [ ] Click/marketing tracking still use public/literal signing fallbacks — follow-up, needs owner decision
