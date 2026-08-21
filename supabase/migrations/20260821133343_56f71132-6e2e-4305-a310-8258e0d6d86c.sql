CREATE TABLE public.site_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_faqs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_faqs TO authenticated;
GRANT ALL ON public.site_faqs TO service_role;

ALTER TABLE public.site_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published FAQs are public" ON public.site_faqs
  FOR SELECT TO anon, authenticated USING (published = true);

CREATE POLICY "Admins can read every FAQ" ON public.site_faqs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert FAQs" ON public.site_faqs
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update FAQs" ON public.site_faqs
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete FAQs" ON public.site_faqs
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX site_faqs_page_idx ON public.site_faqs (page_slug, sort_order);

CREATE TRIGGER site_faqs_updated_at BEFORE UPDATE ON public.site_faqs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();