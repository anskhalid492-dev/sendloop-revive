-- MunchReach — Support satisfaction ratings (production migration)
-- Idempotent: safe to run more than once.
-- Rates the SUPPORT EXPERIENCE for a resolved/closed ticket (never the customer).

CREATE TABLE IF NOT EXISTS public.support_ticket_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.support_ticket_ratings TO authenticated;
GRANT ALL ON public.support_ticket_ratings TO service_role;

ALTER TABLE public.support_ticket_ratings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS support_ticket_ratings_ticket_idx ON public.support_ticket_ratings (ticket_id);
CREATE INDEX IF NOT EXISTS support_ticket_ratings_user_idx ON public.support_ticket_ratings (user_id);
CREATE INDEX IF NOT EXISTS support_ticket_ratings_workspace_idx ON public.support_ticket_ratings (workspace_id);
CREATE INDEX IF NOT EXISTS support_ticket_ratings_rating_idx ON public.support_ticket_ratings (rating);

DROP POLICY IF EXISTS "support_ticket_ratings_select" ON public.support_ticket_ratings;
CREATE POLICY "support_ticket_ratings_select" ON public.support_ticket_ratings
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  );

DROP POLICY IF EXISTS "support_ticket_ratings_insert" ON public.support_ticket_ratings;
CREATE POLICY "support_ticket_ratings_insert" ON public.support_ticket_ratings
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_ratings.ticket_id
        AND t.created_by = auth.uid()
        AND t.status IN ('resolved', 'closed')
    )
  );

DROP POLICY IF EXISTS "support_ticket_ratings_update" ON public.support_ticket_ratings;
CREATE POLICY "support_ticket_ratings_update" ON public.support_ticket_ratings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS support_ticket_ratings_set_updated_at ON public.support_ticket_ratings;
CREATE TRIGGER support_ticket_ratings_set_updated_at
  BEFORE UPDATE ON public.support_ticket_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
