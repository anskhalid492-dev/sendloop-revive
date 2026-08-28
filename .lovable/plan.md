# Fix the campaign send path at window start

## Root cause confirmed

Production campaign `Packaging Companies - US` is active with an 8:00 PM–11:00 PM Asia/Dubai window. Its queued rows are correctly scheduled for 8:00 PM (16:00 UTC), have `attempts = 0`, no `sent_at`, and valid assigned mailboxes with available rolling 12-hour capacity.

The queued message passes the scheduler, campaign status, sending-window, `scheduled_at`, daily quota, and mailbox-capacity checks. It is stopped immediately before the processing claim by the lifetime reservation gate because the campaign stores 400 accepted sends against an `email_send_limit` of 400. This is the exact blocker in the dispatch path; the provider function is never reached.

## Implementation

- Remove the lifetime-send reservation as a dispatch blocker so recurring campaigns are governed by their daily quota and mailbox rolling capacity, as required.
- Keep daily quota behavior: once today's campaign quota is reached, park remaining messages at the next configured sending-day window start.
- Keep the rolling 12-hour mailbox-capacity gate and provider/plan protections unchanged.
- Add structured temporary diagnostics for the requested sequence: eligible count, selected count, rejection reason, mailbox check, processing claim, and provider send outcome.
- Add a narrow dependency/time injection seam to the server dispatcher so tests execute the real dispatch function without sending external email.

## Regression coverage

Execute a real queued-message flow through `dispatchDueMessages` with a provider spy and verify:

- 8:00 PM, 8:01 PM, and 8:04 PM Dubai each reach provider send.
- Before 8:00 PM waits and does not call the provider.
- Daily quota exhaustion parks work at the next scheduled sending day.
- Mailbox rolling capacity exhaustion waits without calling the provider.
- A previous-day retryable failure is re-queued for and retried in the next eligible window.
- No eligible message produces no provider call and no sent/activity state.
- A successful provider response claims the row and persists provider IDs and `sent_at`.

## Verification

Run typecheck, the complete test suite, and the production build. No UI or scheduler-display code will be changed.
