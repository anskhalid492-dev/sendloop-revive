<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Workers use atomic `acquireWorkerLease`/`releaseWorkerLease` (src/lib/worker-lease.server.ts), never read-then-write checks, to prevent overlapping cron races.
- Workers read `platform_settings.worker_mode` each tick via `getWorkerMode` (src/lib/worker-mode.server.ts); only "queue" selects queues, otherwise legacy runs, preserving flag-based rollback.
- Tests block production network via tests/setup/block-production-network.ts in vite.config.ts: the hard-pinned server client otherwise leaks unmocked fixture writes.
- AI Sales Agent (AI Decision branch `node.ai`, `ai.generate_reply`, `human.review`) calls only the MunchReach-owned provider in src/lib/sales-agent-ai.server.ts; AI Campaign Writer/Personalization keep the customer-key path and must never import it (and vice versa), because the two AI systems have separate billing and credentials.
- More rules for workers, campaigns, warmup and automations: src/lib/AGENTS.md.
- Automatic warmup uses the pure `warmup-progression` UTC schedule shared by UI and engine, with persisted per-mailbox day/limit checkpoints and atomic `reserve_mailbox_warmup_send` before provider attempts; legacy settings stay opt-in so history and existing volume are preserved, and downtime/pause never causes catch-up jumps.
- Analytics collapse emails per campaign; dated failures come from failed_at on unsent or sent-then-rejected units (never delivered); undated failures are labelled separately, never added to window totals or dated via updated_at, so history stays visible without invented dates. Confirmed delivery stays separate from accepted-minus-bounced estimates.
- Homepage hero product visualization stays presentational with labeled example data and no live-data reads, so marketing rendering cannot affect customer activity.
- Google Sign-In is direct Google Identity Services (src/lib/google-signin*.ts) using the admin-saved Web Client in src/lib/auth-providers-config.server.ts; sessions are minted as normal Supabase Auth sessions server-side. Never use Supabase's Google OAuth provider or Google Cloud Identity Platform, because the Supabase provider is intentionally disabled.

- Monthly plan email allowance meters only billable initial campaign sends (`isBillableInitialSend` in src/lib/billing/initial-send.ts, step_order vs the first email step); follow-ups skip consume/release, and an unknown first step stays metered so lookup failures never give free initials.
- Mount the exit-intent dialog only through the public SiteHeader after local auth readiness; use sessionStorage with a memory fallback and fine-pointer top-edge detection, never unload/back interception, to preserve navigation and exclude dashboard/touch users.
- Leads provider and LinkedIn presentation use pure client-safe helpers and existing domain classification, with no provider discovery requests or stored field changes, so existing leads and imported rows share the same display rules without changing CSV behavior.
- Leads opts into AppShell's contained viewport flex layout; the table owns both scroll axes and pagination stays outside that region, so header/controls remain visible without fixed table heights.
- Lead list colors live on the list row and share one presentation helper; imports create a list only for an explicit new-list destination, so existing destinations never get recolored.
- The sequence toolbar uses one Spintax Builder that captures step key, variant index, field and selection before opening; insertion uses the existing selection helper, so modal focus and option editing cannot retarget the email.
- Lifetime offers use separate manually configured Stripe mappings, never catalogue repair; verified checkout line items must match the selected plan before activation, so a new offer cannot alter original pricing or grant the wrong entitlements.
- Warmup table presentation uses warmup-table helpers and success-only per-mailbox event reads, so scheduler/failure timestamps and busy-mailbox history cannot misrepresent Last Activity.
- Affiliates retain verified Stripe/payment-key tracking; payouts share locked balance math and append-only adjustments. Proofs use purpose-bound owner/admin signing. Activation requires operational verification; production SQL is owner-applied.
- Action-confirmed onboarding notices reuse System Emails through engagement-notices.server, are opt-in per template and revalidated by both delivery paths; active marketing automations block them conservatively to prevent cross-system duplicate nudges.
- Immediate admin System Email tests pass a trusted, single-row delivery option to skip onboarding relevance and cooldown only; recipient preferences/suppression still apply and stored test flags never grant bypass, so testing cannot weaken automatic delivery safeguards.

- Public warmup schedule descriptions derive from the client-safe DEFAULT_WARMUP_STAGES constant; configuration is labeled separately from performance evidence so marketing and engine defaults cannot drift.
- Warmup inbox/spam/bounce/reply rates come only from per-job evidence in src/lib/warmup-deliverability.ts (deduped by job id, one window); health score and SMTP acceptance never imply placement, so unobserved sends stay Unverified.
- Warmup Safe presentation is gated by the client-safe warmup-display helper using observed and mailbox safety warnings; it never changes measurements or sending behavior.
- MunchMate (src/lib/munchmate*) combines enabled approved index entries with fresh published Help and explicitly projected public plan/feature data on each answer; current pricing overrides cached copy, topic-expanded retrieval has no model tools, and config/encrypted keys and existing support tickets stay unchanged, so the AI cannot reach customer data or create a second support system.
- MunchMate compacts only request copies through shared context helpers, bounds every provider text block, and retries context validation once with smaller excerpts; structured server diagnostics omit prompts, keys and provider bodies to preserve privacy.
- Help Center CMS reuses guide_articles with help_center-scoped overrides and reversible deletion; public routes and MunchMate share readHelpCatalogue, retaining built-in slugs and Markdown rendering while unpublished override bodies remain admin-only.
