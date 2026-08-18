INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'forexdatabases01@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

CREATE TABLE public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  avatar_url text,
  company_logo_url text,
  testimonial text NOT NULL,
  result text,
  pages text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.testimonials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.testimonials TO authenticated;
GRANT ALL ON public.testimonials TO service_role;

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active testimonials are public" ON public.testimonials
FOR SELECT USING (active = true);

CREATE POLICY "Admins can read all testimonials" ON public.testimonials
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert testimonials" ON public.testimonials
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update testimonials" ON public.testimonials
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete testimonials" ON public.testimonials
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER testimonials_updated_at BEFORE UPDATE ON public.testimonials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.testimonials (name, role, company, testimonial, result, pages, featured, display_order) VALUES
('Placeholder — replace in admin', 'Founder', 'Example Co', 'Sendloop simplified our outbound workflow. Campaigns, follow-ups and replies all live in one workspace now.', '+42% positive replies', ARRAY['home','campaigns','follow-ups','unified-inbox','warmup','crm','analytics','workspaces','templates'], true, 1),
('Placeholder — replace in admin', 'Head of Growth', 'Example Labs', 'We stopped babysitting mailboxes. Warmup and sending are handled for us, so the team only works replies.', '3x meetings booked', ARRAY['home','warmup','unified-inbox','analytics'], false, 2),
('Placeholder — replace in admin', 'Agency Owner', 'Example Agency', 'Running eight client workspaces from one login is the reason we switched. Reporting takes minutes, not days.', '8 client workspaces', ARRAY['home','workspaces','crm','campaigns','templates','follow-ups'], false, 3);