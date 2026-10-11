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
- Workspace analytics collapse logical emails separately per campaign and derive dated failure totals only from unsent units with failure timestamps; confirmed delivery availability stays separate from accepted-minus-bounced estimates, so analytics cannot invent delivery evidence or move legacy failures between periods.
- Homepage hero product visualization stays presentational with labeled example data and no live-data reads, so marketing rendering cannot affect customer activity.
- Google Sign-In is direct Google Identity Services (src/lib/google-signin*.ts) using the admin-saved Web Client in src/lib/auth-providers-config.server.ts; sessions are minted as normal Supabase Auth sessions server-side. Never use Supabase's Google OAuth provider or Google Cloud Identity Platform, because the Supabase provider is intentionally disabled.

- Monthly plan email allowance meters only billable initial campaign sends (`isBillableInitialSend` in src/lib/billing/initial-send.ts, step_order vs the first email step); follow-ups skip consume/release, and an unknown first step stays metered so lookup failures never give free initials.
