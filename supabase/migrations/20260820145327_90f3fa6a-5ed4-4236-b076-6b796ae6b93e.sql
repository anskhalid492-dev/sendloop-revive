DROP POLICY IF EXISTS "Anyone can read blog media objects" ON storage.objects;
CREATE POLICY "Anyone can read blog media objects" ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-media');