CREATE TABLE IF NOT EXISTS public.blog_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  storage_path TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  folder TEXT NOT NULL DEFAULT 'library',
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blog_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_media TO authenticated;
GRANT ALL ON public.blog_media TO service_role;

ALTER TABLE public.blog_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Media is public" ON public.blog_media;
CREATE POLICY "Media is public" ON public.blog_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage media" ON public.blog_media;
CREATE POLICY "Admins manage media" ON public.blog_media FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS blog_media_created_idx ON public.blog_media (created_at DESC);

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'markdown';
ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_content_format_check;
ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_content_format_check CHECK (content_format IN ('markdown','html'));

DROP POLICY IF EXISTS "Admins read blog media objects" ON storage.objects;
CREATE POLICY "Admins read blog media objects" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins upload blog media" ON storage.objects;
CREATE POLICY "Admins upload blog media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update blog media" ON storage.objects;
CREATE POLICY "Admins update blog media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete blog media" ON storage.objects;
CREATE POLICY "Admins delete blog media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'admin'));