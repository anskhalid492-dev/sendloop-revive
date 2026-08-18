CREATE POLICY "profiles_select_platform_admin" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "workspaces_select_platform_admin" ON public.workspaces
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "members_select_platform_admin" ON public.workspace_members
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "campaigns_select_platform_admin" ON public.campaigns
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));