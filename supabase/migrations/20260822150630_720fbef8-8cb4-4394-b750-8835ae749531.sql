CREATE TABLE IF NOT EXISTS public.warmup_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  mailbox_provider text,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  notes text,
  sent_count integer NOT NULL DEFAULT 0,
  received_count integer NOT NULL DEFAULT 0,
  bounce_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  last_received_at timestamptz,
  last_bounce_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS warmup_recipients_email_key ON public.warmup_recipients (lower(email));
CREATE INDEX IF NOT EXISTS warmup_recipients_active_idx ON public.warmup_recipients (enabled, status, last_sent_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warmup_recipients TO authenticated;
GRANT ALL ON public.warmup_recipients TO service_role;

ALTER TABLE public.warmup_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage warmup recipients" ON public.warmup_recipients;
CREATE POLICY "Admins manage warmup recipients" ON public.warmup_recipients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS warmup_recipients_set_updated_at ON public.warmup_recipients;
CREATE TRIGGER warmup_recipients_set_updated_at
  BEFORE UPDATE ON public.warmup_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.warmup_jobs ADD COLUMN IF NOT EXISTS pool_recipient_id uuid REFERENCES public.warmup_recipients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS warmup_jobs_pool_recipient_idx ON public.warmup_jobs (pool_recipient_id, created_at DESC);