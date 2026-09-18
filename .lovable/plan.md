# Count bounced and unsubscribed recipients that are hidden inside "Cancelled"

## The problem

When someone bounces or unsubscribes mid-sequence, the remaining queued emails for
that person are stopped by marking them "cancelled" with no reason recorded. Every
count of Bounced / Unsubscribed only looks for a message whose own status is literally
bounced or unsubscribed, so those people vanish into the Cancelled bucket: the campaign
status tiles, campaign Analytics, workspace Analytics and the shared open/click/reply
rate base all miss them.

## The fix

1. **Record the reason.** Add one new optional field on campaign emails,
   `cancelled_reason`, with values `recipient_bounced`, `recipient_unsubscribed`,
   `recipient_complained`, `recipient_replied`, `sequence_stopped`, `manual`.
   Additive only — no existing column or row is changed or removed.

2. **Set it wherever an email is cancelled** (all existing stop paths keep behaving
   exactly as they do today, they just also write the reason):
   - bounce / unsubscribe / complaint event handling (including the workspace-wide
     stop for the same address)
   - the unsubscribe link endpoint
   - suppression check at send time
   - stop-on-reply
   - inbox and public API stop actions
   - manual cancel from the queue screen (reason `manual`)

3. **One shared counting rule.** A single helper decides who counts as bounced or
   unsubscribed: a person counts if their emails carry a real bounce/unsubscribe
   signal **or** were cancelled for that reason. Counted per person, so a bounce that
   stopped three follow-ups is still one bounce. Every surface calls this one helper:
   - campaign status tiles (Cancelled keeps the full total; Bounced gains the hidden
     ones and a new Unsubscribed tile appears next to it)
   - campaign Analytics tab and campaign Overview
   - workspace Analytics and the dashboard campaign table
   - the shared rate calculation, so the open/click/reply base (accepted sends minus
     confirmed bounces) excludes those people
   - the public API campaign stats, which already reads the shared numbers

4. **Backfill the past.** A rerunnable script fills `cancelled_reason` on existing
   cancelled emails by reading the bounce/unsubscribe history already stored for that
   recipient (delivery event log, recipient status, suppression list). Past campaigns
   then report their real bounce and unsubscribe counts too.

5. **Tests.** New cases covering: a bounce mid-sequence counted once as bounced while
   the cancelled total stays intact, an unsubscribe counted as unsubscribed, a generic
   cancel staying uncounted, and the rate base excluding bounced people. Plus the
   existing campaign stats / delivery / API test suites and a typecheck.

## Acceptance

On the campaign in question: Cancelled stays 6, Bounced shows 3, Unsubscribed shows 3,
and the open/click/reply denominator drops those 3 bounced recipients.

## Technical notes

- New column: `campaign_messages.cancelled_reason text` + partial index on
  `(campaign_id, cancelled_reason)` where not null. Ships as a rerunnable
  `supabase/manual/cancelled-reason.sql` (schema + backfill) because production schema
  changes on this project are applied manually.
- Shared logic lives in `src/lib/campaign-stats.ts` (unit collapse gains
  `cancelledReason`; bounced/unsubscribed become distinct-person counts) and is
  consumed by `campaign-stats.server.ts`, `queue.functions.ts`,
  `campaign-page-summary.server.ts`, `campaign-read.functions.ts`, analytics readers
  and `engagement-rates.ts` callers — no second copy of the rule.
- Status-tile counts move from per-message `count(*)` filters to the shared
  distinct-recipient helper for bounced/unsubscribed only; all other tiles keep their
  existing exact counts.
