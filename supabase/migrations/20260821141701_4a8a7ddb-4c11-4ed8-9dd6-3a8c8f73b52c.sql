CREATE TABLE public.workspace_ai_keys (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'openai',
  model text NOT NULL DEFAULT 'gpt-4o-mini',
  key_ciphertext text NOT NULL,
  key_last4 text,
  status text NOT NULL DEFAULT 'unverified',
  last_error text,
  verified_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.workspace_ai_keys TO service_role;

ALTER TABLE public.workspace_ai_keys ENABLE ROW LEVEL SECURITY;