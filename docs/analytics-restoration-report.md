# Analytics targeted restoration — 2026-10-10

## Scope and status

- Restored the screenshot-led upper card: centered icon → count and inline percentage → label, four divided columns, compact date controls, original broad area-chart structure and bottom legend. Theme-token series colors, working toggles, date tooltip, Custom dates and loading/error/empty handling are retained. The reference image is `Analytics_edited.png`; its example values were not copied into the application.
- Retained the organized ten-card lower grid. Delivery without confirmation now displays a dash and an explanation, not a misleading zero. Accepted-minus-bounced breakdowns and CSV are explicitly labeled as estimates rather than confirmed delivery.
- No publishing, database/schema writes, send/warmup changes, tracking changes, rate formula changes or historical backfills.

## Source trace of the reported values

These are code-confirmed definitions, **not a reproduction of the production totals**. No authorized session for a named throwaway account with the reported data is available. Authenticated production totals, actual active filters and live receipt completeness remain **NOT VERIFIED**. No credentials were requested and no customer database was queried.

| Reported metric | Actual source and counting semantics | Finding |
|---|---|---|
| 858 Contacted | `getAnalyticsOverview` → `fetchCampaignStats` → `campaign_messages` → analytics units → distinct `leadKey` with `sent_at` in range | Different from emails: follow-up steps add sent messages but not another contacted identity. `leadKey` prefers campaign recipient ID, then lead ID, then message ID. It is not guaranteed to identify the same person across campaigns. Exact 858 not verified. |
| 1,266 Emails Sent | Logical recipient/sequence-step units with first `sent_at` in range | Retries collapse; follow-ups count separately. A recipient contacted in two campaigns must retain both campaigns' logical sends. Analytics previously collapsed by recipient/step globally; now it groups by campaign before collapse. Exact 1,266 not verified. |
| 0 Delivered | Upper overview counts `delivered_at` or event-feed delivery signals, while campaign/mailbox computations overwrite delivery with `sent − bounced` | These were two different meanings behind one label. Provider acceptance does not prove delivery or inbox placement. Zero receipts with sends now means unconfirmed; optional event-read failure means unavailable. Estimates in tables/export are labeled accordingly. |
| 170 unique opens / 14% | First stored `opened_at` per logical unit, from message or mapped `email_engagement_events`; unique `leadKey` over reporting range | Existing rate uses reachable emails (`sent − bounced`) when confirmations are incomplete, rounded to one decimal by shared helper then to a whole percent at ≥10% for display. With 1,266 sends and zero bounces, 170 yields 13.4%, displayed 13%; with 50 bounces, it yields 14%. **50 is an arithmetic fixture, not a claimed real bounce count.** Actual bounces/range must be checked to explain the reported 14%. |
| 855 Failed Sends | Former overview sum used `computeCampaignStats`: failure timestamp or failed status plus `updated_at`; mailbox path used a different counter | Old failures modified in the selected period could enter the total; a failed attempt followed by a successful retry could also retain a failure signal. Overview now counts unsent logical units with a real failure timestamp in range, excludes recovered retries, and flags legacy missing timestamps. Exact 855 and its causes require the actual scoped rows; no historical timestamps were fabricated. |

### Queries, filters and dates

- `fetchCampaignStats` reads campaigns using `workspace_id` and optional campaign IDs, then campaign messages using the same workspace and campaign IDs. Message reads are paged and merged by ID across sent-in-range, updated-in-range, scheduled-at/after-start and unsent queries. Pure counters then enforce their occurrence timestamps.
- Events use `email_engagement_events`, the same workspace/campaign IDs, non-null message ID and `occurred_at >= from AND occurred_at < to`. Replies use `campaign_replies` with workspace/campaign IDs and `received_at` boundaries. Overview reply rows additionally apply mailbox filtering and latest-intent deduplication.
- Main overview, chart and lower cards receive one shared `from`, `to`, campaign and mailbox selection. Mailboxes are filtered from collapsed logical units by the sending account attached to the successful send. Retries therefore follow successful-send attribution rather than every attempted mailbox.
- Fixed date choices start at browser-local midnight `(days − 1)` days ago and end at the current instant captured when the selection changes. Custom includes both selected dates, passing an exclusive next-day end. These instants are serialized as UTC ISO strings. Chart buckets remain UTC hour/day boundaries, while axis/tooltip text uses the browser locale. In non-UTC zones bucket labels need not correspond to local midnight; this existing behavior was not silently changed. Fixed 24-hour Custom end arithmetic is not DST-calendar-aware.
- Funnel detail previously omitted both selected campaign and mailbox from the main page; the campaign dialog also omitted mailbox. Both now propagate the selected filters, and each source query applies workspace, campaign, mailbox and half-open dates through a tested helper. Detail views still cap results and use source-specific deduplication; they are not an uncapped reconciliation export.
- Audience size is the current campaign recipient population, not a dated activity count; historical meetings return unavailable under campaign/mailbox filters because legacy activities cannot prove that attribution.

### Delivery evidence and unavailable states

Message `delivered_at` and recognized delivery events are evidence; sent status, SMTP acceptance, opens and no bounce are not explicit receipts. The existing engagement writer is unchanged. The optional provider-event read failure is now carried to the overview as availability metadata; campaign behavior is preserved. A dash is used for missing evidence rather than changing counts or denominators. Campaign/mailbox estimates retain their values with explicit labels; the workspace funnel omits an unconfirmed delivery conversion instead of implying 0% delivery.

### Known read-model limitations (not changed outside this scope)

- Message selection may omit an old send with an event in-range but no qualifying message update; event IDs are not independently hydrated into message rows.
- Earliest stored signals mean repeat opens are unavailable as a reliable all-events count. Per-bucket unique opens can sum above range-unique opens when a contact opens different steps on different dates.
- Shared campaign/sequence calculations elsewhere retain their legacy accepted-minus-bounced and failure rules; this task did not alter sending, shared rate formulas, worker logic or unrelated pages.
- Live permissions, production schema compatibility and authenticated end-to-end reads are **NOT TESTED**. Preview/browser verification used offline fixture values only, not customer activity or real totals.

## Verification

- Full isolated suite: **174 files passed, 1,616 tests passed, 0 failed**. Includes tracking/security and all existing analytics tests plus ten new behavior tests.
- Initial focused run: 41 passed, 1 failed because the new test expected unrounded rate arithmetic rather than the existing one-decimal helper. Corrected expectations to concrete 14 and 13.4 without changing the formula.
- Initial full run: 1,612 passed, 4 failed because the framework transforms server-function exports into RPC wrappers, invalidating direct-handler mock tests. Replaced that harness with tests of the shared query-scoping helper actually used by the three drilldown readers; filter assertions were retained.
- Browser fixture: centered summaries, four theme-colored chart series, exact tooltip values and series toggles verified; no browser exceptions or narrow-screen overflow. Desktop and narrow-screen screenshots inspected. This is **presentation-only**, not authenticated real-data verification.
- Automatic build verification is recorded in the preview diagnostics; final status is checked before concluding.

## Deployment

**NOT DEPLOYED.** Owner approval is required. Exact reported production totals cannot be confirmed from source-only investigation; reconciliation needs an authorized, read-only view of the specifically affected workspace and its precise date/campaign/mailbox selection.