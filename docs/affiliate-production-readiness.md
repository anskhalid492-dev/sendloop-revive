# Affiliate Program — Production-Readiness Review

Date: 2026-10-18. Review only — no migrations executed, no production data touched, no Stripe changes, nothing activated or published.

## The seven affiliate migrations (timestamp order)

### 1. `20261018195336` — Core affiliate schema and rules
- Adds configurable rule columns to `referral_programs`: monthly % (30), monthly paid periods (12), lifetime % (20), annual % (30), cookie days (60), approval-required flag, and `operational_verified_at` (the activation gate).
- New referral profiles now default to `pending` (approval-first).
- Adds ledger columns to `referral_commissions`: `affiliate_payment_key`, `reversed_cents`, `settled_cents`, `payable_at`.
- Creates four new tables: `affiliate_payments` (one row per verified Stripe payment), `affiliate_adjustments` (refund/dispute/admin reversal ledger), `affiliate_event_receipts` (webhook idempotency), `affiliate_payout_allocations` (which commissions each payout settles).
- Tightens access: affiliates see only privacy-safe columns of their own referrals/commissions/payouts; full rows are staff-only.
- Creates the core functions: `affiliate_program_public`, `ensure_referral_profile`, `process_affiliate_payment`, `request_referral_payout`, `review_affiliate_payout`, `review_affiliate_commission`.

### 2. `20261018195610` — Permission hardening
- Revokes anonymous/public execution of admin and payout functions.
- Makes public program terms readable by visitors through a narrowly-scoped column grant and policy.

### 3. `20261018200208` — Affiliate dashboard functions
- Creates `affiliate_dashboard_stats` (clicks, signups, customers, pending/approved/paid/reversed/available balances) and `save_affiliate_payout_details`.

### 4. `20261018200510` — Server-side summaries
- Restricts dashboard/payout-detail functions to the server role; adds `affiliate_private_summary` and `affiliate_private_preferences` wrappers so the app server reads them on behalf of the signed-in affiliate.

### 5. `20261018201212` — Test/live separation
- Adds `affiliate_environment` to commissions.
- Patches `process_affiliate_payment` so the enabled/verified gate applies only to live payments (test-mode commissions can be created before activation), and so payout/dashboard math counts only live commissions.

### 6. `20261018201430` — Payout integrity fixes
- Payout requests and dashboard totals no longer filter by environment (affiliates see their full balance).
- Admin payout review deducts over-settled amounts and refuses to complete unless every cent of the payout is allocated to commissions (no partial allocations).
- Reversed commissions can no longer receive further adjustments.

### 7. `20261018202256` — Period counting fix
- Monthly paid-period counting is scoped per environment, so test payments never consume a live customer's 12 commissionable months.

## Data safety assessment

**Safe to run — additive only.** Every change uses `ADD COLUMN IF NOT EXISTS`, new tables, new/replaced functions, grants, and revokes. Nothing drops, renames, or rewrites existing rows. Existing affiliate profiles, referral attributions, clicks, commissions, payouts, and audit history keep their IDs and values untouched.

**Reconciliation of existing records:**
- Existing commissions get `reversed_cents = 0`, `settled_cents = 0`, `payable_at = NULL`, `affiliate_payment_key = NULL`, `affiliate_environment = NULL` by default.
- `payable_at` falls back to `approved_at` everywhere it is used, so already-approved commissions remain payable.
- Dashboard totals and payout requests include legacy (NULL-environment) commissions, so affiliates keep their full historical balance.
- **Exception found:** the admin payout-review function (`review_affiliate_payout`) computes available balance and the over-settled deduction with `affiliate_environment = 'live'`, which excludes legacy NULL-environment commissions — while its allocation loop has no environment filter. Result: an affiliate whose balance is partly legacy commissions could see "Balance changed; review refunds before payment" when an admin tries to mark a payout paid. See "Must fix" below.

## Risks identified

1. **String-patch fragility (migrations 5–7).** These rewrite functions by exact string replacement. If the production function text differs even slightly from the sandbox version (drift has happened before), `replace()` silently no-ops and the migration "succeeds" without applying the fix. Each patch must be verified on production after running (e.g. check `pg_get_functiondef` contains `affiliate_environment`).
2. **Legacy-commission payout mismatch** (above) — admin payout review can block payouts for affiliates with pre-upgrade commissions.
3. **Locking:** migration 1's `ALTER TABLE` statements take brief exclusive locks; the affected tables are small, so impact is minimal, but run during low traffic. No long-running rewrites exist (all new columns have constant defaults).
4. **No duplicates:** the unique index on `affiliate_payment_key` and the receipts table prevent double commissions even under Stripe retries.

## Stripe webhook and Price ID verification (code)

- Handlers exist and are wired into the verified billing webhook for: `invoice.paid`, `invoice.payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. All processing happens only after signature verification; test and live credentials are never mixed.
- Plan Price ID mappings are enforced: a payment only earns commission when its invoice lines match a saved `billing_plan_prices` mapping for the correct plan, provider (Stripe), and environment. Arbitrary invoice items and credits never earn commission.
- Monthly renewals, annual first payment, proration-only upgrades, tax exclusion, refunds, and disputes are handled in code.
- **Gap — lifetime without invoice:** lifetime checkout is a one-time Stripe payment. The affiliate bridge only listens to invoice events; if Stripe Checkout does not generate an invoice for one-time payments (it does not by default), lifetime commissions would never be created. Must be confirmed in Test Mode; if missing, either enable invoice creation on lifetime checkout or extend the bridge to `checkout.session.completed` (payment mode).
- **Config-side (not verifiable from code):** the Stripe webhook endpoint must actually subscribe to the five events above in the Stripe dashboard, and `billing_plan_prices` rows must exist for every sellable plan in both test and live environments.

## Stripe Test Mode verification checklist

1. Apply all seven migrations to a staging copy; verify each string-patch landed (`pg_get_functiondef`).
2. Create a fresh test affiliate (second account), get approval, copy referral link.
3. Monthly: sign up a new test customer via the link, pay a monthly plan with a test card → one commission at 30% of the ex-tax amount.
4. Renewal: advance/renew the subscription → second commission; confirm period counting increments; confirm no commission after the 12th paid period.
5. Annual: new referred customer on annual plan → one 30% commission; confirm the annual renewal a year later earns nothing.
6. Lifetime: new referred customer buys Lifetime / Lifetime Starter → confirm a 20% commission is created (this validates the invoice gap above).
7. Refund: refund a referred payment → commission reduced proportionally; full refund → commission reversed.
8. Dispute: open a dispute → commission held; close as won → restored; lost → reversed.
9. Self-referral: refer your own workspace → no commission.
10. Duplicate delivery: re-send the same webhook (retry stored event) → no duplicate commission.
11. Payout: request payout below minimum → rejected; at/above minimum → request, admin review, mark paid with reference → allocations complete, balance zeroed correctly, including a legacy-style commission if any exist.
12. Inactive gate: before setting `operational_verified_at`, confirm live payments create no commissions but normal billing is unaffected.

## Blockers to activation

1. Apply the seven migrations to production, in order, verifying the string-patches landed.
2. Fix the legacy-environment mismatch in `review_affiliate_payout` (or backfill `affiliate_environment = 'live'` on existing commissions) before any payout is reviewed.
3. Confirm lifetime checkouts produce invoices (or extend the bridge).
4. Subscribe the Stripe webhook to the five affiliate events (test and live).
5. Confirm `billing_plan_prices` mappings for every sellable plan in both environments.
6. Complete the Test Mode checklist end-to-end.
7. Only then set `operational_verified_at` and enable the program in Admin.

## Summary

- **Safe to proceed:** all seven migrations are additive and preserve existing records, IDs, commissions, and payout history; idempotency and self-referral protections are in place.
- **Must fix before migration/payout use:** legacy-commission exclusion in admin payout review; verify string-patch migrations actually applied on production.
- **Must verify before activation:** lifetime invoice creation, Stripe webhook event subscriptions, Price ID mappings for all plans, full Test Mode checklist.
- **Remaining limitations:** payouts are manual (external payment + reference); no automatic reconciliation job for missed webhooks (manual retry only); multi-currency balances are computed per currency but displayed assuming USD.
