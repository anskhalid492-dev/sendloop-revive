-- Subprocessors (admin managed, public reads published rows)
CREATE TABLE public.subprocessors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  service text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  data_processed text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subprocessors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subprocessors TO authenticated;
GRANT ALL ON public.subprocessors TO service_role;
ALTER TABLE public.subprocessors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subprocessors_public_read" ON public.subprocessors FOR SELECT USING (published = true);
CREATE POLICY "subprocessors_admin_all" ON public.subprocessors FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER subprocessors_updated_at BEFORE UPDATE ON public.subprocessors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- User guide articles
CREATE TABLE public.guide_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'Getting Started',
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.guide_articles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_articles TO authenticated;
GRANT ALL ON public.guide_articles TO service_role;
ALTER TABLE public.guide_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guide_articles_public_read" ON public.guide_articles FOR SELECT USING (published = true);
CREATE POLICY "guide_articles_admin_all" ON public.guide_articles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER guide_articles_updated_at BEFORE UPDATE ON public.guide_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Service alerts
CREATE TABLE public.service_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL DEFAULT 'information',
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  resolved_at timestamptz,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_alerts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_alerts TO authenticated;
GRANT ALL ON public.service_alerts TO service_role;
ALTER TABLE public.service_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_alerts_public_read" ON public.service_alerts FOR SELECT USING (published = true);
CREATE POLICY "service_alerts_admin_all" ON public.service_alerts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER service_alerts_updated_at BEFORE UPDATE ON public.service_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Privacy / data removal requests
CREATE TABLE public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company text,
  request_type text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  admin_notes text,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.privacy_requests TO authenticated;
GRANT ALL ON public.privacy_requests TO service_role;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "privacy_requests_admin_all" ON public.privacy_requests FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER privacy_requests_updated_at BEFORE UPDATE ON public.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Allow guest-submitted support tickets
ALTER TABLE public.support_tickets ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS contact_workspace text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';