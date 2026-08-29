CREATE TABLE IF NOT EXISTS public.campaign_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_id uuid,
  email text NOT NULL,
  source text NOT NULL DEFAULT 'email_link',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_unsubscribes_campaign_email_idx
  ON public.campaign_unsubscribes (campaign_id, email);
CREATE INDEX IF NOT EXISTS campaign_unsubscribes_workspace_idx
  ON public.campaign_unsubscribes (workspace_id, created_at DESC);

GRANT SELECT ON public.campaign_unsubscribes TO authenticated;
GRANT ALL ON public.campaign_unsubscribes TO service_role;

ALTER TABLE public.campaign_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read workspace unsubscribes"
  ON public.campaign_unsubscribes FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER campaign_unsubscribes_set_updated_at
  BEFORE UPDATE ON public.campaign_unsubscribes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.admin_unsubscribe_stats(_days integer DEFAULT 30)
RETURNS TABLE (
  campaign_id uuid,
  campaign_name text,
  workspace_id uuid,
  workspace_name text,
  one_click bigint,
  list_unsubscribe bigint,
  email_link bigint,
  total bigint,
  last_unsubscribed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.campaign_id,
    c.name AS campaign_name,
    u.workspace_id,
    w.name AS workspace_name,
    count(*) FILTER (WHERE u.source = 'one_click') AS one_click,
    count(*) FILTER (WHERE u.source = 'list_unsubscribe') AS list_unsubscribe,
    count(*) FILTER (WHERE u.source NOT IN ('one_click','list_unsubscribe')) AS email_link,
    count(*) AS total,
    max(u.created_at) AS last_unsubscribed_at
  FROM public.campaign_unsubscribes u
  LEFT JOIN public.campaigns c ON c.id = u.campaign_id
  LEFT JOIN public.workspaces w ON w.id = u.workspace_id
  WHERE public.has_role(auth.uid(), 'admin')
    AND u.created_at >= now() - make_interval(days => greatest(coalesce(_days, 30), 1))
  GROUP BY u.campaign_id, c.name, u.workspace_id, w.name
  ORDER BY count(*) DESC
$$;

REVOKE ALL ON FUNCTION public.admin_unsubscribe_stats(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_unsubscribe_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unsubscribe_stats(integer) TO service_role;