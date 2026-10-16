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
- Background worker single-flight uses `acquireWorkerLease`/`releaseWorkerLease` (src/lib/worker-lease.server.ts) on a platform_settings row — never read-then-write lease checks, because overlapping cron ticks race.
- Background workers choose their path per tick from `platform_settings.worker_mode` via `getWorkerMode` (src/lib/worker-mode.server.ts); anything but an explicit "queue" runs the legacy path, so flipping the flag back is the rollback.
- Tests block all network calls to the production project (tests/setup/block-production-network.ts, loaded via vite.config.ts), because the server client is hard-pinned to production and unmocked tests leaked fixture IDs ("ws-1", "lead-1") into it.
- AI Sales Agent (AI Decision branch `node.ai`, `ai.generate_reply`, `human.review`) calls only the MunchReach-owned provider in src/lib/sales-agent-ai.server.ts; AI Campaign Writer/Personalization keep the customer-key path and must never import it (and vice versa), because the two AI systems have separate billing and credentials.
- More rules for workers, campaigns, warmup and automations: src/lib/AGENTS.md.
- Automatic warmup uses the pure `warmup-progression` UTC schedule shared by UI and engine, with persisted per-mailbox day/limit checkpoints and atomic `reserve_mailbox_warmup_send` before provider attempts; legacy settings stay opt-in so history and existing volume are preserved, and downtime/pause never causes catch-up jumps.
- Workspace analytics collapse logical emails separately per campaign and derive dated failure totals only from unsent units with failure timestamps; the Failed Sends inventory also includes explicitly labelled undated failures, never dated via updated_at, so historical failures stay visible without inventing occurrence dates. Confirmed delivery availability stays separate from accepted-minus-bounced estimates.
- Homepage hero product visualization stays presentational with labeled example data and no live-data reads, so marketing rendering cannot affect customer activity.
- Google Sign-In is direct Google Identity Services (src/lib/google-signin*.ts) using the admin-saved Web Client in src/lib/auth-providers-config.server.ts; sessions are minted as normal Supabase Auth sessions server-side. Never use Supabase's Google OAuth provider or Google Cloud Identity Platform, because the Supabase provider is intentionally disabled.

- Monthly plan email allowance meters only billable initial campaign sends (`isBillableInitialSend` in src/lib/billing/initial-send.ts, step_order vs the first email step); follow-ups skip consume/release, and an unknown first step stays metered so lookup failures never give free initials.
- Mount the exit-intent dialog only through the public SiteHeader after local auth readiness; use sessionStorage with a memory fallback and fine-pointer top-edge detection, never unload/back interception, to preserve navigation and exclude dashboard/touch users.
- Leads provider and LinkedIn presentation use pure client-safe helpers and existing domain classification, with no provider discovery requests or stored field changes, so existing leads and imported rows share the same display rules without changing CSV behavior.
- Leads opts into AppShell's contained viewport flex layout; the table owns both scroll axes and pagination stays outside that region, so header/controls remain visible without fixed table heights.
- Lead list colors live on the list row and share one presentation helper; imports create a list only for an explicit new-list destination, so existing destinations never get recolored.
- The sequence toolbar uses one Spintax Builder that captures step key, variant index, field and selection before opening; insertion uses the existing selection helper, so modal focus and option editing cannot retarget the email.
- Lifetime offers use separate manually configured Stripe mappings, never catalogue repair; verified checkout line items must match the selected plan before activation, so a new offer cannot alter original pricing or grant the wrong entitlements.
