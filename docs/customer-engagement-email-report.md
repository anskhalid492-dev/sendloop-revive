# Customer engagement / System Emails audit

## Scope and outcome
Inspected the existing catalog/editor, event bridge, legacy and queue-mode delivery paths, lifecycle configuration/enrollments/actions, existing authenticated runner, marketing blueprints and notification/suppression records. No new sending engine, queue, table, migration, schedule, provider or domain was created. No existing template was replaced. No customer emails were queued or sent during development; new optional notices default to disabled.

## Eight-trigger coverage
| Requested trigger | Finding and action |
|---|---|
| Account created / welcome | Existing `user.created` template and recent-account profile/sign-in emission with account-id key. Preserved. It is not a guaranteed registration-time hook; no hosted end-to-end registration check was available. |
| No mailbox after 24 hours | Missing exact System Emails trigger; marketing activation blueprint has a one-day condition. Not added: delayed onboarding drip requires a supported marketing path and overlap audit. |
| Mailbox connected / import leads | New action-confirmed `onboarding.mailbox_ready` template and successful persisted save/recheck hooks. Old mailbox-connected/domain templates remain unchanged. |
| Leads imported / create campaign | New action-confirmed `onboarding.leads_imported` template after successful direct import and both background import completion paths with saved rows. Failed/empty imports do not trigger it. |
| Created but unlaunched campaign | Missing exact delayed checklist. Marketing library already contains launch education. Not added through app emails: delayed engagement/drip restriction. |
| Campaign launched / unified inbox | Existing `campaign.launched` confirmation/emitter preserved rather than sending another launch email. Existing product-education marketing blueprint includes unified inbox guidance after first send. Exact first-launch inbox email is not added and is not claimed complete. |
| Approaching free limits / upgrade | Missing exact usage-threshold trigger. Existing offers are age-based, not actual usage. Not added: upgrade promotion is not supported through Lovable app emails. No billing/usage thresholds changed. |
| Inactive seven days / personal help | Missing exact seven-day rule. Existing configurable inactivity sequence defaults to 30 days plus three days to first message, and marketing re-engagement templates exist. Neither changed or duplicated; no new re-engagement sending. |

## Added content and admin controls
- **First mailbox ready — import leads:** confirms connection, explains verified CSV mapping, primary “Import my leads” CTA to `/leads`.
- **First lead import complete — create campaign:** confirms saved contacts, explains list/email/mailbox/schedule review, primary “Create my campaign” CTA to `/campaigns`.
- Existing branding, responsive HTML/plain text, first-name fallback and existing draft/publish/version/preview/editor controls reused. Subject/content/CTA text/URLs remain editable in the standard template editor.
- Templates are inserted only when absent through the existing Admin template catalog seeding. Both additions default disabled; absence also blocks automatic dispatch. Existing stored edits and toggles are never overwritten.
- Admin trigger table shows all eight requests, actual template enablement, recorded last queued execution, sent/failed and idempotency-key coverage. Statistics retain the existing recent 30-day/5,000-row bounded scope; they are not full historical totals or proof that every attempted check ran.

## Duplicate prevention and current-state safety
- Stable unique existing queue key: `event:ownerId:workspaceId`. Retried saves, repeated imports and rechecks cannot enqueue another keyed notice for that owner/workspace. No schema changes.
- Existing atomic queue claims and shared worker lease retained. Optional notice cancellations/deferments do not consume provider attempts.
- Recheck immediately in the shared real delivery function for **both** legacy and queue paths: authenticated account still exists, not banned, current email matches, workspace active and same owner, template explicitly enabled, email notifications allowed, existing workspace suppression and marketing unsubscribe/bounce/complaint states.
- No mailbox prompt after leads exist; no campaign prompt once a campaign exists; real connected/active mailbox and saved-lead counts required.
- Read errors defer rather than authorize a send. Active marketing automation conservatively blocks optional notices pending an overlap audit. This may block unrelated active marketing sequences too; safety is preferred to duplicate onboarding.
- A 24-hour gap from preceding welcome/action notice is rechecked on delivery. The existing atomic worker lease additionally reserves a per-owner 24-hour action-notice window across concurrent delivery modes; failed/no-provider attempts conservatively retain the reservation. No security, billing or existing lifecycle message is frequency-limited by this addition. This is a relative duration, not a customer-local quiet-hours scheduler. Customer timezone windows and complete cross-system frequency/consent reconciliation are **not implemented**; leave new notices disabled until reviewed.
- Historical customer state is not scanned or backfilled. Only future successful actions call these hooks. No old customers were enrolled.

## Verification and remaining gates
Isolated pure-policy and mocked bridge tests cover successful persistence requirements, outdated cancellation, 24-hour boundary, suspended/deleted accounts, preferences, read failures, explicit disabled templates, marketing overlap and stable-key duplicate prevention. All test recipients are named `engagement-test-*` fixtures with `.invalid` addresses; all database/provider interactions in the new bridge tests are mocks. Complete suite: **1,985 tests passed across 209 files**. Automatic production compilation: **build OK**, latest checked entry 2026-10-18 20:30:22 UTC.

Signed-in Admin readback and real signup/mailbox/import-to-delivery flows were not tested: externally managed authentication has no available scoped test session. Delivery providers/settings were inspected in source, not changed or operationally probed. Lovable-managed email has no configured domain, but the existing System Emails uses its own configured provider pool; no domain setup/scaffolding was requested or substituted.

No publication/deployment, existing email/template modification, live provider action or production-data change occurred. This is a **partial implementation**, not completion of all eight lifecycle triggers.