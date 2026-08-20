CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','critical')),
  audience text NOT NULL DEFAULT 'customer' CHECK (audience IN ('customer','admin','all')),
  starts_at timestamptz,
  ends_at timestamptz,
  dismissible boolean NOT NULL DEFAULT true,
  cta_label text,
  cta_url text,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_announcements TO authenticated;
GRANT ALL ON public.platform_announcements TO service_role;
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements admin manage" ON public.platform_announcements;
CREATE POLICY "announcements admin manage" ON public.platform_announcements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "announcements readable when live" ON public.platform_announcements;
CREATE POLICY "announcements readable when live" ON public.platform_announcements
  FOR SELECT TO authenticated
  USING (
    enabled = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

CREATE TABLE IF NOT EXISTS public.platform_announcement_dismissals (
  announcement_id uuid NOT NULL REFERENCES public.platform_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.platform_announcement_dismissals TO authenticated;
GRANT ALL ON public.platform_announcement_dismissals TO service_role;
ALTER TABLE public.platform_announcement_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own dismissals" ON public.platform_announcement_dismissals;
CREATE POLICY "own dismissals" ON public.platform_announcement_dismissals
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'all' CHECK (environment IN ('all','production','preview')),
  rollout_percentage integer NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  audience text NOT NULL DEFAULT 'customer' CHECK (audience IN ('customer','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_feature_flags TO authenticated;
GRANT ALL ON public.platform_feature_flags TO service_role;
ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flags admin manage" ON public.platform_feature_flags;
CREATE POLICY "flags admin manage" ON public.platform_feature_flags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "flags readable" ON public.platform_feature_flags;
CREATE POLICY "flags readable" ON public.platform_feature_flags
  FOR SELECT TO authenticated
  USING (audience = 'customer');

CREATE OR REPLACE FUNCTION public.public_platform_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'branding', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'system.branding'), '{}'::jsonb),
    'consent', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'system.consent'), '{}'::jsonb),
    'legal', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'system.legal'), '{}'::jsonb),
    'localization', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'system.localization'), '{}'::jsonb),
    'api', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'system.api'), '{}'::jsonb),
    'limits', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'system.limits'), '{}'::jsonb),
    'general', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'system.general'), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.public_platform_config() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS platform_announcements_updated_at ON public.platform_announcements;
CREATE TRIGGER platform_announcements_updated_at
  BEFORE UPDATE ON public.platform_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS platform_feature_flags_updated_at ON public.platform_feature_flags;
CREATE TRIGGER platform_feature_flags_updated_at
  BEFORE UPDATE ON public.platform_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();