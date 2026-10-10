# Analytics and reply processing verification report

## Already working
- Existing campaign statistics readers, authenticated/RLS-backed analytics functions, and shared campaign/mailbox filters.
- Inbound message storage, campaign attribution, deterministic intent rules, opt-out suppression, follow-up stopping, and CRM status workflows.
- Existing inbound retry runner, queue-mode wrapper, and stable notification/integration/automation idempotency keys.
- Light/dark theme tokens and manual inbox/CRM status correction.

## Confirmed problems and fixes
- The engagement card owned a separate date filter and omitted campaign/mailbox context. It now receives the page's shared filters, including Custom.
- Chart colors did not correctly consume the application's OKLCH tokens. Lines, transparent gradients, legend and tooltips now use existing theme tokens.
- Reply analytics silently ignored query failures and capped results. The overview/reply reader now pages existing rows and surfaces query errors.
- Analytics treated estimated reachability as confirmed delivery. The overview now separates confirmed receipts, labels incomplete evidence, and documents its rate denominator.
- Broad subject/body interest matching could label ambiguous or quoted outbound text positive. Rules now inspect actual reply content conservatively; uncertain replies need review.
- Duplicate inbound deliveries returned before recovering incomplete CRM/campaign work. New replies persist classification metadata and a completion marker; unfinished work can replay without duplicate reply/activity rows.
- CRM updates lacked a stable inbound activity identity and could regress pipeline decisions. Updates now use inbound UUIDs and compare current status/stage; only clear interest advances a new/contacted deal.
- IMAP ingestion exceptions were logged while its cursor could advance. Processing failures with Message-ID are now parked in the existing inbound event log for its retry runner.
- Manual sentiment-write failures were swallowed. They now surface to the caller; correction events record the human status and recovery respects that correction.

## Changed files
### UI
- `src/routes/_authenticated/analytics.tsx`
- `src/components/analytics/EngagementOverview.tsx`
- `src/components/analytics/ReplyIntelligence.tsx`

### Analytics/model/backend
- `src/lib/analytics-overview.ts` (new)
- `src/lib/analytics-model.ts`
- `src/lib/analytics.functions.ts`
- `src/lib/reply-classification.ts` (new)
- `src/lib/reply-crm.server.ts` (new)
- `src/lib/inbox-model.ts`
- `src/lib/inbox.server.ts`
- `src/lib/inbox.functions.ts`
- `src/lib/positive-reply-sentiment.ts`
- `src/lib/positive-reply-sentiment.server.ts`
- `src/lib/email-events.server.ts`
- `src/lib/mailbox-imap-poll.server.ts`

### Tests/documentation
- `tests/analytics-overview-upgrade.test.ts`
- `tests/engagement-overview-presentation.test.tsx`
- `tests/reply-classification-upgrade.test.ts`
- `tests/reply-crm-recovery.test.ts`
- `tests/reply-manual-correction.test.ts`
- `tests/mailbox-reply-recovery.test.ts`
- `roadmap.md`
- This report.

## Database and publication
No database files, migrations, RLS policies, production settings or customer data changed. Existing conversation events, inbound events, reply logs and CRM activities are reused. No provider was added. Classification uses the existing deterministic approach without paid AI calls; confidence is null rather than an invented probability.

Changes remain unpublished. No live emails, campaigns, workers or production queries were triggered during verification.

## Actual verification
- **25 test files, 180 tests passed; 0 failed** in the focused expanded suite.
- Coverage includes deduplication, date windows, historical unit signals, zero data, confirmed-delivery denominators, rendered empty/loading/error states, distinct light/dark tokens, interest/rejection/ambiguity, quoted HTML, OOO, unsubscribe priority, CRM retry/activity identity, preserved deal stages, manual correction workspace scope/failure visibility, mailbox failure persistence, and existing inbound/notification regressions.
- The harness's latest automatic typecheck/build results reported **build OK**. Initial compile issues introduced during editing were corrected.
- Server diagnostics showed existing API deprecation warnings, not new runtime failures.

## Remaining limitations / release gates
- Authenticated browser verification, visual light/dark inspection, real RLS execution and database-backed inbound crash/concurrency testing were not available. Pure helpers, mocked IO and server-rendered presentation tests do not replace these release checks.
- Existing historical readers collapse engagement to stored first timestamps; repeated open totals are not reconstructed. The overview explicitly labels unique contacts and excludes repeat opens. Legacy historical gaps remain possible.
- Confirmed delivery receipts may be incomplete. Open/reply rates use sent minus confirmed bounces when the selected send cohort lacks complete receipts; this is not inbox-placement evidence.
- Meetings count recorded booking activities only. Legacy bookings without activities may be missing; campaign/mailbox-scoped booking counts display unavailable because legacy activity rows lack attribution.
- The rules are English-first. Unknown/multilingual or ambiguous replies remain needs-review; no AI thread-aware classifier was introduced.
- CRM/campaign side effects are retryable but not one database transaction. Hard crashes before classification metadata is saved, missing Message-ID, or failure to persist an IMAP recovery event still require operational review. Existing logs retain the original message where it was saved.
- Existing sending architecture, worker flags and scheduler remain unchanged. Retry operation still depends on the owner's existing inbound retry configuration.
- Manual correction uses the existing conversation/lead status UI and can affect the lead's existing reply rows; it is not a new per-message classification editor.

Do not publish until the owner reviews these limitations and completes authenticated/database-backed release checks.