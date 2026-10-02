# Background job reliability: staged migration (audit first)

## What the read-only audit found

Production database: it was briefly unreachable during the audit ("connection pooler unavailable"), so cron job definitions and the five SQL functions could not be read live. pg_cron and pg_net are installed. **pgmq (Supabase Queues) is NOT installed**, so the plan uses a plain Postgres job table instead.

How the five jobs work today, from code:
- Each SQL function only fires an async HTTP request (pg_net) to an app endpoint under `/api/public/cron/*`. The SMTP/IMAP work runs in the app, not inside a database transaction. The "never hold a transaction during IMAP/SMTP" rule is **already met**; database writes are separate short calls.
- Overlap protection today:
  - Warmup: atomic lease (conditional update). OK.
  - Transactional: lease is read-then-write (not atomic). Small race.
  - Campaign scheduler: lease is read-then-write (not atomic). Two overlapping ticks can both run. This is the most important reliability gap. Per-message send claims still stop most double sends.
  - Mailbox poll: **no lease at all**. Overlapping 4-minute ticks can poll the same mailbox twice. Cap: 6 mailboxes at a time.
  - Inbound retry: has exponential backoff + max attempts already (5 min × 2ⁿ). No jitter, no lease.
- Birthday gifts and lifecycle emails run on every transactional tick (every minute).
- All five ticks start on the same minute boundary, so the load peaks are stacked.

## Blockers to resolve before any database change

1. **No backups / point-in-time recovery exist** (confirmed earlier). The brief says to verify recovery before any schema change. Recommendation: enable PITR or a daily backup on the production database first. All SQL below is additive (no drops/deletes), but the brief's own rule still applies.
2. Automated migrations from here reach a different backend, not production. Production SQL must be run by you in the production SQL editor. I will provide one reviewed, additive SQL file per phase.
3. The database must be reachable to verify cron jobs and functions before Phase B.

## Approach (additive, flag-controlled, reversible)

Keep the five existing cron jobs and their SQL functions; nothing is deleted. Their timing is staggered (alter schedule only), and each endpoint they call gains a "queue mode" path behind a flag.

```text
pg_cron (existing 5 jobs, staggered)
   -> existing run_*() SQL fn -> HTTP -> /api/public/cron/<worker>
        flag worker_mode = legacy : current code path (unchanged)
        flag worker_mode = queue  : 1. enqueue due work (bounded, idempotent keys)
                                    2. take worker lease (atomic)
                                    3. claim N jobs (SKIP LOCKED, short txn)
                                    4. do SMTP/IMAP outside any txn
                                    5. save result / schedule retry (short txn)
                                    6. write worker_health
```

### Phase A — code-only fixes (no schema, safe now)
- Make campaign and transactional leases atomic. Use a conditional update on `platform_settings` (same pattern warmup already uses).
- Add a lease to mailbox polling. Keep concurrency configurable; default lowered to 4.
- Add jitter to inbound retry backoff, and dead-letter after max attempts. Rows stay in place; nothing is deleted.
- Move birthday gifts out of the per-minute tick so they run at most once per day (date gate in `platform_settings`). Once-per-user/year protection is kept.
- Structured JSON logs per run: worker, job id, campaign/mailbox/workspace id, duration, result, error code, attempts. No credentials or bodies are logged.
- Tests: lease contention, crash and lease expiry, backoff/jitter/dead-letter, duplicate delivery, IMAP/SMTP/DB timeout simulations, birthday once-per-day.

### Phase B — additive SQL (you run it in production, after backups)
- `background_jobs`: worker, job_type, payload, idempotency_key (unique per worker), status (queued/running/succeeded/failed/dead), attempts, max_attempts, next_attempt_at, lease_until, lease_owner, started_at, completed_at, last_error, created_at. Indexed on (worker, status, next_attempt_at). RLS on, service-role only.
- `worker_health`: one row per worker with last started/succeeded/failed, status, backlog, duration, failures, last error, lease expiry. Admin read via `has_role`.
- `claim_background_jobs(worker, limit, lease_seconds)`: atomic, `FOR UPDATE SKIP LOCKED`.
- `take_worker_lease` / `release_worker_lease`: atomic single-flight per worker.
- `platform_settings.worker_mode` = `legacy` for every worker.
- Indexes added only after the live query plans have been checked (EXPLAIN on scheduler/poll queries).

### Phase C — queue mode per worker, switched on one at a time
- Order: inbound, then transactional, warmup, mailbox, campaign (lowest to highest risk).
- Each worker reuses its existing sending/IMAP code. Only the "what to do next" selection moves into the queue.
- Duplicate-send protection stays where it already lives: per-message claims, the outbound registry, transactional per-message idempotency, lifecycle ledger, inbound message-id dedupe. Queue idempotency keys add a second layer.
- Dual-run is not needed. A worker is either legacy or queue, decided per tick by the flag, so only one path can send.

### Phase D — staggered schedules (alter only, never delete)
- Campaign: every minute.
- Mailbox: minutes 1, 6, 11, … (every 5 minutes).
- Inbound: minutes 2, 7, 12, …
- Transactional: minutes 3, 8, 13, … Note: this delays password/signup emails by up to 5 minutes. Recommendation: keep transactional every minute, offset by 30 s, or wake it on enqueue.
- Warmup: minutes 4, 9, 14, …

### Phase E — admin worker health page
- New card under the existing admin console. It shows each worker as Healthy/Degraded/Down, plus backlog, failed jobs, longest-running job and last success. It reads `worker_health` and `background_jobs` only.

## Rollback
- Set `worker_mode` back to `legacy`: the next tick uses the old path. No redeploy needed.
- Restore the previous cron schedules with the same alter statement.
- New tables are kept (failed jobs preserved). No user, campaign or mailbox data is touched.

## Login / UI isolation
- Login and pages do not call any worker today. The instability seen is shared database pressure.
- Phases A and D reduce that pressure: no overlapping runs, staggered peaks, birthday check once a day, bounded batches.
- Verification includes timing login while a forced worker run is active.

## Technical details
- Files touched in Phase A: `src/lib/campaign-scheduler.server.ts`, `src/lib/transactional-email.server.ts`, `src/lib/mailbox-imap-poll.server.ts`, `src/routes/api/public/cron/poll-mailboxes.ts`, `src/lib/inbound-ops.server.ts`, `src/routes/api/public/cron/run-transactional-email.ts`, and a new `src/lib/worker-log.server.ts` plus tests.
- Phase B SQL is delivered as `supabase/manual/background-jobs.sql`. CREATE TABLE is followed by GRANT, then RLS, then policies. Indexes use `CREATE INDEX CONCURRENTLY`, kept outside a transaction.
- Nothing is reported as done without a live check: cron run history, `worker_health` rows, and one real send/poll per worker on named test accounts only.
