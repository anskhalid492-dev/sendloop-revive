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
- Campaign Leads pages join `leads` only when a lead-column filter is active (src/lib/campaign-leads-page.ts); otherwise page recipients alone and load that page's leads by id, because the full join+sort on every refresh was the top DB cost.
- Campaign queue mode (src/lib/campaign-queue.server.ts) wraps the existing runCampaign dispatcher as per-campaign `campaign_tick` jobs and shares the legacy `campaign_scheduler_lease`, so sending rules live in one place and legacy/queue can never overlap; its crash recovery is at-most-once (unproven `processing` sends are held as failed, never resent).
- Mailbox queue mode (src/lib/mailbox-queue.server.ts) wraps the existing `pollMailbox` as per-mailbox `mailbox_poll` jobs selected by the shared `loadPollableMailboxes`, shares the legacy `mailbox_poll_lease`, and never claims more jobs per run than it selected, so IMAP workload cannot exceed legacy.
- Mailbox poll runs only start new mailbox work within a start budget (legacy ~20s; queue ~10s with a 4-slot pool refilled per freed slot) and never interrupt or time-limit in-flight IMAP reads, because valid customer reads take up to ~23s, background runs are killed at ~30s, and a killed run leaves the shared lease held.
- Warmup queue mode (src/lib/warmup-queue.server.ts) wraps the existing warmup engine (shared `scheduleWarmupDue`, `claim_warmup_jobs`, `processJob`) in one `warmup_tick` background job per run, shares the legacy `warmup_runner_state` lease, sends sequentially within a ~20s start budget, and is at-most-once on crash (stale queue-owned `processing` sends are failed, never resent), so legacy limits and volume stay authoritative.
