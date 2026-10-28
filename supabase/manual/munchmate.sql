-- MunchMate AI support assistant — additive, owner-run on production.
-- No existing rows are modified or deleted. Safe to re-run.

-- 1. Link AI conversations to the EXISTING support tickets.
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS ai_conversation jsonb;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS ticket_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_ticket_ref_key
  ON public.support_tickets (ticket_ref) WHERE ticket_ref IS NOT NULL;

-- 2. Approved public knowledge only. Never customer data.
CREATE TABLE IF NOT EXISTS public.munchmate_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('help','blog','faq','pricing','page','custom')),
  source_key text NOT NULL UNIQUE,
  title text NOT NULL,
  url text,
  content text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.munchmate_knowledge TO authenticated;
GRANT ALL ON public.munchmate_knowledge TO service_role;

ALTER TABLE public.munchmate_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "munchmate_knowledge_admin_all" ON public.munchmate_knowledge;
CREATE POLICY "munchmate_knowledge_admin_all" ON public.munchmate_knowledge
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Verify:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'support_tickets' AND column_name IN ('ai_conversation','ticket_ref');
-- SELECT count(*) FROM public.munchmate_knowledge;
