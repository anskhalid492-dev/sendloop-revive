# Roadmap

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

## Plan entitlement enforcement (done)
- Central gates: src/lib/billing/gates.server.ts (mailbox capacity, warmup, contacts, campaigns, team, AI, sending).
- Enforced at: mailbox connection (customer-mailboxes), setMailboxWarmup, bulkSetWarmup, saveWarmupSettings, runWarmupNow, warmup runner (schedule + queued job + manual run).
- Mailbox count is now the union of mailboxes + sending_accounts addresses, used by both the gate and the Billing usage panel.
- Over-limit workspaces keep their data; further mailboxes/warmup are refused.
