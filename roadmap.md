# Roadmap

## Microsoft 365 Graph mailboxes
- [x] Callback exchanges code with validated state/PKCE, stores encrypted tokens, verifies inbox access before marking connected.
- [x] Graph sending (Mail.Send), Inbox/Junk sync into existing reply/bounce/warmup pipeline, token refresh with rotation, disconnect/reconnect UI; 2,200 offline tests pass.
- [x] Tenant value settled: app supports "Any Entra ID tenant + personal Microsoft accounts", so MICROSOFT_TENANT_ID must be `common`; code now accepts `common` (previously only a directory GUID or `organizations`).
- [ ] Owner applies supabase/manual/microsoft-graph-mailboxes.sql to production — blocked: manual production SQL.
- [ ] Publish so the live site accepts `common`, then test with a named throwaway mailbox (consent, send, reply, refresh, disconnect/reconnect) — blocked: publish approval.

## Campaign sending reconciliation
- [x] Audit Agencies - Free Trials and all 116 held IDs read-only; 20 have pixel events, none has recorded acceptance/delivery/rejection evidence.
- [x] Unify preview message-ID outcomes, distinguish provider acceptance from receipts, and remove cancelled follow-ups from bounced-message totals.
- [x] Harden delivery/recovery/retry writes and prepare unapplied append-only history SQL without resending or changing production records.
- [x] Run 2,171 isolated checks and document actual reconciliation in docs/campaign-reconciliation-2026-11-06.md with a complete 116-ID CSV.
- [ ] Resolve held outcomes against authoritative provider logs and verify signed-in campaign/dashboard/export on a named throwaway account — blocked: provider logs and external-backend test session unavailable.
- [ ] Apply approved future status-history SQL and verify real provider-event behavior — blocked: owner approval/manual production migration; nothing published or deployed.

## MunchMate chat validation
- [x] Bound request history and knowledge excerpts without truncating the latest valid question or stored history.
- [x] Add one reduced-context retry and friendly errors with server-only diagnostics.
- [x] Verify 52 isolated regressions including OpenAI/Claude request and retry fixtures; preview checks covered 80-message legacy history, three consecutive answers and friendly failure. Nothing published.

## MunchMate product and pricing knowledge
- [x] Improve broad and multi-topic retrieval and always merge current published Help content.
- [x] Add structured current public plan knowledge and grounded product/sales instructions without changing chat or support.
- [x] Test the ten requested questions with isolated fixtures and anonymous preview conversations without publishing.
- [ ] Refresh shared website/blog/FAQ index through Admin — blocked: owner-authorized Admin action is required; current Help and pricing already read fresh on each answer.

## Help Center article management
- [x] Reuse guide article storage for Admin create/edit/draft/publish/preview and reversible deletion.
- [x] Connect the existing public Help Center and MunchMate indexing to the same published catalogue.
- [x] Add isolated regressions and verify public preview; prepare owner-applied SQL without deploying.
- [ ] Apply owner-reviewed help-center-cms.sql and verify Admin save/publish/image/index refresh — blocked: production SQL is manual and no named throwaway test-account session is available.

## Compact warmup dashboard
- [x] Remove summaries and extra columns; place four time filters above the mailbox table.
- [x] Preserve evidence-only rates and add warning-gated Safe status separately from percentages; 132 isolated warmup regressions passed.
- [ ] Signed-in table verification — blocked: externally managed backend has no named throwaway test-account session.

## Crypto-only affiliate payouts
- [x] Inspect existing ledger, portals, development policies and private R2 integration; preserve historical records and Stripe behavior.
- [x] Prepare owner-applied additive SQL for verified wallets, $100 requests, locked manual settlements, auditable adjustments and private proofs; no migrations executed.
- [x] Replace existing payout controls and refresh affiliate/agency pages with distinct branded layouts.
- [x] Verify 70 affiliate regressions, 2,032 full-suite tests, public desktop/mobile pages and automatic production compilation; report in docs/affiliate-crypto-payouts-report.md. No activation or publishing.
- [ ] Apply owner-reviewed production SQL and verify authenticated wallet/payout/proof readback on named throwaway accounts — blocked: production schema is owner-managed; external backend has no test-account session; actual private R2 proof upload is unverified.

## Public sending and warmup claims
- [x] Audit public claims against connected-mailbox sending and warmup implementation; no customer data accessed.
- [x] Correct relevant copy, example labels and evidence context while preserving page layouts and sending logic.
- [x] Verify 133 isolated tests, 19 public pages and warmup FAQ interaction; automatic production build OK. Exact claims: docs/public-sending-claims-review.md. No publishing.

## Onboarding System Email test correction
- [x] Identify missing workspace context in admin tests and separate trusted single-message tests from automatic relevance/cooldown checks while preserving recipient safeguards.
- [x] Run isolated test-send and onboarding/transactional regressions: 77 tests passed; automatic compilation passed. No customer emails or publication.
- [ ] Verify delivery through signed-in Admin on a named throwaway recipient — blocked: external backend has no available test-account session; actual inbox delivery remains unverified.

## Customer lifecycle and System Emails
- [x] Audit eight requested triggers, existing templates, scheduler, preferences and duplicate prevention; preserve working messages.
- [x] Add two action-confirmed notices, disabled by default, through existing System Emails with send-time revalidation; preserve provider settings.
- [x] Add admin trigger visibility, isolated tests and completion report; no customer sends, publication or deployment.
- [ ] Delayed mailbox/launch nudges, usage-based upgrade and seven-day re-engagement — blocked: promotional/drip sending unsupported by Lovable app-email policy; existing marketing system needs a separately agreed supported sending path.
- [ ] Verify signed-in Admin and end-to-end on explicitly named throwaway accounts — blocked: no external-backend test session available. New notices stay disabled; marketing-overlap and timezone delivery audit required before activation.

## Affiliate program upgrade
- [x] Audit existing tracking, payments, dashboards, permissions and available development schema; production applied schema remains unverified.
- [x] Add payment-based monthly/lifetime/annual commissions, idempotency, reversals and protected payout management; isolate test earnings.
- [x] Upgrade customer/admin affiliate management, public referral/agency pages and footer links.
- [x] Run scoped regressions, full suite and automatic compilation; report manual production activation prerequisites without publishing.
- [ ] Verify signed-in attribution, Stripe test checkout and payout review on explicitly named throwaway accounts — blocked: external backend has no available test-account session; no real payment-provider actions permitted in verification.
- [ ] Activate production only after owner-applied migrations, historical-balance reconciliation and verified test-account flow — blocked: production database changes are manual; no publication/deployment requested.

## Warmup table activity and spam guidance
- [x] Replace Replied with relative successful warmup activity; change unknown spam guidance at 100/below 80 health only.
- [x] Verify isolated rules and 104 warmup regressions; automatic production compilation passed. No publication or sending changes.
- [ ] Verify signed-in table with named throwaway mailbox — blocked: externally managed sign-in has no available test-account session.

## Lifetime Starter
- [x] Inspect existing plan configuration, selection, checkout and webhook verification.
- [x] Prepare additive Starter data transaction: cloned features, 4,000 contacts, 10,000 monthly emails, $29; preserve original.
- [x] Show saved lifetime offers on lifetime/customer billing and compare three competitors with favicons.
- [x] Validate separate one-time USD prices, selected-plan checkout and verified activation; 1,911 tests passed, compilation clean.
- [x] Report manual production configuration and unverified authenticated/provider flows; no publication.
- [ ] Production Starter insert, separate Stripe Price ID and authenticated test payment/readback — blocked: owner-managed production data and scoped test session.

## Independent automatic mailbox warmup
- [x] Inspect engine, queue, counters, health, settings and permissions.
- [x] Add shared deterministic progression, per-mailbox modes, pause-safe state and additive SQL; applied to development database only.
- [x] Upgrade warmup settings, dashboard and mailbox list.
- [x] Run isolated logic/database safety regressions and full suite; verify editor at desktop/tablet/mobile without production sends.
- [ ] Apply production SQL and verify signed-in test mailbox — blocked: owner-managed production changes and scoped test session required.

## List colors and existing Spintax Builder
- [x] Add saved list colors to creation, CSV destinations, editing and all existing list displays; preserve existing-list selection.
- [x] Refine the existing spintax control with editable options, nested syntax and captured field/step/variant selection.
- [x] Run 42 isolated regressions and production-blocked browser checks for CSV review, colors, multiple options, nested syntax, body/subject selection, variants and multiple steps; no publication.
- [ ] Apply additive list-color column and verify real saved colors/full import after refresh — blocked: production SQL is manual; external backend has no scoped throwaway test-account session. Script: supabase/manual/lead-list-colors.sql.

## Leads viewport scrolling
- [x] Constrain the Leads layout to available viewport space, keep controls/pagination visible, and scroll only the table with sticky headers.
- [x] Verify all 50 fixture rows, sticky headers, both scroll axes, pagination and selection at five viewport sizes; 42 regression tests passed. No production data changes or publishing.
- [ ] Verify the complete signed-in Leads screen — blocked: externally managed backend has no available test-account session; isolated table checks passed.

## Leads table redesign
- [x] Refresh the compact table while preserving existing controls and lead fields.
- [x] Add provider marks and icon-only stored LinkedIn links without backend or CSV changes.
- [x] Run 42 isolated regressions and table interaction/presentation checks with existing and CSV-mapped fake rows at desktop/tablet/mobile sizes; build OK; not published.
- [ ] Verify authenticated full-page import/export and actual existing/newly imported test-account leads — blocked: external backend has no available test-account session. Reference attachment was unavailable, so exact reference matching remains unverified.

## Public exit-intent popup
- [x] Add the exact founder popup copy and accessible public-only dialog without changing website content.
- [x] Verify session suppression, delayed desktop exit intent, dismissal, and desktop/tablet/mobile presentation in preview; 12 isolated tests passed, browser checks passed, build OK; not published.

## Analytics targeted restoration
- [x] Restore original screenshot-led Engagement Overview layout while keeping theme series colors and organized lower cards.
- [x] Trace metric source/filter differences and show unconfirmed delivery honestly without changing rate formulas.
- [x] Add isolated metric/filter regression tests, verify presentation, and report limitations without deploying (docs/analytics-restoration-report.md).
- [ ] Reconcile exact reported production totals — blocked: no authorized scoped account/session and exact date/campaign/mailbox selection.

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
