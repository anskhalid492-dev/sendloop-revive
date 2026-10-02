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
