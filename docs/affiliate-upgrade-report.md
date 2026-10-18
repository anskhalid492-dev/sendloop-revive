# Affiliate upgrade — not activated or published

## Implemented
- Existing `/referrals` and admin `/mranuskhalid/referrals` retained; additive affiliate management, status, private conversion lists, protected payout details, marketing copy/resources, history and affiliate export.
- `/referral` and `/referral/agencies`: current settings, monthly/lifetime/annual breakdown, calculator, eligibility, payout explanation and ten FAQs each. Footer links for both.
- Defaults: 30% monthly for first 12 successful paid monthly periods; 20% first lifetime purchase; 30% first annual payment, no annual renewal commission.
- Native verified Stripe invoices use environment-qualified PaymentIntent identities; failed payments, manual invoices and checkout return pages never create commissions. Same payment with two webhook IDs cannot pay twice.
- Tax-exclusive eligible mapped-plan revenue, discounts/credits and partial payments; payment-linked proportional refunds/disputes. Cancellation does not reverse past paid earnings.
- Atomic payout requests and allocations, required payment reference, audit trail, partial settlement rather than marking every commission paid. Test commissions cannot enter live spendable balances or consume live earning eligibility.
- Public activation is gated by `operational_verified_at`; no action in this upgrade sets it. Payout providers remain manual; no transfers were performed.

## Validation
- Full suite: 1,969 tests passed across 207 files before the last additional isolation regression; rerun results are recorded in the completion summary.
- Automatic compilation clean. Desktop/mobile public pages rendered with no page errors or horizontal overflow. Calculator: 3 referrals × $100 eligible payment × 30% = $90 per period; four paid periods = $360.
- Database transaction tests run entirely in in-memory PGlite with explicitly named `affiliate-test` fixture accounts. Stripe bridge tests mock all provider calls. No customer data or payment provider transactions were used.
- Signed-in dashboard/admin, live production schema and real Stripe test-checkout-to-dashboard flow are **not verified**. External backend sessions cannot be restored here; do not treat source/tests as end-to-end verification.

## Required manual setup and release gates
1. Owner reviews and applies **all seven `20261018…` affiliate migrations in timestamp order** from `supabase/migrations` to production `rihgz`. Tool execution only changed the connected development database, not this hard-pinned production backend. Do not publish the application before this schema is ready. Existing rows/IDs are preserved; nothing was deleted.
2. Explicitly named throwaway affiliate and customer accounts must verify signup attribution, independent client ownership, approval, both invoice-success deliveries, monthly renewal limit, annual-first-only, lifetime, prorated upgrades, refunds/disputes and administrator payout allocations. Test commissions are not withdrawable; the local fixture tests exercise the live allocation algorithm without real money.
3. Reconcile pre-upgrade commissions/payouts with their original payment records before migrating balances. Existing history remains stored; legacy commissions are deliberately not treated as new spendable funds. Do not bulk-backfill or replay old live customer events. Handle any required mapping as an owner-reviewed, specifically scoped accounting operation.
4. In the existing Stripe webhook configuration, enable `invoice.paid`, `invoice.payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, plus the existing checkout/subscription events. Endpoint remains `/api/public/billing/stripe`, with the existing test/live signature secrets. Separate Price IDs for each plan and billing interval must already be mapped. The retired custom `/api/public/referral/billing` returns 410; do not send Stripe events there.
5. Configure real payout methods, recipient details, minimum, schedule and hold period in Admin. Manual payments occur outside MunchReach; marking paid requires the actual transaction reference. No Stripe Connect onboarding/transfers are implemented or automatically triggered.
6. After all checks, an owner must separately approve operational verification. Keep `enabled=false` and `operational_verified_at=NULL` until then. Activation has no shortcut in the UI. Publishing/deployment still requires a separate request and warning.

## Remaining limitations
- Non-USD payments fail closed rather than mixing currencies; current plan checkout is USD. Public terms and existing UI explain USD payout balances.
- Customer lists/history show the most recent 100 commission/referral rows and 50 payouts, explicitly labelled; admin lists/export cap at 200. Full paging/export is not complete.
- No full automated test-account activation wizard; verification timestamp is an owner-operated release gate.
- Arbitrary adjustment credits, automatic payout transfers, configurable per-plan allowlists, downloadable banner assets and full affiliate analytics/time filters are not implemented. Admin eligibility/terms and separate rates/windows are editable.
- Linter has 79 reviewed findings: 77 pre-existing and two new authenticated administrator review functions intentionally callable behind server-verified admin checks. Public review execution was revoked; ordinary customers cannot process payment ledger events or change profile approval. Unrelated leaked-password protection remains an existing warning.

No publication, deployment, provider setup changes, live payouts or customer/history modifications were performed.