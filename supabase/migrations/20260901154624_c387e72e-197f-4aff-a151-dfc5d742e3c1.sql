-- Separate provider permissions for customer vs admin/system email.
-- Safe to re-run.
ALTER TABLE public.email_providers
  ADD COLUMN IF NOT EXISTS customer_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS system_enabled boolean NOT NULL DEFAULT true;

UPDATE public.email_providers
SET customer_enabled = is_enabled,
    system_enabled = is_enabled
WHERE customer_enabled IS DISTINCT FROM is_enabled
   OR system_enabled IS DISTINCT FROM is_enabled;

COMMENT ON COLUMN public.email_providers.customer_enabled IS 'Provider may be selected for customer (campaign) email sending.';
COMMENT ON COLUMN public.email_providers.system_enabled IS 'Provider may be selected for admin/system transactional email sending.';

NOTIFY pgrst, 'reload schema';