# Affiliate Program — Final Production Migration & Stripe Test Mode Execution Checklist

Date: 2026-10-18. Companion to `docs/affiliate-production-readiness.md`. **Nothing in this document has been executed.** No migrations run, no production data modified, no Stripe settings changed, program not activated, nothing published.

Legend: **[DB]** database operation · **[STRIPE]** Stripe Dashboard action · **[UI]** application UI test

---

## 1. Migration files and execution order

Run these nine files against the production database, in this exact order. Files 1–7 are the original affiliate set; 8–9 are the blocker fixes (full `CREATE OR REPLACE`, drift-safe).

| # | File | What it does |
|---|---|---|
| 1 | `supabase/migrations/20261018195336_*.sql` | Core schema: rule columns on `referral_programs`, ledger columns on `referral_commissions`, new tables `affiliate_payments`, `affiliate_adjustments`, `affiliate_event_receipts`, `affiliate_payout_allocations`, core functions |
| 2 | `supabase/migrations/20261018195610_*.sql` | Permission hardening: revokes anon execution of admin/payout functions |
| 3 | `supabase/migrations/20261018200208_*.sql` | `affiliate_dashboard_stats`, `save_affiliate_payout_details` |
| 4 | `supabase/migrations/20261018200510_*.sql` | Server-side wrappers `affiliate_private_summary`, `affiliate_private_preferences` |
| 5 | `supabase/migrations/20261018201212_*.sql` | Adds `affiliate_environment`; patches `process_affiliate_payment` (string patch — verify after) |
| 6 | `supabase/migrations/20261018201430_*.sql` | Payout integrity patches (string patch — known to have partially no-oped; superseded by #8/#9 but still run for ordering) |
| 7 | `supabase/migrations/20261018202256_*.sql` | Per-environment monthly period counting (string patch — verify after) |
| 8 | `supabase/migrations/20261018205848_2da81d71-d029-4680-8e4b-fd30ae5ab720.sql` | Full replace of `review_affiliate_payout`: legacy NULL-environment commissions count as live; full-allocation enforcement |
| 9 | `supabase/migrations/20261018210128_c7a54550-40ef-4989-a92e-8af4e6177ea5.sql` | Full replace of `request_referral_payout` and `affiliate_dashboard_stats` with the same legacy treatment |

Use `ls supabase/migrations/2026101819* supabase/migrations/2026101820*` to resolve the `*` suffixes before running.

## 2. Pre-migration backup and verification **[DB]**

There are no automated backups or point-in-time recovery on this project — a manual export is the only rollback path.

1. Export the affected tables before touching anything:
   ```sql
   COPY (SELECT * FROM public.referral_programs) TO STDOUT WITH CSV HEADER;          -- save to file
   COPY (SELECT * FROM public.referral_profiles) TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.referral_attributions) TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.referral_clicks) TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.referral_commissions) TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.referral_payouts) TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.referral_audit_logs) TO STDOUT WITH CSV HEADER;
   ```
2. Snapshot current function definitions for diff/restore:
   ```sql
   SELECT proname, pg_get_functiondef(oid) FROM pg_proc
   WHERE pronamespace='public'::regnamespace
     AND proname IN ('process_affiliate_payment','request_referral_payout',
                     'review_affiliate_payout','affiliate_dashboard_stats',
                     'review_affiliate_commission','ensure_referral_profile',
                     'affiliate_program_public','save_affiliate_payout_details');
   ```
3. Record baseline counts (compare after every migration — must never change):
   ```sql
   SELECT (SELECT count(*) FROM public.referral_profiles) profiles,
          (SELECT count(*) FROM public.referral_commissions) commissions,
          (SELECT count(*) FROM public.referral_payouts) payouts,
          (SELECT count(*) FROM public.referral_attributions) attributions,
          (SELECT count(*) FROM public.referral_audit_logs) audit_logs;
   ```
4. Run during low traffic; migration 1 takes brief exclusive locks on referral tables.

## 3. Per-migration checks **[DB]**

**Before migration 1:**
```sql
SELECT count(*) FROM public.referral_commissions WHERE affiliate_environment IS NULL;  -- legacy count, record it
SELECT to_regclass('public.affiliate_payments');   -- must be NULL (table does not exist yet)
```

**After migration 1:**
```sql
SELECT to_regclass('public.affiliate_payments'),
       to_regclass('public.affiliate_adjustments'),
       to_regclass('public.affiliate_event_receipts'),
       to_regclass('public.affiliate_payout_allocations');   -- all non-NULL
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='referral_commissions'
  AND column_name IN ('affiliate_payment_key','reversed_cents','settled_cents','payable_at');  -- 4 rows
-- Re-run baseline counts: unchanged.
```

**After migration 2:**
```sql
SELECT proname, proacl FROM pg_proc WHERE pronamespace='public'::regnamespace
  AND proname IN ('review_affiliate_payout','review_affiliate_commission','request_referral_payout');
-- anon must NOT have execute.
```

**After migrations 3–4:**
```sql
SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace
  AND proname IN ('affiliate_dashboard_stats','save_affiliate_payout_details',
                  'affiliate_private_summary','affiliate_private_preferences');  -- 4 rows
```

**After migrations 5–7 (string patches — mandatory verification):**
```sql
SELECT pg_get_functiondef('public.process_affiliate_payment(uuid,uuid,text,integer,text,text)'::regprocedure)
  LIKE '%affiliate_environment%' AS env_patched;   -- must be true; if false, the patch no-oped — stop and apply the fix manually
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='referral_commissions'
  AND column_name='affiliate_environment';          -- 1 row
```
If any patch no-oped, do not continue blindly — migrations 8–9 replace the payout functions anyway, but `process_affiliate_payment` (migration 5/7) has no full-replace fallback and must be verified working.

**After migrations 8–9:**
```sql
SELECT pg_get_functiondef('public.review_affiliate_payout(uuid,text,text,text)'::regprocedure)
  LIKE '%coalesce(affiliate_environment,''live'')%' AS legacy_fixed;   -- must be true
SELECT pg_get_functiondef('public.request_referral_payout(integer,text,text)'::regprocedure)
  LIKE '%coalesce(affiliate_environment,''live'')%' AS legacy_fixed;   -- must be true
-- Re-run baseline counts one final time: unchanged.
```

## 4. Legacy commission reconciliation check **[DB]**

Confirms pre-upgrade (NULL-environment) commissions are visible in dashboards and payout balances without modifying them:

```sql
-- Legacy rows still intact, untouched:
SELECT count(*), sum(commission_amount_cents) FROM public.referral_commissions
WHERE affiliate_environment IS NULL;   -- matches the pre-migration count from step 3

-- For each affiliate with legacy commissions, the dashboard math must include them.
-- Compare function output vs manual sum for one such profile:
SELECT id FROM public.referral_profiles
WHERE id IN (SELECT referral_profile_id FROM public.referral_commissions WHERE affiliate_environment IS NULL)
LIMIT 1;
-- Then, signed in as that affiliate (or as service_role), call affiliate_dashboard_stats()
-- and confirm available_cents equals:
SELECT sum(commission_amount_cents - reversed_cents - settled_cents)
FROM public.referral_commissions
WHERE referral_profile_id = '<profile_id>' AND currency='usd'
  AND coalesce(affiliate_environment,'live')='live'
  AND status IN ('approved','paid') AND coalesce(payable_at, approved_at) <= now();
```

## 5. Stripe Test Mode — purchases **[STRIPE]** + **[UI]**

Prerequisites **[STRIPE]**: webhook endpoint `https://munchreach.com/api/public/billing/stripe` subscribed to `invoice.paid`, `invoice.payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `checkout.session.completed`, `checkout.session.async_payment_succeeded` (plus the existing billing events — do not remove any). `billing_plan_prices` rows exist for every sellable plan in the **test** environment.

Setup **[UI]**: create a fresh test affiliate account (second user), approve it in Admin, copy its referral link. Use a separate test customer account/workspace for purchases. Never use real customer accounts.

| # | Scenario | Action | Expected ledger result |
|---|---|---|---|
| 1 | Monthly first payment | Test customer signs up via link, buys monthly plan with `4242…` test card | One commission = 30% of ex-tax amount; `affiliate_environment='test'`; one `affiliate_payments` row keyed by PaymentIntent |
| 2 | Monthly renewal | Advance/renew the subscription (test clock or wait) | Second commission; period count = 2 |
| 3 | 13th period | Renew past 12 paid periods | No commission after the 12th |
| 4 | Annual first payment | New referred customer buys annual plan | One 30% commission |
| 5 | Annual renewal | Renew the annual plan | No commission |
| 6 | Lifetime | New referred customer buys Lifetime ($99) via Checkout | One 20% commission created from `checkout.session.completed` (no invoice needed) |
| 7 | Lifetime Starter | Same for the $29 plan | One 20% commission on $29 ex-tax |
| 8 | Refund | Refund the monthly payment in Stripe | Commission reduced proportionally; full refund → `reversed_cents` = full amount, status reversed |
| 9 | Dispute | Open dispute with test card `4000000000000259`; then close won, and in a second case lost | Open → held; won → restored; lost → reversed |
| 10 | Self-referral | Affiliate refers their own workspace | No commission |
| 11 | Duplicate delivery | Re-send the same webhook event from Stripe's event log | No duplicate commission (receipts table + unique payment key) |
| 12 | Dedup across paths | If a lifetime payment also emits an invoice event | Still exactly one commission (same PaymentIntent key) |

## 6. Payout flow — test accounts only **[UI]** + **[DB]**

1. **[UI]** As the test affiliate with test-environment commissions: note that payouts count only live/legacy commissions — test-mode commissions intentionally do not create payable balance. To exercise payout UI end-to-end, use an affiliate whose balance comes from legacy (pre-upgrade) commissions, or temporarily verify with a service-role SQL read rather than a real request.
2. **[UI]** Request a payout below the configured minimum → rejected with a clear error.
3. **[UI]** Request at/above the minimum with valid payout details → payout row created, status `requested`; available balance decreases by the requested amount.
4. **[UI]** As admin: open the payout, move to `under_review` → `approved` → `processing`.
5. **[UI]** Mark `paid` **without** a payment reference → rejected ("Payment reference required").
6. **[UI]** Mark `paid` with a test reference (e.g. `TESTPAY-0001`) → succeeds; `affiliate_payout_allocations` rows sum exactly to the payout amount; affected commissions' `settled_cents` updated; fully settled commissions flip to `paid`.
7. **[DB]** Verify allocation integrity:
   ```sql
   SELECT p.id, p.amount_cents, coalesce(sum(a.amount_cents),0) allocated
   FROM public.referral_payouts p
   LEFT JOIN public.affiliate_payout_allocations a ON a.payout_id = p.id
   WHERE p.status='paid' GROUP BY p.id;   -- allocated must equal amount_cents for every row
   ```
8. **[UI]** Confirm the affiliate dashboard shows the payout and zeroed/reduced available balance, including any legacy commissions.

## 7. Rollback and recovery **[DB]**

- **Migration fails partway:** each migration is a single transaction — a failure rolls back that file automatically. Re-run the baseline count check to confirm, fix the cause, re-run.
- **String patch no-oped (migrations 5–7):** the migration "succeeds" but the function is unchanged. Detect via the `pg_get_functiondef` checks in section 3; apply the corrected function body manually from the sandbox definition.
- **Migration 8 or 9 misbehaves after apply:** restore the prior function definition from the `pg_get_functiondef` snapshot taken in section 2.
- **Data corruption (should not be possible — all changes are additive):** restore affected tables from the CSV exports in section 2. There is no point-in-time recovery; the CSV exports are the only backup.
- **Stripe test reveals a bug:** no rollback needed — test-mode commissions are isolated by `affiliate_environment='test'` and never affect live balances or payouts. Delete nothing; fix code, retest.
- **Do not** set `operational_verified_at` until every check above passes. If it was set prematurely, clear it: `UPDATE public.referral_programs SET operational_verified_at = NULL WHERE singleton;`

## 8. Remaining blockers before activation

1. All nine migrations applied to production with post-checks passing.
2. Stripe webhook subscribed to all seven affiliate events (test and live).
3. `billing_plan_prices` mappings confirmed for every sellable plan in both environments.
4. Full Test Mode checklist (sections 5–6) passed end-to-end.
5. Only then: set `operational_verified_at` and enable the program in Admin.

## 9. Remaining limitations

- Payouts are manual: external payment + reference recording; no automatic payout provider integration.
- No automatic reconciliation job for missed webhooks (manual retry from Stripe's event log only).
- Multi-currency balances are computed per currency but displayed assuming USD.
- Test-mode commissions are visible to the affiliate but never payable — by design.
