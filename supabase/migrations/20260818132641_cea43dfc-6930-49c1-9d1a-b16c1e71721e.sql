ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS signature_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS signature_detail text,
  ADD COLUMN IF NOT EXISTS routing_token text,
  ADD COLUMN IF NOT EXISTS token_status text,
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS email_events_token_status_idx ON public.email_events (token_status) WHERE token_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_events_created_at_idx ON public.email_events (created_at DESC);