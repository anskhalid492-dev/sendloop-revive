-- Manual send exactly-once protection (Compose and Reply).
-- Run once against the live production database. Additive and safe to re-run:
-- creates one new table, grants it to backend code only, and changes nothing else.

CREATE TABLE IF NOT EXISTS public.manual_send_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  send_key text NOT NULL,
  kind text NOT NULL DEFAULT 'compose',
  status text NOT NULL DEFAULT 'in_progress',
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, send_key)
);

GRANT ALL ON public.manual_send_claims TO service_role;

ALTER TABLE public.manual_send_claims ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS manual_send_claims_created_idx
  ON public.manual_send_claims (created_at);

DROP TRIGGER IF EXISTS manual_send_claims_set_updated_at ON public.manual_send_claims;
CREATE TRIGGER manual_send_claims_set_updated_at
  BEFORE UPDATE ON public.manual_send_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
