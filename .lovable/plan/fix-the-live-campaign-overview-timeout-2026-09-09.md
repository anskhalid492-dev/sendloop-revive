# Fix the live Campaign Overview timeout

## Confirmed failure
- Live frontend request: TanStack server function `getCampaign`.
- Database call: `campaign_page_summary(_campaign_id, _day_start)` for campaign `0a414e1b-8bf4-4e9d-8b6d-2e665118e713`.
- Exact database response: code `57014`, message `canceling statement due to statement timeout`.
- The expensive operation is the `OR` join matching every campaign recipient to messages by either `recipient_id` or legacy `lead_id`.

## Implementation
- Replace only the slow recipient-state portion of `campaign_page_summary` with two separately grouped, indexed message lookups, preferring `recipient_id` and using `lead_id` only for legacy messages without a recipient.
- Preserve the function name, parameters, permissions, JSON response shape, campaign data, and all other campaign behavior.
- Add regression coverage that rejects the old `OR` join and verifies the optimized function keeps the expected output contract.

## Verification
- Run the focused campaign tests, full test suite, typecheck, and production build.
- Apply the function replacement only to the existing live database after explicit confirmation that the target is production; do not switch projects or alter campaign rows.
- Reopen the exact campaign and verify Overview and Sequences, the `getCampaign` request, and live logs show HTTP 200 with no `57014` or HTTP 500.
