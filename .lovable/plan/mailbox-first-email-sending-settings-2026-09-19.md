# Mailbox-first Email Sending settings

## Goal
Update only Settings → Email & Sending so connected email accounts are presented as mailboxes, while preserving the current readiness checks and mailbox management flow.

## Changes
- Replace the two domain-first badges with mailbox-level readiness labels derived from the existing DNS and sending verification fields.
  - Verified DNS → **DNS Verified**
  - Verified sending → **Sending Ready**
  - Missing/pending DNS setup → **Setup Required** or **Verification Required**
  - Failed checks → **Error**
- Keep each mailbox's email address, underlying domain, “MunchReach managed sending,” and Active/Inactive/Paused state visible.
- Add compact real limits and warmup status to each row using fields already stored for the mailbox: daily limit, hourly limit, and warmup state.
- Add **View details** and **Pause/Resume** controls that reuse the existing Email Accounts screen and its existing actions; **Manage mailboxes** continues to open the current mailbox management flow.
- Update only conflicting wording within `/settings` and its settings components. Keep necessary DNS/domain references such as “Verify DNS for this mailbox.”

## Technical details
- Extend the existing sender-status response with current mailbox limit, warmup, and health fields already present on `sending_accounts`; do not add or alter database fields.
- Centralize the presentation mapping in the current sender-status UI; do not duplicate or change verification decisions.
- Reuse the existing server-side pause/resume operation and query invalidation.
- Make the mailbox row responsive without redesigning the rest of Settings.

## Verification
- Run focused status-mapping tests plus the existing mailbox/sending test suites and type checks.
- Verify `/settings?tab=sending` on desktop and mobile, including Manage mailboxes, View details, and Pause/Resume.
- Confirm no campaign scheduling, sending, routing, limits, warmup, or database behavior changed.
