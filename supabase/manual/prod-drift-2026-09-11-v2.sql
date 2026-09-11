-- MunchReach production drift fix v2 - CORRECTED ORDER, fully idempotent.
-- Replaces prod-drift-2026-09-11.sql. Safe to run from scratch even if v1 partially ran.
-- Additive only: no DROP TABLE, no DELETE, no data loss.

BEGIN;

-- 1) Missing columns on existing tables
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS paused_at timestamp with time zone;
ALTER TABLE public.sending_accounts ADD COLUMN IF NOT EXISTS paused_at timestamp with time zone;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS positive_reply_notifications boolean DEFAULT true NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS pause_reason text;
ALTER TABLE public.campaign_messages ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE public.sending_accounts ADD COLUMN IF NOT EXISTS pause_reason text;

-- 2) Missing tables (created BEFORE anything that references them)
CREATE TABLE IF NOT EXISTS public.admin_permission_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    permission text NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.admin_rate_limits (
    bucket text NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    hits integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.admin_security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text,
    event_type text NOT NULL,
    result text DEFAULT 'success'::text NOT NULL,
    ip text,
    user_agent text,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id text NOT NULL,
    ip text,
    user_agent text,
    aal text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by uuid
);
CREATE TABLE IF NOT EXISTS public.api_idempotency_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    api_key_id uuid,
    idempotency_key text NOT NULL,
    endpoint text NOT NULL,
    request_fingerprint text NOT NULL,
    status_code integer,
    response_body jsonb,
    state text DEFAULT 'in_progress'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.api_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    api_key_id uuid,
    kind text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    total integer,
    result jsonb,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    key_hash text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    expires_at timestamp with time zone,
    rate_limit_per_minute integer DEFAULT 120 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.api_rate_counters (
    api_key_id uuid NOT NULL,
    window_start timestamp with time zone NOT NULL,
    request_count integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.campaign_unsubscribes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid,
    recipient_id uuid,
    email text NOT NULL,
    source text DEFAULT 'email_link'::text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sending_domain_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    domain_id uuid NOT NULL,
    provider_id uuid,
    provider_type text,
    provider_region text,
    tracking_enabled boolean DEFAULT false NOT NULL,
    custom_tracking_enabled boolean DEFAULT false NOT NULL,
    tracking_status text DEFAULT 'pending'::text NOT NULL,
    tracking_hostname text,
    provider_tracking_identifier text,
    fingerprint text DEFAULT ''::text NOT NULL,
    records jsonb DEFAULT '[]'::jsonb NOT NULL,
    verified_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    endpoint_id uuid NOT NULL,
    event_type text NOT NULL,
    event_id text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 6 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_attempt_at timestamp with time zone,
    response_status integer,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    url text NOT NULL,
    description text,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    secret_hash text NOT NULL,
    secret_ciphertext text,
    created_by uuid,
    last_delivery_at timestamp with time zone,
    last_delivery_status text,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 3) Primary keys and unique constraints
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_permission_grants
    ADD CONSTRAINT admin_permission_grants_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_permission_grants
    ADD CONSTRAINT admin_permission_grants_user_id_permission_key UNIQUE (user_id, permission);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_rate_limits
    ADD CONSTRAINT admin_rate_limits_pkey PRIMARY KEY (bucket);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_security_events
    ADD CONSTRAINT admin_security_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_user_id_session_id_key UNIQUE (user_id, session_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_workspace_id_endpoint_idempotency_key_key UNIQUE (workspace_id, endpoint, idempotency_key);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_jobs
    ADD CONSTRAINT api_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_rate_counters
    ADD CONSTRAINT api_rate_counters_pkey PRIMARY KEY (api_key_id, window_start);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.campaign_unsubscribes
    ADD CONSTRAINT campaign_unsubscribes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.sending_domain_tracking
    ADD CONSTRAINT sending_domain_tracking_domain_id_key UNIQUE (domain_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.sending_domain_tracking
    ADD CONSTRAINT sending_domain_tracking_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_endpoint_id_event_id_key UNIQUE (endpoint_id, event_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;

-- 4) Foreign keys
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_permission_grants
    ADD CONSTRAINT admin_permission_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_permission_grants
    ADD CONSTRAINT admin_permission_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_security_events
    ADD CONSTRAINT admin_security_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_jobs
    ADD CONSTRAINT api_jobs_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_jobs
    ADD CONSTRAINT api_jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.api_rate_counters
    ADD CONSTRAINT api_rate_counters_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.campaign_unsubscribes
    ADD CONSTRAINT campaign_unsubscribes_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.campaign_unsubscribes
    ADD CONSTRAINT campaign_unsubscribes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.sending_domain_tracking
    ADD CONSTRAINT sending_domain_tracking_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.sending_domains(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.sending_domain_tracking
    ADD CONSTRAINT sending_domain_tracking_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_endpoint_id_fkey FOREIGN KEY (endpoint_id) REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;
DO $mig$ BEGIN
  ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $mig$;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS admin_security_events_created_idx ON public.admin_security_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON public.admin_sessions USING btree (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS api_idempotency_created_idx ON public.api_idempotency_keys USING btree (created_at);
CREATE INDEX IF NOT EXISTS api_jobs_status_idx ON public.api_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS api_jobs_workspace_idx ON public.api_jobs USING btree (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_keys_prefix_idx ON public.api_keys USING btree (prefix);
CREATE INDEX IF NOT EXISTS api_keys_workspace_idx ON public.api_keys USING btree (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_unsubscribes_campaign_email_idx ON public.campaign_unsubscribes USING btree (campaign_id, email);
CREATE INDEX IF NOT EXISTS campaign_unsubscribes_workspace_idx ON public.campaign_unsubscribes USING btree (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sending_domain_tracking_workspace_idx ON public.sending_domain_tracking USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx ON public.webhook_deliveries USING btree (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS webhook_deliveries_workspace_idx ON public.webhook_deliveries USING btree (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_endpoints_workspace_idx ON public.webhook_endpoints USING btree (workspace_id);

-- 6) Functions
CREATE OR REPLACE FUNCTION public.admin_audit_log_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END; $function$;
CREATE OR REPLACE FUNCTION public.admin_rate_limit_hit(_bucket text, _limit integer, _window_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;
CREATE OR REPLACE FUNCTION public.admin_security_events_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'admin_security_events is append-only';
END; $function$;
CREATE OR REPLACE FUNCTION public.api_rate_limit_hit(_api_key_id uuid, _window_start timestamp with time zone, _limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _count integer;
BEGIN
  INSERT INTO public.api_rate_counters(api_key_id, window_start, request_count)
  VALUES (_api_key_id, _window_start, 1)
  ON CONFLICT (api_key_id, window_start)
  DO UPDATE SET request_count = public.api_rate_counters.request_count + 1
  RETURNING request_count INTO _count;

  DELETE FROM public.api_rate_counters
  WHERE api_key_id = _api_key_id AND window_start < _window_start - interval '10 minutes';

  RETURN _count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.admin_permission_grants g
        WHERE g.user_id = _user_id AND g.permission = _permission
      );
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 7) Triggers
DROP TRIGGER IF EXISTS admin_security_events_no_mutate ON public.admin_security_events;
CREATE TRIGGER admin_security_events_no_mutate BEFORE DELETE OR UPDATE ON public.admin_security_events FOR EACH ROW EXECUTE FUNCTION public.admin_security_events_append_only();
DROP TRIGGER IF EXISTS api_idempotency_set_updated_at ON public.api_idempotency_keys;
CREATE TRIGGER api_idempotency_set_updated_at BEFORE UPDATE ON public.api_idempotency_keys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS api_jobs_set_updated_at ON public.api_jobs;
CREATE TRIGGER api_jobs_set_updated_at BEFORE UPDATE ON public.api_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS api_keys_set_updated_at ON public.api_keys;
CREATE TRIGGER api_keys_set_updated_at BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS campaign_unsubscribes_set_updated_at ON public.campaign_unsubscribes;
CREATE TRIGGER campaign_unsubscribes_set_updated_at BEFORE UPDATE ON public.campaign_unsubscribes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_sending_domain_tracking_updated_at ON public.sending_domain_tracking;
CREATE TRIGGER set_sending_domain_tracking_updated_at BEFORE UPDATE ON public.sending_domain_tracking FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS webhook_deliveries_set_updated_at ON public.webhook_deliveries;
CREATE TRIGGER webhook_deliveries_set_updated_at BEFORE UPDATE ON public.webhook_deliveries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS webhook_endpoints_set_updated_at ON public.webhook_endpoints;
CREATE TRIGGER webhook_endpoints_set_updated_at BEFORE UPDATE ON public.webhook_endpoints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8) Grants
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_permission_grants TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_permission_grants TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_permission_grants TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_rate_limits TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_rate_limits TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_rate_limits TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_security_events TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_security_events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_security_events TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_sessions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_sessions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_sessions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_idempotency_keys TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_idempotency_keys TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_idempotency_keys TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_jobs TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_jobs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_jobs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_keys TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_keys TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_keys TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_rate_counters TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_rate_counters TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_rate_counters TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.campaign_unsubscribes TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.campaign_unsubscribes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.campaign_unsubscribes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sending_domain_tracking TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sending_domain_tracking TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sending_domain_tracking TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_deliveries TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_deliveries TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_deliveries TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_endpoints TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_endpoints TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_endpoints TO service_role;

-- 9) Row level security
ALTER TABLE public.admin_permission_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sending_domain_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- 10) Policies
DROP POLICY IF EXISTS "Admins read permission grants" ON public.admin_permission_grants;
CREATE POLICY "Admins read permission grants" ON public.admin_permission_grants FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (user_id = auth.uid())));
DROP POLICY IF EXISTS "Admins read security events" ON public.admin_security_events;
CREATE POLICY "Admins read security events" ON public.admin_security_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Admins read sessions" ON public.admin_sessions;
CREATE POLICY "Admins read sessions" ON public.admin_sessions FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (user_id = auth.uid())));
DROP POLICY IF EXISTS "Members read workspace unsubscribes" ON public.campaign_unsubscribes;
CREATE POLICY "Members read workspace unsubscribes" ON public.campaign_unsubscribes FOR SELECT TO authenticated USING ((public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));
DROP POLICY IF EXISTS "Workspace members read domain tracking" ON public.sending_domain_tracking;
CREATE POLICY "Workspace members read domain tracking" ON public.sending_domain_tracking FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS api_idempotency_select_members ON public.api_idempotency_keys;
CREATE POLICY api_idempotency_select_members ON public.api_idempotency_keys FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS api_jobs_select_members ON public.api_jobs;
CREATE POLICY api_jobs_select_members ON public.api_jobs FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS api_keys_manage_admins ON public.api_keys;
CREATE POLICY api_keys_manage_admins ON public.api_keys TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));
DROP POLICY IF EXISTS api_keys_select_admins ON public.api_keys;
CREATE POLICY api_keys_select_admins ON public.api_keys FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));
DROP POLICY IF EXISTS api_rate_counters_select_members ON public.api_rate_counters;
CREATE POLICY api_rate_counters_select_members ON public.api_rate_counters FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.api_keys k
  WHERE ((k.id = api_rate_counters.api_key_id) AND public.is_workspace_member(k.workspace_id, auth.uid())))));
DROP POLICY IF EXISTS webhook_deliveries_select_members ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_select_members ON public.webhook_deliveries FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS webhook_endpoints_manage_admins ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_manage_admins ON public.webhook_endpoints TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));
DROP POLICY IF EXISTS webhook_endpoints_select_admins ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_select_admins ON public.webhook_endpoints FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));
DROP POLICY IF EXISTS "Admins read permission grants" ON public.admin_permission_grants;
CREATE POLICY "Admins read permission grants" ON public.admin_permission_grants AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR (user_id = auth.uid())));
DROP POLICY IF EXISTS "Admins read security events" ON public.admin_security_events;
CREATE POLICY "Admins read security events" ON public.admin_security_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read sessions" ON public.admin_sessions;
CREATE POLICY "Admins read sessions" ON public.admin_sessions AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR (user_id = auth.uid())));
DROP POLICY IF EXISTS api_idempotency_select_members ON public.api_idempotency_keys;
CREATE POLICY api_idempotency_select_members ON public.api_idempotency_keys AS PERMISSIVE FOR SELECT TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS api_jobs_select_members ON public.api_jobs;
CREATE POLICY api_jobs_select_members ON public.api_jobs AS PERMISSIVE FOR SELECT TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS api_keys_manage_admins ON public.api_keys;
CREATE POLICY api_keys_manage_admins ON public.api_keys AS PERMISSIVE FOR ALL TO authenticated USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])) WITH CHECK (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
DROP POLICY IF EXISTS api_keys_select_admins ON public.api_keys;
CREATE POLICY api_keys_select_admins ON public.api_keys AS PERMISSIVE FOR SELECT TO authenticated USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
DROP POLICY IF EXISTS api_rate_counters_select_members ON public.api_rate_counters;
CREATE POLICY api_rate_counters_select_members ON public.api_rate_counters AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM api_keys k
  WHERE ((k.id = api_rate_counters.api_key_id) AND is_workspace_member(k.workspace_id, auth.uid())))));
DROP POLICY IF EXISTS "Members read workspace unsubscribes" ON public.campaign_unsubscribes;
CREATE POLICY "Members read workspace unsubscribes" ON public.campaign_unsubscribes AS PERMISSIVE FOR SELECT TO authenticated USING ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
DROP POLICY IF EXISTS "Workspace members read domain tracking" ON public.sending_domain_tracking;
CREATE POLICY "Workspace members read domain tracking" ON public.sending_domain_tracking AS PERMISSIVE FOR SELECT TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS webhook_deliveries_select_members ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_select_members ON public.webhook_deliveries AS PERMISSIVE FOR SELECT TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS webhook_endpoints_manage_admins ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_manage_admins ON public.webhook_endpoints AS PERMISSIVE FOR ALL TO authenticated USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])) WITH CHECK (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
DROP POLICY IF EXISTS webhook_endpoints_select_admins ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_select_admins ON public.webhook_endpoints AS PERMISSIVE FOR SELECT TO authenticated USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

-- 11) Other
ALTER TABLE ONLY public.campaign_unsubscribes REPLICA IDENTITY FULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
