# Automatic per-mailbox warmup — implementation report

## Status
Implemented in the unpublished application. Additive migration applied to the tool-connected development database, **not the hard-pinned production database**. Production owner must review and apply `supabase/manual/automatic-mailbox-warmup.sql` before deploying this code. No production warmup history, settings, billing, campaigns or subscription data were changed. No publication/deployment.

## Progression
- Default stages: Days 1–8 at 1–7/day; Days 9–18 at 7–15/day; Days 19–25 at 15–30/day; final stage remains 30/day.
- Rounded linear interpolation: `round(min + (day-start)/(end-start) * (max-min))`, clamped to the stage. Day 1–8 = **1,2,3,4,4,5,6,7**; Day 9 = **7**; Day 19 = **15**. This resolves the brief's conflicting day-5 examples deterministically. Day 13 = 11 and Day 22 = 23.
- UTC calendar boundaries, with a short first day when started late in UTC. Existing send-day/hour settings remain UTC as in the existing engine.
- Calendar age is derived from each mailbox's original `started_at`. A separate persisted effective ramp day prevents skipped stages after downtime or pauses: at most one ramp day per observed new UTC date, no catch-up batch. The first day after an unobserved gap holds the previous volume; subsequent healthy days resume progression. Consequently effective day can trail calendar age.
- Manual limits remain per mailbox, are not overwritten by automatic calculations, and survive pauses. Switching back keeps the existing start/history and effective ramp day.
- Stage configuration is per mailbox, with ordered contiguous days and nondecreasing ranges, 1–400/day. Modal offers add/edit/remove, defaults and a seven-day schedule preview.

## Existing mailbox behavior
- Migration deliberately leaves every existing settings row in **legacy mode** and review-needed; new settings default to automatic at Day 1. This is a safe opt-in upgrade, not a mass automatic conversion.
- Existing values, health and history are unchanged. Selecting automatic on a reviewed legacy mailbox initializes from its existing start, preserving its current volume as the initial ceiling.
- If start is missing, the save action looks for that mailbox's earliest successful-send daily row. If no reliable history exists, it refuses automatic activation and leaves the existing schedule for review; there is no arbitrary Day-1 reset.

## Sending safeguards
- Both legacy and queue workers share the existing engine. Worker rechecks settings, system pause, health, send days/window and current calculated limit before sending, including already-queued jobs and manual run-now.
- Automatic progression cannot override active safety violations, throttling or recovery. Low health freezes progression; recovery can reduce the retained limit.
- Existing mailbox daily capacity and warmup hourly lane remain constraints. Warmup is lower priority than campaign sending; campaign limits and counters are untouched.
- Atomic `reserve_mailbox_warmup_send` locks mailbox settings and the job, checks current manual/automatic limits, and reserves a daily slot only once. Concurrent/duplicate jobs cannot exceed this ceiling. Old UTC-date reservations cease counting without deleting history or resetting records.
- Attempt reservations are separate from success counters. Failed/unknown handoffs never become successful sends. A provider attempt retains its slot conservatively and is not retried, preventing a second possible SMTP delivery.
- Existing `sent` means confirmed SMTP acceptance, not inbox arrival; `delivered` remains independent arrival proof. Campaign emails never increment warmup success counters.
- Dashboard shows per-mailbox stage/mode/day, warmup sends/limit and next-day schedule; actual usable volume can be lower because of provider/capacity restrictions. Settings can open directly from mailbox actions.

## Database changes
- `warmup_settings`: progression mode, stage JSON, manual limit, effective day/date/limit, review-required marker. Existing RLS manager policies retained.
- `warmup_jobs`: attempt reservation timestamp and narrow index.
- `reserve_mailbox_warmup_send(uuid, integer)`: service-role-only atomic reservation; no new public tables or recurring schedules.
- 77 pre-existing development database security findings were reported by the migration tool; none introduced by this migration. They were not modified in this task.

## Changed files
- `src/lib/warmup-progression.ts` (new shared pure calculation)
- `src/lib/warmup-model.ts`
- `src/lib/warmup-engine.server.ts`
- `src/lib/warmup.functions.ts`
- `src/lib/workspace-mailboxes.functions.ts`
- `src/components/warmup/WarmupProgressionEditor.tsx` (new)
- `src/components/warmup/WarmupSettingsDialog.tsx`
- `src/routes/_authenticated/warmup.tsx`
- `src/routes/_authenticated/mailboxes.index.tsx`
- `supabase/manual/automatic-mailbox-warmup.sql` and tool-created migration
- `tests/warmup-progression.test.ts`, `tests/warmup-progression-database.test.ts`
- `package.json` / `bun.lock`: local in-memory PostgreSQL test dependency, development only
- `AGENTS.md`, `roadmap.md`, this report

## Verification
- 24 new isolated tests: default boundaries/interpolation, independence, manual/resume, pauses/health, UTC days, downtime, duplicate resolution, validation and migration/atomic allowance behavior.
- Atomic SQL ran against an in-memory PostgreSQL database with explicitly named fixture IDs, no network. Covers concurrent reservations, manual reductions, system pauses, daily rollover, history preservation and per-mailbox independence.
- Full suite: **1,877 tests across 194 files**, no failures (final rerun recorded in chat).
- Preview's automatic compilation/production build: check final build telemetry before release; no manually invoked build/typecheck.
- Isolated rendered editor: desktop 1280px, tablet 768px and mobile 390px; add/remove/defaults/invalid overlap/manual plus-minus/reset passed, no page overflow. Stage table scrolls locally on narrow screens.
- **Not verified:** authenticated save/readback, real scheduler/provider flow or full authenticated mailbox/dashboard rendering. External backend has no scoped throwaway-account session available; no customer credentials or production sends were used. Production SQL remains unapplied.

## Release gate
Do not deploy until production SQL is manually reviewed/applied and a named throwaway mailbox is used to verify settings persistence, dashboard/worker agreement, health pause/resume and provider capacity end-to-end. No live customer-base test sweep.

## Update — legacy mailboxes convert to automatic (2026-10-16)
Progression is always automatic. `resolveDailyTarget` converts any mailbox still in legacy mode with a known start date on its next tick, seeded exactly like the settings save path (calendar day + current daily volume), so the conversion day holds the legacy limit and progression resumes from there. Mailboxes with no known start date keep the legacy engine. The "Review needed" label (warmup dashboard) and the progression review note/mode picker were removed from the UI. New test file `tests/warmup-legacy-conversion.test.ts` covers seeding, unknown starts and no re-conversion.