# Advanced Warmup: health-driven volume control

Upgrade the warmup system that already exists (engine, cron runner, jobs queue, daily stats, health scoring, relay sending, suppression list) so volume is driven by real mailbox health instead of elapsed days. No new engine, no new scheduler, no new queue, no duplicate tables.

## What exists today (verified)

- `src/lib/warmup-engine.server.ts` — lease-protected runner, per-mailbox scheduler with idempotency keys and slot spreading, job worker sending through the customer's own mailbox relay, provider/inbound event ingestion, placement sweep, 14-day health score, auto-pause guard.
- Cron endpoint `/api/public/cron/run-warmup`, bounded batches (40 jobs, 50 mailboxes per run), retry with backoff.
- `warmup_settings`, `warmup_jobs`, `warmup_daily_stats`, `warmup_health`, `warmup_events`, `warmup_recipients`, `warmup_runner_state`.
- Separate warmup allowance (`warmup_daily` usage), so warmup never spends campaign quota.
- Suppression list (`email_suppressions`) used by campaigns, replies and compose.
- Mailbox limits with a reply reserve (`mailbox-hourly-cap.ts`, `mailbox-capacity.ts`).

## Gaps this plan closes

1. Volume rises purely because a day passed.
2. No explicit stage; no real Recovery state; no stored reason per day.
3. Warmup ignores the mailbox's remaining hourly/daily capacity, so it can compete with campaign sends.
4. Warmup bounces/complaints do not add the address to the suppression list.
5. Dashboard and history do not show stage, temporary-failure rate, next activity or the reason behind the score.
6. Admin has no recovery/hold thresholds.

## Plan

### 1. Stage machine (new pure module, fully tested)

`src/lib/warmup-ramp.ts` — client-safe, no I/O:

- Stages: `ramp_up`, `stable`, `hold`, `recovery`, `paused`.
- Inputs: recent `warmup_daily_stats` rows (sends, delivered, bounced, complained, failed/deferred, replied, not_received), current health score, authentication statuses, provider-throttle signal from recent job errors, settings (start/max volume, increase, thresholds), yesterday's stage and volume.
- Rules: increase only when the recent window is clean and health is stable; hold on thin or uncertain data; reduce and enter `recovery` when bounces/temporary failures/complaints/throttling rise; `paused` for hard problems (auth failure, complaint spike, mailbox disconnected). Recovery exits to `hold`, then `ramp_up`, only after a clean recovery window — never straight back to full volume.
- Returns `{ stage, target, reason }` with a plain-English reason, e.g. "Warmup volume reduced because temporary delivery failures increased."
- Output always clamped to `start_volume…max_volume` and never above the caller-supplied capacity ceiling.

### 2. Engine wiring

- `dailyTarget` in the engine is replaced by a call into `warmup-ramp.ts` (same export name and signature surface kept for existing callers/tests), fed by one bounded stats query the scheduler already makes.
- `scheduleAccount` additionally:
  - asks `evaluateMailboxCapacity` for the mailbox's remaining capacity in a new `warmup` lane that sits **below** campaigns (priority: human replies → campaigns → warmup) and clamps today's target to what is left;
  - skips recipients present in `email_suppressions`;
  - stores stage/target/reason on `warmup_settings` and on today's `warmup_daily_stats` row.
- Job worker: on a hard bounce or complaint event (`applyWarmupDeliveryEvent`) the recipient is added to the suppression list and, for pool recipients, disabled — that address is never warmed again. Repeated temporary failures feed the stage machine instead of suppressing.
- Auto-pause keeps its current behaviour but now records the stage, and temporary issues resolve into `recovery` rather than a pause.

### 3. Capacity lane

`src/lib/mailbox-hourly-cap.ts` gains a `warmup` lane whose hourly/daily limit is what remains after the reply reserve **and** the campaign allocation, so warmup can never starve campaign sending. Campaign and reply behaviour is unchanged.

### 4. Database (additive only, rerunnable SQL)

New columns, no drops, no data rewrites:

- `warmup_settings`: `ramp_stage text not null default 'ramp_up'`, `stage_since timestamptz`, `stage_reason text`, `current_volume smallint`, plus admin thresholds `hold_failure_rate`, `recovery_bounce_rate`, `recovery_days`.
- `warmup_daily_stats`: `stage text`, `stage_action text`, `planned_target smallint` (planned vs actual history).
- One index: `warmup_daily_stats (sending_account_id, day desc)` if not already present.

Applied through the migration tool for the development project and mirrored as `supabase/manual/warmup-stage-machine.sql` for the live database, since production migrations are run manually.

### 5. Dashboard and history (existing pages only)

- `/warmup` mailbox rows: status, ramp stage, current daily volume, sent today, replies, bounce rate, temporary-failure rate, health score with reason, authentication/domain status (real values only, otherwise "Manual verification required"), last activity, next scheduled warmup.
- Summary strip: Active warmups, Healthy, Recovery, Paused, emails sent, average health.
- History per mailbox: date, planned volume, actual volume, sends, replies, bounces, failures, health score, stage action, plus the existing chart extended with planned-vs-actual. Warmup data stays out of campaign analytics.
- Customer controls stay Enable / Pause / Resume / view health, volume, issues, history.

### 6. Privacy check

Confirm (and fix if needed) that warmup messages stay out of Unified Inbox, campaign replies, positive replies, CRM activity and campaign analytics — warmup sends are already registered as `message_type: 'warmup'`; the inbound poller and reply classifier will be audited against that.

### 7. Admin controls

`Admin → Warmup settings` exposes only backend-supported fields: starting volume, maximum volume, ramp behaviour, recovery behaviour, health thresholds, pause conditions. No provider/infrastructure controls for customers.

### 8. Tests

New unit tests for the stage machine covering ramp-up, hold, reduction, recovery entry/exit, hard bounce, temporary failure, complaint, provider throttling, authentication failure, provider and mailbox limits, capacity priority, duplicate prevention and idempotency; plus engine-level tests for suppression on bounce/complaint and capacity clamping. Existing warmup and campaign test suites must stay green, followed by a typecheck.

## Out of scope

No change to campaign sending, pacing, scheduler cadence, provider adapters, relay, or any protected page beyond the warmup surfaces listed above.
