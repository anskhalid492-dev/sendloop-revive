
CREATE TABLE public.site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL UNIQUE,
  title text NOT NULL,
  section text NOT NULL DEFAULT 'marketing',
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','unpublished')),
  seo_title text,
  meta_description text,
  canonical_url text,
  og_title text,
  og_description text,
  og_image_url text,
  robots_index boolean NOT NULL DEFAULT true,
  robots_follow boolean NOT NULL DEFAULT true,
  structured_data jsonb,
  include_in_sitemap boolean NOT NULL DEFAULT true,
  changefreq text NOT NULL DEFAULT 'weekly',
  priority numeric(2,1) NOT NULL DEFAULT 0.7,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.site_nav_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL CHECK (location IN ('header','footer','social')),
  parent_id uuid REFERENCES public.site_nav_items(id) ON DELETE CASCADE,
  group_label text,
  label text NOT NULL,
  href text NOT NULL,
  description text,
  icon text,
  is_external boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_nav_items_location_idx ON public.site_nav_items (location, sort_order);

CREATE TABLE public.site_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path text NOT NULL UNIQUE,
  destination_path text NOT NULL,
  status_code smallint NOT NULL DEFAULT 301 CHECK (status_code IN (301,302)),
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_path <> destination_path)
);

CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_pages TO anon, authenticated;
GRANT SELECT ON public.site_nav_items TO anon, authenticated;
GRANT SELECT ON public.site_redirects TO anon, authenticated;
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_nav_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_redirects TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_pages TO service_role;
GRANT ALL ON public.site_nav_items TO service_role;
GRANT ALL ON public.site_redirects TO service_role;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_nav_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read website pages" ON public.site_pages FOR SELECT USING (true);
CREATE POLICY "Admins manage website pages" ON public.site_pages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read navigation" ON public.site_nav_items FOR SELECT USING (true);
CREATE POLICY "Admins manage navigation" ON public.site_nav_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read redirects" ON public.site_redirects FOR SELECT USING (true);
CREATE POLICY "Admins manage redirects" ON public.site_redirects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read site settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage site settings" ON public.site_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER site_pages_updated_at BEFORE UPDATE ON public.site_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER site_nav_items_updated_at BEFORE UPDATE ON public.site_nav_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER site_redirects_updated_at BEFORE UPDATE ON public.site_redirects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.site_pages (path, title, section, priority, changefreq) VALUES
  ('/', 'Home', 'marketing', 1.0, 'weekly'),
  ('/features', 'Features', 'marketing', 0.9, 'weekly'),
  ('/pricing', 'Pricing', 'marketing', 0.9, 'weekly'),
  ('/about', 'About', 'company', 0.6, 'monthly'),
  ('/contact', 'Contact', 'company', 0.6, 'monthly'),
  ('/customer-reviews', 'Customer Reviews', 'company', 0.7, 'weekly'),
  ('/referral', 'Referral Program', 'company', 0.6, 'monthly'),
  ('/automations', 'Automations', 'product', 0.8, 'weekly'),
  ('/product/campaigns', 'Campaigns', 'product', 0.8, 'weekly'),
  ('/product/unified-inbox', 'Unified Inbox', 'product', 0.8, 'weekly'),
  ('/product/follow-ups', 'Follow-Ups', 'product', 0.8, 'weekly'),
  ('/product/warmup', 'Warmup', 'product', 0.8, 'weekly'),
  ('/product/crm', 'CRM', 'product', 0.8, 'weekly'),
  ('/product/analytics', 'Analytics', 'product', 0.8, 'weekly'),
  ('/product/templates', 'Templates', 'product', 0.8, 'weekly'),
  ('/product/workspaces', 'Workspaces', 'product', 0.8, 'weekly'),
  ('/product/email-accounts', 'Email Accounts', 'product', 0.8, 'weekly'),
  ('/blog', 'Blog', 'resources', 0.9, 'daily'),
  ('/docs', 'Documentation', 'resources', 0.7, 'weekly'),
  ('/api-docs', 'API Documentation', 'resources', 0.6, 'monthly'),
  ('/help-center', 'Help Center', 'resources', 0.7, 'weekly'),
  ('/cold-email-templates', 'Cold Email Templates', 'resources', 0.8, 'weekly'),
  ('/deliverability-guide', 'Deliverability Guide', 'resources', 0.8, 'monthly'),
  ('/integrations', 'Integrations', 'resources', 0.8, 'weekly'),
  ('/privacy', 'Privacy Policy', 'legal', 0.3, 'yearly'),
  ('/terms', 'Terms of Service', 'legal', 0.3, 'yearly'),
  ('/acceptable-use', 'Acceptable Use Policy', 'legal', 0.3, 'yearly');

UPDATE public.site_pages SET robots_index = false, include_in_sitemap = false
  WHERE path IN ('/privacy','/terms','/acceptable-use') AND false;

INSERT INTO public.site_settings (key, value) VALUES
  ('robots', '{"rules":[{"user_agent":"Googlebot","allow":["/"],"disallow":[]},{"user_agent":"Bingbot","allow":["/"],"disallow":[]},{"user_agent":"*","allow":["/"],"disallow":["/admin","/dashboard","/auth","/signin","/signup","/reset-password","/forgot-password","/verify-email","/api/"]}],"sitemap_url":"/sitemap.xml","extra":""}'::jsonb),
  ('footer', '{"tagline":"Send personalized cold emails, automate follow-ups, and manage every reply from one workspace.","copyright":"Sendloop. All rights reserved."}'::jsonb);
