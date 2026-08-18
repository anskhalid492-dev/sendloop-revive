-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'support', 'user');
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'campaign_manager', 'inbox_manager', 'analyst', 'client_viewer');

-- UPDATED_AT HELPER
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- USER ROLES (platform level)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- WORKSPACES
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- WORKSPACE MEMBERS
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'client_viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER HELPERS (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id AND role = ANY(_roles));
$$;

-- WORKSPACE POLICIES
CREATE POLICY "workspaces_select_member" ON public.workspaces FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_member(id, auth.uid()));
CREATE POLICY "workspaces_insert_own" ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "workspaces_update_admin" ON public.workspaces FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_workspace_role(id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (owner_id = auth.uid() OR public.has_workspace_role(id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY "workspaces_delete_owner" ON public.workspaces FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- MEMBER POLICIES
CREATE POLICY "members_select_same_workspace" ON public.workspace_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members_insert_admin" ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  );
CREATE POLICY "members_update_admin" ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY "members_delete_admin" ON public.workspace_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

-- AUTO PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();