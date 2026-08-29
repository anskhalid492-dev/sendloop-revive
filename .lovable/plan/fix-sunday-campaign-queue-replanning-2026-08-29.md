# Fix Sunday campaign queue replanning

## Implementation
- Make queue replanning derive every pending/scheduled timestamp from the campaign’s current sending days, timezone, and window, with distinct rules for first steps versus follow-ups.
- Add deterministic daily-cap allocation: account for messages already sent or processing in each campaign-local day, place only the remaining first-step/follow-up capacity in that day, and spill excess work into later selected windows.
- Keep valid schedules stable and make repeated replans idempotent; page through the full queue rather than stopping at 5,000 rows.
- Run replanning after queue materialization and immediately before due-message selection in the real cron path, while retaining automatic replanning after schedule edits.

## Regression coverage
- Cover Sunday enabled/disabled, Mon–Fri weekends, Sun–Sat, inside/before-window behavior, Kolkata timezone conversion, follow-up floors, daily-cap spillover, and repeated-run stability.
- Add a production-path regression proving scheduler → campaign runner → replanner → dispatcher ordering.

## Verification
- Run the full test suite and TypeScript typecheck.
- Confirm from the traced call chain that the normal cron runner repairs stale Monday first-step rows without manual database work.
