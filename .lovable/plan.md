# Customer Lifecycle Emails

Automated lifecycle emails for free/trial users who never upgrade, and for customers who go quiet — built entirely on top of the System Emails engine, the existing email queue, the existing cron runner, and the existing account/subscription model. No parallel email system, no browser timers.

## What gets built

### A. Free / trial re-engagement (2 emails)
- A user with no paid subscription enters the track once (per account).
- Day 3: 5% upgrade offer. Day 10: 10% upgrade offer (counted from the same start date).
- Each email is sent at most once; if the user upgrades, cancels, or is suspended, the remaining emails are cancelled immediately.

### B. Inactive customer re-engagement (4 emails + termination)
- Inactivity is measured from the most recent real activity across: last sign-in, latest workspace activity entry, latest campaign change, latest lead activity. Whichever is newest wins. No new activity tracking is added.
- Entry: 30 consecutive days with none of the above, account still active.
- Day 3, Day 7, Day 12 re-engagement emails, then a final warning naming the real termination date, then termination.
- Any sign-in or product activity at any point removes the account from the track and cancels everything still pending, including termination.

### C. Termination
- Runs server-side through the existing account controls already used by Admin → Users / Workspaces: the account's sign-in access is revoked and the workspace is moved to the suspended state with a recorded reason and an audit entry.
- Guarded by a fresh eligibility re-check plus a one-row-per-account termination record, so a repeated job run can never terminate twice.
- The "Account terminated" email is only queued after the termination write succeeds, and only once.

### D. Coupons (real, not fake)
- There is no discount system today, so the minimum is added: each offer email requests a single-use discount code from the live payment provider through the existing billing integration, stores it against the enrollment with an expiry, and puts it in the email.
- The upgrade/checkout flow is set to accept discount codes so the code actually works.
- If the code cannot be created, the email is not sent (no invented coupon), and it is retried on the next run.

### E. Admin → System Emails
- Seven new templates appear in the existing Templates list with the existing design shell, so they inherit enable/disable, subject, preview, edit, test send, version history, and last-updated with no separate admin screen:
  1. Free user — 5% upgrade offer
  2. Free user — 10% upgrade offer
  3. Inactive customer — re-engagement 1
  4. Inactive customer — re-engagement 2
  5. Inactive customer — re-engagement 3
  6. Inactive customer — final warning
  7. Account terminated
- A new "Lifecycle" tab in the same screen shows the trigger for each template, the configurable day offsets, the discount percentages, the termination delay, a master on/off switch, and a live view of accounts currently in each track.

## Technical notes

- **Data:** two new tables — `lifecycle_enrollments` (account, track, state, entered_at, next_action_at, cancel reason) and `lifecycle_actions` (unique per enrollment + step, the idempotency ledger, holds coupon code and queued email id). States: `eligible`, `email_1_sent`, `email_2_sent`, `email_3_sent`, `final_warning_sent`, `reactivated`, `terminated`, `cancelled`. Both RLS-enabled, service-role only. Schema goes in `supabase/manual/` and is applied against the live database.
- **Config:** one `platform_settings` row (`lifecycle_emails`) holds every offset, percentage, termination delay and enable flag — no hard-coded day numbers in components.
- **Runner:** `src/lib/lifecycle.server.ts` exposes `runLifecycleCycle()`, invoked from the existing `run-transactional-email` cron route alongside the birthday cycle. Bounded batches, claim-before-act, no new scheduler.
- **Sending:** every email goes out via `emitTransactionalEvent` → `transactional_emails` queue → existing provider routing and retry/backoff. Provider names never appear to customers.
- **Variables:** whitelist additions only — `coupon.code`, `coupon.percent`, `coupon.expires_at`, `upgrade_url`, `termination.date`, `inactive.days` — alongside the existing `user.first_name`, `workspace.name`, `plan.name`, `support_url`.

## Verification before publishing

- Unit tests for offsets, eligibility, inactivity resolution and timezone/date handling.
- A controlled test account is walked through both tracks with the clock simulated: each email schedules and sends once, a duplicate runner pass sends nothing extra, conversion and re-activation cancel the track, final warning fires, termination runs once, a forced termination failure sends no termination email, and a forced send failure retries.
- Confirmation that existing system, transactional and campaign emails are untouched.
- No destructive test runs against real accounts.
- Finally, clearly marked TEST sends of the 5% offer, 10% offer, a re-engagement email, the final warning and the termination email to mranuskhalid@gmail.com, with no effect on real lifecycle state.
