# Database performance findings: cause map and safe fix plan

Read-only review only. Nothing was changed. The production database was unreachable from here during this review ("pooler unavailable"), so live facts are marked **NOT VERIFIED**. Code facts are marked **CONFIRMED (code)**.

## 1. inbound_routes sequential scans (265 scans, ~4.2M tuples) — highest priority

- **Cause, CONFIRMED (code):** `recordOutboundCampaignMessage` in `src/lib/inbox.server.ts` (about lines 1233–1283) runs once for every accepted campaign send, called from `src/lib/dispatch.server.ts` (about line 1624). It runs `UPDATE inbound_routes SET conversation_id … WHERE workspace_id = ? AND conversation_id IS NULL AND sending_account_id = ? AND lead_id = ? AND campaign_id = ?`.
- **Indexes, CONFIRMED (code):** the original migration only adds an index on `workspace_id` (plus a unique index on `token`). `supabase/manual/campaign-delete-indexes.sql` adds `campaign_id`, but whether production has it is **NOT VERIFIED**. One workspace owns most rows, so Postgres scans the whole table. 265 scans for ~4.2M tuples works out to about 16k rows read per send, which fits this cause.
- **Not the cause:** token lookups (`resolveRouteFromAddress`, `inbound-ops.server.ts` lines 402 and 688) already use the unique index.
- **Safest fix:** add one partial index on `(campaign_id, lead_id) WHERE conversation_id IS NULL`, using an additive `CREATE INDEX` you run manually. No code change and no change in behaviour.
- **Expected impact:** large. Each send drops from about 16k rows read to a handful.
- **Risk:** low. The build briefly locks writes to this table (it's small). It needs disk space for the index.

## 2. conversation_messages repeated lookups (265 calls)

- **Cause, CONFIRMED (code):** the same function first looks up `conversation_messages` by `(workspace_id, campaign_message_id)` on every send. The 265 calls match the 265 route scans, which means one lookup per send. This is expected, not a loop.
- **Index:** `conversation_messages_campaign_message_id_idx` exists only in a manual SQL file. Whether production has it is **NOT VERIFIED**. If it's missing, every lookup scans the table.
- **Safest fix:** first check `pg_indexes` read-only. If the index is missing, run the existing additive index file. No code change.
- **Impact:** medium to high if the index is missing, none if it's present. **Risk:** low.

## 3. background_jobs inserts and claim/finish operations

- **Cause, CONFIRMED (code):** in queue mode, every tick inserts jobs and then calls `claim_background_jobs` and `finish_background_job` for each one:
  - campaign: one job per active campaign per minute (`campaign-queue.server.ts` about 146–191)
  - inbound: one job per due event (`inbound-queue.server.ts` 57–86)
  - warmup: one tick job per run
  - mailbox: one job per mailbox per poll
- Succeeded and dead jobs are never cleaned up, so the table and its index keep growing.
- **NOT VERIFIED:** which workers have `worker_mode = queue` in production. If any runs in legacy mode, its share of these operations is zero.
- **Safest fixes, in order:**
  1. Read `platform_settings.worker_mode` and the job count per worker and status.
  2. Code: insert the campaign and inbound jobs as one batch with "skip duplicates", instead of one request per job. Same rows, fewer round trips.
  3. Code: skip the claim call when nothing was queued and no job is open.
  4. Retention for finished jobs (for example, older than 7 days). This deletes rows, so it is listed only for your decision.
- **Impact:** medium. **Risk:** low for 2–3, which have tests and keep the same idempotency keys. Item 4 is a deletion, so it is not recommended without backups.

## 4. warmup_health table growth

- **Cause, CONFIRMED (code):** `recalculateHealth` (`warmup-engine.server.ts` about line 1732) always **inserts** a new row. It's called after each warmup send or job (lines 1241 and 1432), from ticks (2015 and 2143) and from the queue runner (`warmup-queue.server.ts` line 221). So the table gets one row per mailbox per warmup event.
- **Related bug suspicion, CONFIRMED (code):** `admin-outreach.server.ts` line 1615 reads `warmup_health` by account with `.maybeSingle()`. That call fails once an account has more than one row. Other readers expect the latest row.
- **Safest fix:** keep the health score logic exactly as is. Only skip the insert when score, status and recommendation are unchanged since the latest row. Also make line 1615 read the newest row. An additive index on `(sending_account_id, created_at desc)` speeds up "latest" reads, if that index isn't already present (**NOT VERIFIED**).
- **Impact:** medium. Growth drops to rows written only when health changes. **Risk:** low. Warmup sending and volume are not touched.

## 5. Expensive cron.job_run_details update

- **Cause, CONFIRMED (platform behaviour):** pg_cron writes and updates one row in `cron.job_run_details` for every run of every job. That table is never cleaned up automatically.
- **CONFIRMED (code):** about 11–13 schedules exist in the repo docs, and several run every minute. That's thousands of runs a day, so the update gets slower as the table and its bloat grow.
- **NOT VERIFIED:** the real job list, any duplicate name families (`sendloop-*` and `munchreach-*`), and the table size. I'm not assuming duplicates exist.
- **Safest fix:**
  1. Read-only: list jobs from `cron.job`, and get the row count, size and oldest row of `cron.job_run_details`.
  2. Only if duplicates are confirmed: unschedule the extra copy (an approved schedule change).
  3. Pruning old run history is a deletion of logs only, with no customer data. It is still listed for your explicit decision.
- **Impact:** medium. **Risk:** pruning loses old run logs. Unscheduling a job that is wrongly flagged as a duplicate would stop a worker, which is why step 1 comes first.

## Prioritized implementation order (after approval)

1. Read-only production checks: indexes on `inbound_routes` and `conversation_messages`, `worker_mode`, `background_jobs` counts, `cron.job` list, size of `cron.job_run_details`. Needs the database awake. You run the queries, or I run them once it's reachable.
2. One additive index SQL file (items 1, 2, 4) for you to run manually. No code change.
3. Code: skip unchanged `warmup_health` inserts, and fix the `.maybeSingle()` read. Tests included.
4. Code: batch `background_jobs` enqueue and skip empty claims. Tests included.
5. Your decision only: cron duplicates and retention for job and run history.

## Technical details

- Proposed index SQL (plain `CREATE INDEX IF NOT EXISTS`, safe in the SQL editor):
  - `inbound_routes (campaign_id, lead_id) WHERE conversation_id IS NULL`
  - `conversation_messages (campaign_message_id)` (only if missing)
  - `warmup_health (sending_account_id, created_at DESC)` (only if missing)
- No sending, follow-up, inbound, warmup scoring or transactional logic changes. No deletes unless separately approved.
