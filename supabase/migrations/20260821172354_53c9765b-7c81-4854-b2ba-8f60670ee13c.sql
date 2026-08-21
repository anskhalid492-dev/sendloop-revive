CREATE TABLE IF NOT EXISTS public.provider_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.email_providers(id) ON DELETE CASCADE,
  operation text NOT NULL,
  ok boolean NOT NULL,
  http_status integer,
  error_code text,
  message text,
  domain text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_health_events TO authenticated;
GRANT ALL ON public.provider_health_events TO service_role;

ALTER TABLE public.provider_health_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read provider health events"
ON public.provider_health_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS provider_health_events_provider_time_idx
  ON public.provider_health_events (provider_id, occurred_at DESC);

ALTER TABLE public.email_providers
  ADD COLUMN IF NOT EXISTS health_reason text,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_http_status integer;
