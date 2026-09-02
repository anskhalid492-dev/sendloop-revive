# Make analytics fast again

Analytics, the dashboard, the campaigns list and the campaign page each rebuild their numbers by downloading every email row for the whole workspace, then filtering by date in memory. The Analytics page does this five times per render, and every screen repeats it every 20 seconds. With thousands of queued/sent emails this means long spinners and possible timeouts.

## What to change

1. **Filter in the database, not in memory**
   In `src/lib/campaign-stats.server.ts`, push the selected date window into the queries:
   - `campaign_messages`: keep rows whose `sent_at`, `updated_at` or `scheduled_at` fall in the window (an `.or(...)` filter), so pending/scheduled counts stay correct.
   - `email_engagement_events`: filter on `occurred_at`.
   - `campaign_recipients`: only needed for the lead count, so fetch it as an aggregate count per campaign instead of full rows.

2. **Fetch once per request**
   Add a small per-invocation cache so `getAnalyticsOverview`, `getAnalyticsTimeseries`, `getAnalyticsByCampaign` and `getAnalyticsByAccount` share one read of the same workspace/range instead of scanning five times. The previous-period comparison stays a second, narrower read.

3. **Calmer refresh behaviour**
   In `src/lib/analytics-query.ts`, keep live updates but stop hammering: short `staleTime` (about 15s) instead of 0, `refetchOnMount: true`, and raise `refetchInterval` to 60s (realtime already covers the fast path).
   In `src/hooks/useAnalyticsRealtime.ts`, debounce invalidations (about 2s) and drop the tables that do not change headline numbers (`leads`, `sending_accounts`) from the analytics invalidation set.

4. **Guardrail**
   Add a test asserting that `fetchCampaignStats` applies range filters to its message and event queries, so this cannot silently regress into a full-table scan again.

## Notes

No visible numbers change — the same de-duplicated unit model stays the single source of truth. Only the amount of data read and the refresh cadence change.
