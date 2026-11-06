# Campaign reconciliation — 6 November 2026

## Scope and actual production result

Read-only audit of **Agencies - Free Trials**, campaign `623e4dbb-11ac-4c36-be68-04e0a8da5e95`. Final aggregate snapshot: **13:02:37 UTC**. No production writes, sends, migrations, publication or deployment.

| Exclusive current message outcome | Distinct message IDs |
|---|---:|
| Queued / scheduled | 664 |
| Sending | 0 |
| Accepted, no later recorded rejection/receipt | 695 |
| Confirmed delivered | 0 receipts recorded; delivery itself is unknown |
| Recorded bounced | 10 |
| Definitively failed (excluding held/bounced) | 0 |
| Held for review | 116 |
| Cancelled | 3 |
| **Total** | **1,488** |

**705 cumulative provider-accepted messages = 695 currently accepted + 10 later recorded bounces.** These 705 are separate IDs from the 116 held messages. Distinct attempted/outcome-bearing messages: **821**. The 999 attempt value is a retry-block sentinel, not 999 actual sends.

There are no duplicate `(recipient_id, step_id)` message groups in this campaign. The outbound registry contains 2,097 alias entries for 699 message IDs; sample rows contain bracketed/unbracketed provider IDs and the generated RFC ID. Counting registry rows as emails would be wrong. None of the held IDs has any registry alias.

## Root causes

1. Recovery stored ambiguous outcomes as legacy `status='failed'` with an unknown-outcome reason and attempts=999. Queue and some campaign/analytics reads counted that storage status as definitive failure, while another counter separately displayed the exact same 116 IDs as held. This is duplicate **category accounting**, not 232 emails.
2. Several readers presented accepted-minus-bounced as delivered without receipts. No `delivered_at` exists for this campaign. 694 was an estimate, not verified delivery.
3. The former 11 bounce count included **10 bounced message IDs plus one cancelled, never-sent message** `41bcabd0-e811-4eb4-986b-5a17ff4565e6`, carrying `cancelled_reason='recipient_bounced'`. That cancellation demonstrates a stopped recipient, not an eleventh bounced attempt. It explains 705−11=694 while actual accepted-not-bounced IDs number 695.
4. Shared stats previously merged different IDs by recipient+step and mixed people-based outcomes with message totals. Separate attempts must remain separate IDs; repeated reads of the same ID must dedupe.
5. Delivery-state handlers ranked events from stale caller snapshots and wrote by ID without a version check. Recovery and manual retries also had read-then-write gaps.

## What the 116 records actually represent

Each ID was audited; full address-free inventory is `docs/campaign-held-reconciliation-2026-11-06.csv`.

- All 116 have a provider-call interruption marker and attempts=999.
- No held message has sent_at, provider_message_id, delivered_at, bounced_at, acceptance-registry evidence, or a recorded definitive SMTP rejection.
- Provider-call markers span **2 November 17:02:03 UTC–5 November 19:48:03 UTC**.
- **20** have a recorded `munchreach_pixel` opened event; **96** have no matched engagement evidence. Pixel requests are useful evidence that the message content was accessed, but can originate from scanners/proxies and are not an authoritative SMTP acceptance or delivery receipt. They must not be fabricated into sent/delivered dates.
- No held record qualifies for an evidence-based status repair using the database evidence currently available. Proposed outcome for every row remains **held**, with the 20 pixel-active rows prioritized for provider review.
- The queue has 6,478 campaign tick jobs recorded succeeded in the audited job snapshot. A completed orchestration tick is not proof of an individual SMTP acceptance; the job payload is campaign-level, not per-message provider evidence. Historical exact request-kill cause cannot be reconstructed from job status alone.

No message was resent. No repair SQL was executed or proposed to invent outcomes.

## Preview implementation

- `message-outcomes.ts`: one exclusive current outcome per distinct ID; cumulative acceptance and attempted inventory labeled separately.
- Shared campaign stats, lightweight and legacy builder readers, analytics overview/sequence/mailbox/trend/CSV, queue inventory and dashboard readers distinguish receipts from acceptance, held from failed, and cancelled follow-ups from bounced messages.
- Queue supports a dedicated Held filter and confirmed-delivery counter; accepted current-state inventory is separate from cumulative sent totals.
- `delivery-state.server.ts`: authoritative reread, updated_at compare-and-swap, bounded conflict retry, original event timestamp preservation and stronger-outcome protection.
- Dispatcher acceptance writes preserve terminal provider evidence when an event wins the race. Recovery is phase/version guarded and counts successful updates only. Manual requeue/retry repeats non-acceptance/held checks at write time.
- Existing phase tracking, atomic leases and event unique keys are retained; no schedule, cap, sending-window, billing or automatic retry rule changes.

## Auditable future history proposal — not applied

`supabase/manual/campaign-outcome-history.sql` adds an append-only workspace-readable transition ledger with grants/RLS and trigger. It records future transitions only; rerunning does not fabricate old history or update customer messages. It has been exercised twice locally with an isolated database; unchanged updates produce no extra history, original messages remain, and history rewrites are rejected.

Owner approval/manual migration is still required before production can have full future transition history. Past phase/status history was overwritten before a ledger existed and cannot be recovered honestly.

## Verification and limitations

- Isolated scenario verifies 694 confirmed delivered + 11 bounced =705 accepted IDs, **plus** 116 separate held IDs; zero definitive failures among those groups.
- Distinct-ID repeat reads, held-with-legacy-failure timestamp, acceptance without receipt, bounce precedence, reporting consistency, before/after-provider interruption, lost-CAS bounce, repeated event timestamps and history immutability are covered.
- Full isolated suite passed **2,171 checks across 228 test files**; local database history tests are isolated and never contact production.
- Automatic preview compilation is checked after final edits; no manual production build, deployment or publication was run.
- Authenticated campaign/dashboard/CSV visual readback and real SMTP/provider-event end-to-end verification remain unavailable without a named throwaway test-account session and provider evidence. No live customer browser session was used.
- The 10 stored bounce rows are historical labels, not a guarantee that every diagnostic is recipient-side. In particular `6c62569a-aaba-4fd7-822e-891554503620` contains `550 5.7.1_ETR` (sender/policy classification now stays Failed); one generic DSN subject lacks its detailed diagnostic. Neither historical row was silently rewritten.
- The older SQL rollup/RPC definitions and external integrations may still apply old semantics until owner-reviewed changes are applied; preview customer readers bypass their outcome fields with canonical computation. No database RPC replacement has been executed.
- This is a durable preview counting/safety correction, **not a verified permanent real-world delivery guarantee**. Provider logs and a controlled real send must verify acceptance, timeout recovery, delayed bounce and UI readback before that claim is justified.