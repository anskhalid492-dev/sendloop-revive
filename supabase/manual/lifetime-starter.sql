-- Run manually against the production database after review. Additive DATA only.
-- No existing plan, Stripe mapping, customer or payment is updated.
BEGIN;
DO $$
DECLARE original public.plans; starter public.plans;
BEGIN
  SELECT * INTO original FROM public.plans WHERE slug = 'lifetime' FOR SHARE;
  IF original.id IS NULL OR original.billing_type <> 'lifetime' THEN
    RAISE EXCEPTION 'Existing Lifetime plan missing; no changes made';
  END IF;
  IF EXISTS (SELECT 1 FROM public.plans WHERE slug = 'lifetime-starter') THEN
    RAISE EXCEPTION 'Lifetime Starter already exists; review it rather than overwriting';
  END IF;
  -- Copy every existing limit and flag, including optional/future columns.
  starter := jsonb_populate_record(NULL::public.plans, to_jsonb(original) || jsonb_build_object(
    'id', gen_random_uuid(), 'name', 'Lifetime Starter', 'slug', 'lifetime-starter',
    'one_time_price', 2900, 'max_leads', 4000, 'max_emails_monthly', 10000,
    'compare_at_price', NULL, 'description', 'Lifetime access with 4,000 stored contacts and 10,000 emails per month.',
    'tagline', 'Pay once. Start growing.', 'created_at', now(), 'updated_at', now()
  ));
  INSERT INTO public.plans SELECT (starter).*;
  -- Feature flags and limitations are copied exactly; display labels use plan-row limits in the UI.
  INSERT INTO public.plan_features (plan_id, category, name, included, value, sort_order, feature_key)
  SELECT starter.id, category, name, included, value, sort_order, feature_key
  FROM public.plan_features WHERE plan_id = original.id;
END $$;
COMMIT;
-- Configure a distinct $29 USD one-time Stripe price in Admin > Billing > Plans & prices.
-- No Stripe Price IDs are seeded or copied from the original plan.