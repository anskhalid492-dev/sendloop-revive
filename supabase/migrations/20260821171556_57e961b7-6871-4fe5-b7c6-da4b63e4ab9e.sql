CREATE TABLE IF NOT EXISTS public.unmatched_inbound_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  html TEXT,
  message_id TEXT UNIQUE,
  in_reply_to TEXT,
  reference_ids TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT,
  resolved_conversation_id UUID,
  resolved_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS unmatched_inbound_emails_received_idx
  ON public.unmatched_inbound_emails (received_at DESC);

GRANT ALL ON public.unmatched_inbound_emails TO service_role;
GRANT SELECT ON public.unmatched_inbound_emails TO authenticated;

ALTER TABLE public.unmatched_inbound_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read unmatched inbound" ON public.unmatched_inbound_emails;
CREATE POLICY "Admins read unmatched inbound"
  ON public.unmatched_inbound_emails FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));