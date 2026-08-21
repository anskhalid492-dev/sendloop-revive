CREATE TABLE IF NOT EXISTS public.billing_provider_secrets (
  provider text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  ciphertext text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, environment)
);
GRANT ALL ON public.billing_provider_secrets TO service_role;
ALTER TABLE public.billing_provider_secrets ENABLE ROW LEVEL SECURITY;