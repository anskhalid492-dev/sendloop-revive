# Lifetime Starter — unpublished implementation

## Offers
| Offer | One-time USD price | Stored contacts | Monthly initial emails |
|---|---:|---:|---:|
| Lifetime Starter | $29 | 4,000 | 10,000 |
| Existing Lifetime Deal | $99 (existing configured price) | 20,000 (existing configured limit) | 15,000 (unchanged) |

The owner confirmed Starter should have 10,000 monthly emails even though original Lifetime has 15,000. All remaining limits and flags are cloned from the original row, not from the recurring Starter plan. Existing Lifetime's IDs, settings, Stripe mapping, customer assignments and payments are untouched.

## Remaining manual setup — required before activation
1. Review and run `supabase/manual/lifetime-starter.sql` in the **production** database SQL editor. This transaction inserts only the new plan and copied feature rows; it aborts rather than overwrites if Starter already exists. No schema migration is needed. **It has not been applied to any hosted database.** Tool-connected database differs from the hard-pinned production database; applying there would not enable the live offer.
2. In the existing Stripe account, create an active **one-time USD $29.00** price for Lifetime Starter. Do not reuse the existing Lifetime Price ID. Create separate test/live prices if testing both environments.
3. In the unpublished app's **Admin → Billing → Plans & prices**, select Lifetime Starter and save its **Stripe Lifetime Price ID** for the appropriate environment. The editor validates active price/product, non-recurring type, USD and exactly 2,900 cents. Existing Lifetime has its own editor and mapping; neither checkout nor catalogue sync automatically replaces lifetime mappings.
4. Use the existing webhook endpoint `/api/public/billing/stripe`; ensure `checkout.session.completed` and `checkout.session.async_payment_succeeded` are enabled. No new credentials or payment integration is needed.
5. Before any release, verify an explicitly named throwaway account's authenticated selection, save/readback and Stripe **test-mode** payment → verified webhook → correct plan. No real charges or customer-base testing.

**Until step 1, the real preview shows only the original offer because it reads saved billing configuration.** Both-offer layout was exercised with an isolated browser response fixture, not a production insert. Stripe checkout for an unconfigured lifetime price fails closed instead of creating or substituting prices.

## Behavior
- `/lifetime` displays all saved lifetime offers, lowest configured price first, with separate Get Lifetime Access buttons and a detailed billing-config-backed comparison.
- Adds Instantly, Smartlead and lemlist comparison columns and locally managed CDN favicon pointers; reuses existing neutral comparison content, not invented competitor pricing.
- Buttons lead to `/billing?plan=<plan UUID>`. Existing authentication guard carries that target to sign-in; signup/sign-in already preserve the redirect. Billing supports the UUID as well as old slug links.
- Customer Billing shows both lifetime offers, price, contact and email limits before checkout. It uses Stripe payment mode and selected plan's own mapping, not the first available non-Stripe provider.
- Verified webhook reads actual Stripe session line items and checks selected plan, configured price, quantity, currency and base price before lifetime activation. Stored verified retries reuse the same handler. Unpaid/invalid-signature/duplicate events cannot activate Starter.
- Existing shared entitlement layer enforces `max_leads=4000` and `max_emails_monthly=10000`. Monthly allowance remains initial campaign sends only; follow-ups stay unmetered, UTC calendar-month reset semantics stay unchanged. No sending infrastructure changes.
- Missing optional lifetime mapping does not block existing recurring checkout availability; every lifetime checkout validates its own mapping.

## Changed files
- `src/routes/lifetime.tsx`
- `src/components/settings/BillingTab.tsx`
- `src/routes/_authenticated/mranuskhalid/billing.tsx`
- `src/lib/billing/lifetime.ts`
- `src/lib/billing/admin.server.ts`
- `src/lib/billing/customer.server.ts`
- `src/lib/billing/stripe-sync.server.ts`
- `src/lib/billing/providers.server.ts`
- `src/lib/billing/webhook.server.ts`
- `src/lib/billing/lifetime-webhook.server.ts` (new)
- `src/assets/lifetime-{instantly,smartlead,lemlist}.png.asset.json` (new)
- `supabase/manual/lifetime-starter.sql` (new; unapplied)
- Seven `tests/lifetime-*.test.ts` files (new)
- `AGENTS.md`, `roadmap.md`, this report

## Verification
- **34 focused new tests passed**: price, unchanged original, all cloned limits including future columns, feature inclusions/exclusions, separate mappings, no price auto-create, selected-plan payment checkout, 4,000 contact boundary, 10,000 email boundary, paid line-item verification, invalid signatures and duplicates.
- **Full suite: 1,911 tests passed across 201 files.** All provider operations mocked; SQL tested in local in-memory PostgreSQL; no customer writes or real Stripe actions.
- Preview automatic compilation/production-build telemetry: **build OK**. No manual build/typecheck invoked, per project workflow.
- Actual public original-offer button preserved its plan UUID through guest redirect to sign-in.
- Both-offer fixture: desktop 1280px, tablet 768px and mobile 390px showed Starter first, correct values, separate links and no page horizontal overflow; competitor icons rendered. Fixture injected only browser-side data, so it caused an expected SSR/client fixture hydration mismatch, not a production defect.
- **Not verified:** authenticated admin/customer UI save/readback or Stripe test payment and actual webhook delivery; external backend has no scoped authenticated test session available. Production plan insert and Stripe ID remain owner-managed blockers.

Nothing published or deployed.