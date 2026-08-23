-- 1. Append-only staff activity log ------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_audit_log_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END; $$;

DROP TRIGGER IF EXISTS admin_audit_log_no_mutate ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_no_mutate
BEFORE UPDATE OR DELETE ON public.admin_audit_log
FOR EACH ROW EXECUTE FUNCTION public.admin_audit_log_append_only();

REVOKE ALL ON public.admin_audit_log FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.admin_audit_log FROM authenticated;
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;

DROP POLICY IF EXISTS "Staff can append admin audit log" ON public.admin_audit_log;
CREATE POLICY "Staff can append admin audit log" ON public.admin_audit_log
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support'));

-- 2. Granular admin permissions ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);
GRANT SELECT ON public.admin_permission_grants TO authenticated;
GRANT ALL ON public.admin_permission_grants TO service_role;
ALTER TABLE public.admin_permission_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read permission grants" ON public.admin_permission_grants;
CREATE POLICY "Admins read permission grants" ON public.admin_permission_grants
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.admin_permission_grants g
        WHERE g.user_id = _user_id AND g.permission = _permission
      );
$$;
REVOKE ALL ON FUNCTION public.has_admin_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(uuid, text) TO authenticated, service_role;

-- 3. Admin security events (logins, MFA, revocations) ---------------------------
CREATE TABLE IF NOT EXISTS public.admin_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  event_type text NOT NULL,
  result text NOT NULL DEFAULT 'success',
  ip text,
  user_agent text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_security_events_created_idx ON public.admin_security_events (created_at DESC);
GRANT SELECT ON public.admin_security_events TO authenticated;
GRANT ALL ON public.admin_security_events TO service_role;
ALTER TABLE public.admin_security_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read security events" ON public.admin_security_events;
CREATE POLICY "Admins read security events" ON public.admin_security_events
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_security_events_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'admin_security_events is append-only';
END; $$;
DROP TRIGGER IF EXISTS admin_security_events_no_mutate ON public.admin_security_events;
CREATE TRIGGER admin_security_events_no_mutate
BEFORE UPDATE OR DELETE ON public.admin_security_events
FOR EACH ROW EXECUTE FUNCTION public.admin_security_events_append_only();

-- 4. Admin session registry (revocable) -----------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  ip text,
  user_agent text,
  aal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, session_id)
);
CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON public.admin_sessions (user_id, last_seen_at DESC);
GRANT SELECT ON public.admin_sessions TO authenticated;
GRANT ALL ON public.admin_sessions TO service_role;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read sessions" ON public.admin_sessions;
CREATE POLICY "Admins read sessions" ON public.admin_sessions
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

-- 5. Server-side rate limiting --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.admin_rate_limits TO service_role;
ALTER TABLE public.admin_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_rate_limit_hit(_bucket text, _limit integer, _window_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.admin_rate_limits;
BEGIN
  INSERT INTO public.admin_rate_limits AS r (bucket, window_start, hits)
  VALUES (_bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE
    SET hits = CASE WHEN r.window_start < now() - make_interval(secs => _window_seconds) THEN 1 ELSE r.hits + 1 END,
        window_start = CASE WHEN r.window_start < now() - make_interval(secs => _window_seconds) THEN now() ELSE r.window_start END
  RETURNING * INTO _row;

  RETURN jsonb_build_object(
    'allowed', _row.hits <= _limit,
    'hits', _row.hits,
    'limit', _limit,
    'retry_after_seconds', GREATEST(0, _window_seconds - EXTRACT(EPOCH FROM (now() - _row.window_start))::int)
  );
END; $$;
REVOKE ALL ON FUNCTION public.admin_rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rate_limit_hit(text, integer, integer) TO service_role;