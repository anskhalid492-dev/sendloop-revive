ALTER TABLE public.sending_domains
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_id uuid,
  ADD COLUMN IF NOT EXISTS provider_domain_id text,
  ADD COLUMN IF NOT EXISTS provider_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS provider_error text,
  ADD COLUMN IF NOT EXISTS provider_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS record_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'pending_dns',
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz;

CREATE INDEX IF NOT EXISTS sending_domains_stage_idx ON public.sending_domains (stage);