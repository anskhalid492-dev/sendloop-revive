DROP POLICY IF EXISTS "workspace logos readable by members" ON storage.objects;
CREATE POLICY "workspace logos readable by members" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "workspace logos writable by admins" ON storage.objects;
CREATE POLICY "workspace logos writable by admins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-logos'
    AND public.has_workspace_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  );

DROP POLICY IF EXISTS "workspace logos updatable by admins" ON storage.objects;
CREATE POLICY "workspace logos updatable by admins" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND public.has_workspace_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  );

DROP POLICY IF EXISTS "workspace logos deletable by admins" ON storage.objects;
CREATE POLICY "workspace logos deletable by admins" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND public.has_workspace_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  );