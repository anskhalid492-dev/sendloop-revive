-- ============ 1. LEAD RETENTION ============
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz;

UPDATE public.leads SET retention_expires_at = created_at + interval '60 days'
  WHERE retention_expires_at IS NULL;

ALTER TABLE public.leads
  ALTER COLUMN retention_expires_at SET DEFAULT (now() + interval '60 days'),
  ALTER COLUMN retention_expires_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_lead_retention()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.retention_expires_at := COALESCE(NEW.created_at, now()) + interval '60 days';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_set_retention ON public.leads;
CREATE TRIGGER leads_set_retention
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_retention();

CREATE INDEX IF NOT EXISTS leads_retention_idx ON public.leads (retention_expires_at);

-- Preserve campaign history when a lead is purged.
ALTER TABLE public.campaign_messages ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE public.campaign_messages DROP CONSTRAINT IF EXISTS campaign_messages_lead_id_fkey;
ALTER TABLE public.campaign_messages
  ADD CONSTRAINT campaign_messages_lead_id_fkey FOREIGN KEY (lead_id)
  REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_replies ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE public.campaign_replies DROP CONSTRAINT IF EXISTS campaign_replies_lead_id_fkey;
ALTER TABLE public.campaign_replies
  ADD CONSTRAINT campaign_replies_lead_id_fkey FOREIGN KEY (lead_id)
  REFERENCES public.leads(id) ON DELETE SET NULL;

-- Cleanup log
CREATE TABLE IF NOT EXISTS public.lead_retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  deleted_count integer NOT NULL DEFAULT 0,
  batches integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lead_retention_runs TO authenticated;
GRANT ALL ON public.lead_retention_runs TO service_role;
ALTER TABLE public.lead_retention_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read lead retention runs" ON public.lead_retention_runs;
CREATE POLICY "Admins read lead retention runs" ON public.lead_retention_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS lead_retention_runs_started_idx
  ON public.lead_retention_runs (started_at DESC);

CREATE OR REPLACE FUNCTION public.run_lead_retention_cleanup(
  _batch_size integer DEFAULT 500,
  _max_batches integer DEFAULT 40
)
RETURNS TABLE(workspace_id uuid, deleted_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws record;
  removed integer;
  total integer;
  loops integer;
  started timestamptz;
BEGIN
  FOR ws IN
    SELECT l.workspace_id AS id
    FROM public.leads l
    WHERE l.retention_expires_at <= now()
    GROUP BY l.workspace_id
  LOOP
    started := now();
    total := 0;
    loops := 0;
    BEGIN
      LOOP
        EXIT WHEN loops >= _max_batches;
        WITH doomed AS (
          SELECT id FROM public.leads
          WHERE workspace_id = ws.id AND retention_expires_at <= now()
          ORDER BY retention_expires_at
          LIMIT _batch_size
        )
        DELETE FROM public.leads l USING doomed d
        WHERE l.id = d.id AND l.workspace_id = ws.id;
        GET DIAGNOSTICS removed = ROW_COUNT;
        total := total + removed;
        loops := loops + 1;
        EXIT WHEN removed = 0;
      END LOOP;

      INSERT INTO public.lead_retention_runs
        (workspace_id, deleted_count, batches, status, started_at, finished_at)
      VALUES (ws.id, total, loops, 'success', started, now());
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.lead_retention_runs
        (workspace_id, deleted_count, batches, status, error, started_at, finished_at)
      VALUES (ws.id, total, loops, 'error', SQLERRM, started, now());
    END;

    workspace_id := ws.id;
    deleted_count := total;
    RETURN NEXT;
  END LOOP;

  IF NOT FOUND THEN
    INSERT INTO public.lead_retention_runs (workspace_id, deleted_count, batches, status)
    VALUES (NULL, 0, 0, 'idle');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_lead_retention_cleanup(integer, integer) FROM PUBLIC, anon, authenticated;

-- ============ 2. BLOG PUBLISHING ============
CREATE TABLE IF NOT EXISTS public.blog_post_slugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blog_post_slugs TO anon, authenticated;
GRANT ALL ON public.blog_post_slugs TO service_role;
ALTER TABLE public.blog_post_slugs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Slug history is public" ON public.blog_post_slugs;
CREATE POLICY "Slug history is public" ON public.blog_post_slugs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage slug history" ON public.blog_post_slugs;
CREATE POLICY "Admins manage slug history" ON public.blog_post_slugs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.record_blog_slug_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    DELETE FROM public.blog_post_slugs WHERE slug = NEW.slug;
    INSERT INTO public.blog_post_slugs (post_id, slug)
    VALUES (OLD.id, OLD.slug)
    ON CONFLICT (slug) DO UPDATE SET post_id = EXCLUDED.post_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blog_posts_slug_history ON public.blog_posts;
CREATE TRIGGER blog_posts_slug_history
  AFTER UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.record_blog_slug_change();

CREATE OR REPLACE FUNCTION public.publish_due_blog_posts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.blog_posts
  SET status = 'published'
  WHERE status = 'scheduled'
    AND published_at IS NOT NULL
    AND published_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_due_blog_posts() FROM PUBLIC, anon, authenticated;