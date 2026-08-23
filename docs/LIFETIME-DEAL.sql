-- MunchReach Lifetime Deal — production schema + plan seed.
--
-- Run this ONCE against the production Supabase project (rihgzkofoxcjljlbvbya)
-- from the SQL editor. It is idempotent and safe to re-run.
--
-- After running it, open Admin → Billing → "Sync Stripe catalogue" so the
-- one-time Stripe price is created and mapped in billing_plan_prices.

-- 1. One-time interval for lifetime purchases.
ALTER TYPE billing_interval ADD VALUE IF NOT EXISTS 'lifetime';

-- 2. Lifetime columns on plans.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS one_time_price integer,
  ADD COLUMN IF NOT EXISTS compare_at_price integer,
  ADD COLUMN IF NOT EXISTS public_on_pricing_page boolean NOT NULL DEFAULT true;

-- 3. The Lifetime Deal plan itself (hidden from the public pricing page).
INSERT INTO public.plans (
  name, slug, description, tagline, sort_order,
  monthly_price, yearly_price,
  billing_type, one_time_price, compare_at_price, public_on_pricing_page,
  is_active, is_popular, is_enterprise,
  max_workspaces, max_users, max_leads, max_campaigns,
  max_emails_monthly, max_emails_daily, max_warmup_daily, max_sending_accounts,
  warmup_enabled, unified_inbox_enabled, analytics_enabled, api_access
) VALUES (
  'Lifetime Deal', 'lifetime',
  'One-time payment for lifetime access: 10,000 emails a month and 15,000 stored leads.',
  'Pay once, send forever', 999,
  0, 0,
  'lifetime', 13900, 56400, false,
  true, false, false,
  2, 2, 15000, NULL,
  10000, 10000, 500, 10,
  true, true, true, true
)
ON CONFLICT (slug) DO UPDATE SET
  billing_type = EXCLUDED.billing_type,
  one_time_price = EXCLUDED.one_time_price,
  compare_at_price = EXCLUDED.compare_at_price,
  public_on_pricing_page = EXCLUDED.public_on_pricing_page,
  max_leads = EXCLUDED.max_leads,
  max_emails_monthly = EXCLUDED.max_emails_monthly,
  max_emails_daily = EXCLUDED.max_emails_daily,
  max_warmup_daily = EXCLUDED.max_warmup_daily,
  max_sending_accounts = EXCLUDED.max_sending_accounts,
  is_active = true,
  updated_at = now();
