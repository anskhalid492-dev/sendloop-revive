ALTER TYPE billing_interval ADD VALUE IF NOT EXISTS 'lifetime';

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS one_time_price integer,
  ADD COLUMN IF NOT EXISTS compare_at_price integer,
  ADD COLUMN IF NOT EXISTS public_on_pricing_page boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plans_billing_type_chk'
  ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_billing_type_chk CHECK (billing_type IN ('recurring','lifetime'));
  END IF;
END $$;