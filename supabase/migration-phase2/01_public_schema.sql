--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'support',
    'user'
);


--
-- Name: billing_environment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_environment AS ENUM (
    'test',
    'live'
);


--
-- Name: billing_interval; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_interval AS ENUM (
    'monthly',
    'yearly'
);


--
-- Name: billing_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_provider AS ENUM (
    'stripe',
    'paddle',
    'lemonsqueezy',
    'manual'
);


--
-- Name: billing_sub_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_sub_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'payment_failed',
    'paused',
    'cancelled',
    'expired'
);


--
-- Name: blog_content_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.blog_content_type AS ENUM (
    'article',
    'guide',
    'case_study',
    'template',
    'tutorial',
    'product_update'
);


--
-- Name: blog_post_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.blog_post_status AS ENUM (
    'draft',
    'scheduled',
    'published',
    'archived'
);


--
-- Name: campaign_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_status AS ENUM (
    'draft',
    'scheduled',
    'active',
    'paused',
    'completed',
    'archived'
);


--
-- Name: connection_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.connection_status AS ENUM (
    'untested',
    'verified',
    'failed',
    'disabled'
);


--
-- Name: message_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_status AS ENUM (
    'pending',
    'scheduled',
    'processing',
    'sent',
    'failed',
    'cancelled'
);


--
-- Name: recipient_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recipient_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'replied',
    'bounced',
    'unsubscribed',
    'failed',
    'stopped'
);


--
-- Name: sending_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sending_provider AS ENUM (
    'smtp',
    'ses',
    'sendgrid',
    'mailgun',
    'postmark',
    'resend',
    'zeptomail',
    'brevo',
    'emailit'
);


--
-- Name: workspace_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_role AS ENUM (
    'owner',
    'admin',
    'campaign_manager',
    'inbox_manager',
    'analyst',
    'client_viewer',
    'member'
);


--
-- Name: accept_workspace_invitation(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_workspace_invitation(_token text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE inv public.workspace_invitations; user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to accept this invitation'; END IF;
  SELECT lower(email) INTO user_email FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO inv FROM public.workspace_invitations WHERE token = _token;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'This invitation is no longer active'; END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.workspace_invitations SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'This invitation has expired';
  END IF;
  IF user_email IS DISTINCT FROM lower(inv.email) THEN
    RAISE EXCEPTION 'This invitation was sent to %', inv.email;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (inv.workspace_id, auth.uid(), inv.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  WHERE id = inv.id;

  RETURN inv.workspace_id;
END; $$;


--
-- Name: analytics_by_account(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.analytics_by_account(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) RETURNS TABLE(account_id uuid, from_email text, sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, bounced bigint, unsubscribed bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT m.sending_account_id AS aid,
      count(*) FILTER (WHERE m.sent_at IS NOT NULL) AS sent,
      count(*) FILTER (WHERE m.delivered_at IS NOT NULL AND m.bounced_at IS NULL AND m.failed_at IS NULL) AS delivered,
      count(*) FILTER (WHERE m.opened_at IS NOT NULL) AS opens,
      count(*) FILTER (WHERE m.clicked_at IS NOT NULL) AS clicks,
      count(DISTINCT m.lead_id) FILTER (WHERE m.replied_at IS NOT NULL) AS replies,
      count(*) FILTER (WHERE m.bounced_at IS NOT NULL) AS bounced,
      count(*) FILTER (WHERE m.unsubscribed_at IS NOT NULL) AS unsubscribed
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.sent_at >= _from AND m.sent_at < _to
    GROUP BY m.sending_account_id
  )
  SELECT sa.id, sa.from_email,
         coalesce(a.sent, 0), coalesce(a.delivered, 0), coalesce(a.opens, 0),
         coalesce(a.clicks, 0), coalesce(a.replies, 0), coalesce(a.bounced, 0),
         coalesce(a.unsubscribed, 0)
  FROM public.sending_accounts sa
  LEFT JOIN agg a ON a.aid = sa.id
  WHERE sa.workspace_id = _workspace_id
  ORDER BY 3 DESC, sa.created_at DESC;
END;
$$;


--
-- Name: analytics_by_campaign(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.analytics_by_campaign(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) RETURNS TABLE(campaign_id uuid, campaign_name text, status text, sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, bounced bigint, unsubscribed bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT m.campaign_id AS cid,
      count(*) FILTER (WHERE m.sent_at IS NOT NULL) AS sent,
      count(*) FILTER (WHERE m.delivered_at IS NOT NULL AND m.bounced_at IS NULL AND m.failed_at IS NULL) AS delivered,
      count(*) FILTER (WHERE m.opened_at IS NOT NULL) AS opens,
      count(*) FILTER (WHERE m.clicked_at IS NOT NULL) AS clicks,
      count(DISTINCT m.lead_id) FILTER (WHERE m.replied_at IS NOT NULL) AS replies,
      count(*) FILTER (WHERE m.bounced_at IS NOT NULL) AS bounced,
      count(*) FILTER (WHERE m.unsubscribed_at IS NOT NULL) AS unsubscribed
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.sent_at >= _from AND m.sent_at < _to
    GROUP BY m.campaign_id
  )
  SELECT c.id, c.name, c.status::text,
         coalesce(a.sent, 0), coalesce(a.delivered, 0), coalesce(a.opens, 0),
         coalesce(a.clicks, 0), coalesce(a.replies, 0), coalesce(a.bounced, 0),
         coalesce(a.unsubscribed, 0)
  FROM public.campaigns c
  LEFT JOIN agg a ON a.cid = c.id
  WHERE c.workspace_id = _workspace_id
  ORDER BY 4 DESC, c.created_at DESC;
END;
$$;


--
-- Name: analytics_summary(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.analytics_summary(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) RETURNS TABLE(sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, bounced bigint, unsubscribed bigint, complained bigint, failed bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    count(*) FILTER (WHERE m.sent_at IS NOT NULL),
    count(*) FILTER (WHERE m.delivered_at IS NOT NULL AND m.bounced_at IS NULL AND m.failed_at IS NULL),
    count(*) FILTER (WHERE m.opened_at IS NOT NULL),
    count(*) FILTER (WHERE m.clicked_at IS NOT NULL),
    count(DISTINCT m.lead_id) FILTER (WHERE m.replied_at IS NOT NULL),
    count(*) FILTER (WHERE m.bounced_at IS NOT NULL),
    count(*) FILTER (WHERE m.unsubscribed_at IS NOT NULL),
    count(*) FILTER (WHERE m.complained_at IS NOT NULL),
    count(*) FILTER (WHERE m.bounced_at IS NULL AND (m.failed_at IS NOT NULL OR m.delivery_status = 'failed'))
  FROM public.campaign_messages m
  WHERE m.workspace_id = _workspace_id
    AND coalesce(m.sent_at, m.updated_at) >= _from
    AND coalesce(m.sent_at, m.updated_at) < _to
    AND (m.sent_at IS NOT NULL OR m.status = 'failed')
    AND public.is_workspace_member(_workspace_id, auth.uid());
$$;


--
-- Name: analytics_timeseries(uuid, timestamp with time zone, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.analytics_timeseries(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone, _bucket text DEFAULT 'day'::text) RETURNS TABLE(bucket timestamp with time zone, sent bigint, delivered bigint, opens bigint, clicks bigint, replies bigint, bounced bigint, unsubscribed bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  unit text := CASE WHEN _bucket = 'hour' THEN 'hour' ELSE 'day' END;
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  WITH series AS (
    SELECT generate_series(date_trunc(unit, _from), date_trunc(unit, _to), ('1 ' || unit)::interval) AS b
  ),
  agg AS (
    SELECT date_trunc(unit, m.sent_at) AS b,
      count(*) AS sent,
      count(*) FILTER (WHERE m.delivered_at IS NOT NULL AND m.bounced_at IS NULL AND m.failed_at IS NULL) AS delivered,
      count(*) FILTER (WHERE m.opened_at IS NOT NULL) AS opens,
      count(*) FILTER (WHERE m.clicked_at IS NOT NULL) AS clicks,
      count(DISTINCT m.lead_id) FILTER (WHERE m.replied_at IS NOT NULL) AS replies,
      count(*) FILTER (WHERE m.bounced_at IS NOT NULL) AS bounced,
      count(*) FILTER (WHERE m.unsubscribed_at IS NOT NULL) AS unsubscribed
    FROM public.campaign_messages m
    WHERE m.workspace_id = _workspace_id
      AND m.sent_at >= _from AND m.sent_at < _to
    GROUP BY 1
  )
  SELECT s.b, coalesce(a.sent, 0), coalesce(a.delivered, 0), coalesce(a.opens, 0),
         coalesce(a.clicks, 0), coalesce(a.replies, 0), coalesce(a.bounced, 0),
         coalesce(a.unsubscribed, 0)
  FROM series s LEFT JOIN agg a ON a.b = s.b
  ORDER BY s.b;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    entry_type text NOT NULL,
    amount bigint NOT NULL,
    balance_before bigint NOT NULL,
    balance_after bigint NOT NULL,
    reason text,
    reference text,
    actor text DEFAULT 'system'::text NOT NULL,
    actor_user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT credit_ledger_entry_type_check CHECK ((entry_type = ANY (ARRAY['plan_allocation'::text, 'usage'::text, 'purchase'::text, 'admin_adjustment'::text, 'refund'::text, 'bonus'::text, 'expiration'::text, 'correction'::text])))
);


--
-- Name: apply_credit_change(uuid, bigint, text, text, text, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_credit_change(_workspace_id uuid, _amount bigint, _entry_type text, _reason text DEFAULT NULL::text, _reference text DEFAULT NULL::text, _actor text DEFAULT 'system'::text, _actor_user_id uuid DEFAULT NULL::uuid, _user_id uuid DEFAULT NULL::uuid) RETURNS public.credit_ledger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _before bigint;
  _after bigint;
  _row public.credit_ledger;
BEGIN
  INSERT INTO public.workspace_credits (workspace_id) VALUES (_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  SELECT balance INTO _before FROM public.workspace_credits
   WHERE workspace_id = _workspace_id FOR UPDATE;

  _after := _before + _amount;
  IF _after < 0 THEN
    RAISE EXCEPTION 'Insufficient credits: balance % cannot absorb %', _before, _amount;
  END IF;

  UPDATE public.workspace_credits
     SET balance = _after,
         allocated_total = allocated_total + GREATEST(_amount, 0),
         consumed_total = consumed_total + GREATEST(-_amount, 0),
         last_allocated_at = CASE WHEN _entry_type = 'plan_allocation' THEN now() ELSE last_allocated_at END,
         updated_at = now()
   WHERE workspace_id = _workspace_id;

  INSERT INTO public.credit_ledger (
    workspace_id, user_id, entry_type, amount, balance_before, balance_after,
    reason, reference, actor, actor_user_id
  ) VALUES (
    _workspace_id, _user_id, _entry_type, _amount, _before, _after,
    _reason, _reference, _actor, _actor_user_id
  ) RETURNING * INTO _row;

  RETURN _row;
END;
$$;


--
-- Name: ai_personalizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_personalizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    content text,
    prompt_hash text DEFAULT ''::text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    model text,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    edited boolean DEFAULT false NOT NULL,
    accepted boolean DEFAULT false NOT NULL,
    locked_by text,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    quality text DEFAULT 'complete'::text NOT NULL,
    data_used text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT ai_personalizations_quality_check CHECK ((quality = ANY (ARRAY['complete'::text, 'limited'::text, 'fallback'::text])))
);


--
-- Name: claim_ai_personalization_jobs(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_ai_personalization_jobs(_worker text, _limit integer) RETURNS SETOF public.ai_personalizations
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.ai_personalizations p
     SET status = 'processing',
         locked_by = _worker,
         locked_until = now() + interval '5 minutes',
         started_at = now(),
         attempts = p.attempts + 1
   WHERE p.id IN (
     SELECT id FROM public.ai_personalizations
      WHERE (status = 'queued' OR (status = 'processing' AND locked_until < now()))
        AND attempts < 4
      ORDER BY created_at
      LIMIT greatest(1, least(coalesce(_limit, 10), 25))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING p.*;
$$;


--
-- Name: automation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    automation_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    event_id uuid,
    lead_id uuid,
    campaign_id uuid,
    trigger_type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    current_step integer DEFAULT 0 NOT NULL,
    branch text,
    resume_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    result text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    definition jsonb DEFAULT '{}'::jsonb NOT NULL,
    automation_version integer DEFAULT 1 NOT NULL,
    locked_by text,
    locked_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT automation_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'waiting'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.automation_runs REPLICA IDENTITY FULL;


--
-- Name: claim_automation_runs(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_automation_runs(_worker text, _limit integer) RETURNS SETOF public.automation_runs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Recover runs whose worker died mid-execution.
  UPDATE public.automation_runs
  SET status = 'queued', locked_by = NULL, locked_at = NULL
  WHERE status = 'running' AND locked_at < now() - interval '10 minutes';

  RETURN QUERY
  WITH due AS (
    SELECT r.id
    FROM public.automation_runs r
    WHERE (r.status = 'queued' OR (r.status = 'waiting' AND r.resume_at IS NOT NULL AND r.resume_at <= now()))
    ORDER BY r.created_at
    LIMIT greatest(1, least(_limit, 200))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.automation_runs r
  SET status = 'running',
      locked_by = _worker,
      locked_at = now(),
      attempts = r.attempts + 1,
      started_at = coalesce(r.started_at, now())
  FROM due
  WHERE r.id = due.id
  RETURNING r.*;
END;
$$;


--
-- Name: warmup_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warmup_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    sending_account_id uuid NOT NULL,
    conversation_id uuid,
    recipient_account_id uuid,
    role text DEFAULT 'initial'::text NOT NULL,
    from_email text NOT NULL,
    to_email text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts smallint DEFAULT 0 NOT NULL,
    max_attempts smallint DEFAULT 3 NOT NULL,
    next_attempt_at timestamp with time zone,
    idempotency_key text NOT NULL,
    provider text,
    provider_message_id text,
    locked_by text,
    locked_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    warmup_token text,
    placement text DEFAULT 'pending'::text NOT NULL,
    placement_checked_at timestamp with time zone,
    received_at timestamp with time zone,
    pool_recipient_id uuid,
    CONSTRAINT warmup_jobs_role_check CHECK ((role = ANY (ARRAY['initial'::text, 'reply'::text, 'followup'::text]))),
    CONSTRAINT warmup_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'sent'::text, 'delivered'::text, 'replied'::text, 'failed'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.warmup_jobs REPLICA IDENTITY FULL;


--
-- Name: claim_warmup_jobs(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_warmup_jobs(_worker text, _limit integer) RETURNS SETOF public.warmup_jobs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.warmup_jobs
  set status = 'queued', locked_by = null, locked_at = null
  where status = 'processing' and locked_at < now() - interval '10 minutes';

  return query
  with due as (
    select j.id
    from public.warmup_jobs j
    where j.status = 'queued'
      and j.scheduled_at <= now()
      and (j.next_attempt_at is null or j.next_attempt_at <= now())
    order by j.scheduled_at
    limit greatest(1, least(_limit, 100))
    for update skip locked
  )
  update public.warmup_jobs j
  set status = 'processing',
      locked_by = _worker,
      locked_at = now(),
      attempts = j.attempts + 1
  from due
  where j.id = due.id
  returning j.*;
end;
$$;


--
-- Name: claim_warmup_jobs_for_account(text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_warmup_jobs_for_account(_worker text, _limit integer, _account uuid) RETURNS SETOF public.warmup_jobs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.warmup_jobs
  set status = 'queued', locked_by = null, locked_at = null
  where status = 'processing'
    and sending_account_id = _account
    and locked_at < now() - interval '10 minutes';

  return query
  with due as (
    select j.id
    from public.warmup_jobs j
    where j.status = 'queued'
      and j.sending_account_id = _account
      and (j.next_attempt_at is null or j.next_attempt_at <= now())
    order by j.scheduled_at
    limit greatest(1, least(_limit, 50))
    for update skip locked
  )
  update public.warmup_jobs j
  set status = 'processing',
      locked_by = _worker,
      locked_at = now(),
      attempts = j.attempts + 1
  from due
  where j.id = due.id
  returning j.*;
end;
$$;


--
-- Name: consume_workspace_usage(uuid, text, date, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_workspace_usage(_workspace_id uuid, _resource text, _period_start date, _amount bigint, _limit bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _row public.workspace_usage_counters;
  _current bigint;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    _amount := 0;
  END IF;

  INSERT INTO public.workspace_usage_counters AS c (workspace_id, resource, period_start, used)
  VALUES (_workspace_id, _resource, _period_start, _amount)
  ON CONFLICT (workspace_id, resource, period_start) DO UPDATE
    SET used = c.used + _amount, updated_at = now()
    WHERE _limit IS NULL OR c.used + _amount <= _limit
  RETURNING * INTO _row;

  IF _row.workspace_id IS NOT NULL THEN
    IF _limit IS NOT NULL AND _row.used > _limit THEN
      UPDATE public.workspace_usage_counters
        SET used = GREATEST(used - _amount, 0), updated_at = now()
        WHERE workspace_id = _workspace_id AND resource = _resource AND period_start = _period_start
        RETURNING used INTO _current;
      RETURN jsonb_build_object('allowed', false, 'used', COALESCE(_current, 0), 'limit', _limit,
        'remaining', GREATEST(_limit - COALESCE(_current, 0), 0));
    END IF;
    RETURN jsonb_build_object('allowed', true, 'used', _row.used, 'limit', _limit,
      'remaining', CASE WHEN _limit IS NULL THEN NULL ELSE GREATEST(_limit - _row.used, 0) END);
  END IF;

  SELECT used INTO _current FROM public.workspace_usage_counters
    WHERE workspace_id = _workspace_id AND resource = _resource AND period_start = _period_start;
  _current := COALESCE(_current, 0);
  RETURN jsonb_build_object('allowed', false, 'used', _current, 'limit', _limit,
    'remaining', CASE WHEN _limit IS NULL THEN NULL ELSE GREATEST(_limit - _current, 0) END);
END;
$$;


--
-- Name: consume_workspace_usage_v2(uuid, text, bigint, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_workspace_usage_v2(_workspace_id uuid, _resource text, _amount bigint DEFAULT 1, _environment text DEFAULT 'live'::text, _dry_run boolean DEFAULT false, _reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _sub record;
  _plan record;
  _period date;
  _today date := (now() AT TIME ZONE 'utc')::date;
  _resets boolean := true;
  _reset_at timestamptz;
  _limit bigint;
  _daily_limit bigint;
  _daily_resource text;
  _used bigint := 0;
  _daily_used bigint := 0;
  _free_plan boolean := false;
BEGIN
  IF _amount IS NULL OR _amount < 0 THEN _amount := 0; END IF;

  SELECT * INTO _sub FROM public.billing_subscriptions
   WHERE workspace_id = _workspace_id AND environment::text = COALESCE(_environment, 'live')
   ORDER BY updated_at DESC LIMIT 1;

  -- Always assign _plan so the record is initialised even with no subscription.
  SELECT * INTO _plan FROM public.plans WHERE id = _sub.plan_id;
  IF _plan.id IS NULL THEN
    SELECT * INTO _plan FROM public.plans WHERE COALESCE(is_active, true) ORDER BY sort_order ASC LIMIT 1;
  END IF;
  IF _plan.id IS NULL THEN
    RAISE EXCEPTION 'No plan is configured';
  END IF;

  _free_plan := COALESCE(_plan.monthly_price, 0) = 0;

  IF _sub.id IS NOT NULL
     AND _sub.status::text IN ('trialing','active','past_due','payment_failed','paused')
     AND _sub.current_period_start IS NOT NULL
     AND NOT _free_plan THEN
    IF _sub.current_period_end IS NOT NULL AND _sub.current_period_end < now() THEN
      _period := date_trunc('month', now())::date;
      _reset_at := date_trunc('month', now()) + interval '1 month';
    ELSE
      _period := _sub.current_period_start::date;
      _reset_at := _sub.current_period_end;
    END IF;
  ELSE
    _period := DATE '1970-01-01';
    _resets := false;
    _reset_at := NULL;
  END IF;

  IF _resource = 'emails_monthly' THEN
    _limit := _plan.max_emails_monthly;
    _daily_limit := _plan.max_emails_daily;
    _daily_resource := 'emails_daily';
  ELSIF _resource = 'ai_monthly' THEN
    _limit := _plan.max_ai_monthly;
  ELSIF _resource = 'warmup_daily' THEN
    _limit := _plan.max_warmup_daily;
    _period := _today;
    _resets := true;
    _reset_at := (_today + 1)::timestamptz;
  ELSE
    RAISE EXCEPTION 'Unknown metered resource %', _resource;
  END IF;

  SELECT COALESCE(used, 0) INTO _used FROM public.workspace_usage_counters
    WHERE workspace_id = _workspace_id AND resource = _resource AND period_start = _period;
  _used := COALESCE(_used, 0);

  IF _daily_resource IS NOT NULL THEN
    SELECT COALESCE(used, 0) INTO _daily_used FROM public.workspace_usage_counters
      WHERE workspace_id = _workspace_id AND resource = _daily_resource AND period_start = _today;
    _daily_used := COALESCE(_daily_used, 0);
  END IF;

  IF _dry_run OR _amount = 0 THEN
    RETURN jsonb_build_object(
      'allowed', (_limit IS NULL OR _used + _amount <= _limit)
                 AND (_daily_limit IS NULL OR _daily_used + _amount <= _daily_limit),
      'used', _used, 'limit', _limit,
      'remaining', CASE WHEN _limit IS NULL THEN NULL ELSE GREATEST(_limit - _used, 0) END,
      'daily_used', _daily_used, 'daily_limit', _daily_limit,
      'period_start', _period, 'resets', _resets, 'reset_at', _reset_at,
      'plan_id', _plan.id, 'plan_name', _plan.name,
      'reason', CASE
        WHEN _limit IS NOT NULL AND _used + _amount > _limit THEN 'plan_limit'
        WHEN _daily_limit IS NOT NULL AND _daily_used + _amount > _daily_limit THEN 'daily_limit'
        ELSE NULL END
    );
  END IF;

  INSERT INTO public.workspace_usage_counters AS c (workspace_id, resource, period_start, used)
  VALUES (_workspace_id, _resource, _period, _amount)
  ON CONFLICT (workspace_id, resource, period_start) DO UPDATE
    SET used = c.used + _amount, updated_at = now()
  RETURNING used INTO _used;

  IF _limit IS NOT NULL AND _used > _limit THEN
    UPDATE public.workspace_usage_counters
       SET used = GREATEST(used - _amount, 0), updated_at = now()
     WHERE workspace_id = _workspace_id AND resource = _resource AND period_start = _period
     RETURNING used INTO _used;

    IF NOT _resets THEN
      UPDATE public.workspaces SET trial_consumed_at = COALESCE(trial_consumed_at, now())
       WHERE id = _workspace_id;
    END IF;

    INSERT INTO public.usage_audit_log
      (workspace_id, resource, action, amount, allowed, used_after, limit_value, period_start, plan_id, plan_name, reason)
    VALUES (_workspace_id, _resource, 'denied', _amount, false, _used, _limit, _period, _plan.id, _plan.name,
            COALESCE(_reason, 'plan_limit'));

    RETURN jsonb_build_object('allowed', false, 'used', _used, 'limit', _limit,
      'remaining', GREATEST(_limit - _used, 0), 'daily_used', _daily_used, 'daily_limit', _daily_limit,
      'period_start', _period, 'resets', _resets, 'reset_at', _reset_at,
      'plan_id', _plan.id, 'plan_name', _plan.name, 'reason', 'plan_limit');
  END IF;

  IF _daily_resource IS NOT NULL THEN
    INSERT INTO public.workspace_usage_counters AS c (workspace_id, resource, period_start, used)
    VALUES (_workspace_id, _daily_resource, _today, _amount)
    ON CONFLICT (workspace_id, resource, period_start) DO UPDATE
      SET used = c.used + _amount, updated_at = now()
    RETURNING used INTO _daily_used;

    IF _daily_limit IS NOT NULL AND _daily_used > _daily_limit THEN
      UPDATE public.workspace_usage_counters
         SET used = GREATEST(used - _amount, 0), updated_at = now()
       WHERE workspace_id = _workspace_id AND resource = _daily_resource AND period_start = _today
       RETURNING used INTO _daily_used;
      UPDATE public.workspace_usage_counters
         SET used = GREATEST(used - _amount, 0), updated_at = now()
       WHERE workspace_id = _workspace_id AND resource = _resource AND period_start = _period
       RETURNING used INTO _used;

      INSERT INTO public.usage_audit_log
        (workspace_id, resource, action, amount, allowed, used_after, limit_value, period_start, plan_id, plan_name, reason)
      VALUES (_workspace_id, _resource, 'denied', _amount, false, _daily_used, _daily_limit, _today, _plan.id, _plan.name, 'daily_limit');

      RETURN jsonb_build_object('allowed', false, 'used', _used, 'limit', _limit,
        'remaining', CASE WHEN _limit IS NULL THEN NULL ELSE GREATEST(_limit - _used, 0) END,
        'daily_used', _daily_used, 'daily_limit', _daily_limit,
        'period_start', _period, 'resets', _resets, 'reset_at', _reset_at,
        'plan_id', _plan.id, 'plan_name', _plan.name, 'reason', 'daily_limit');
    END IF;
  END IF;

  INSERT INTO public.usage_audit_log
    (workspace_id, resource, action, amount, allowed, used_after, limit_value, period_start, plan_id, plan_name, reason)
  VALUES (_workspace_id, _resource, 'consume', _amount, true, _used, _limit, _period, _plan.id, _plan.name, _reason);

  RETURN jsonb_build_object('allowed', true, 'used', _used, 'limit', _limit,
    'remaining', CASE WHEN _limit IS NULL THEN NULL ELSE GREATEST(_limit - _used, 0) END,
    'daily_used', _daily_used, 'daily_limit', _daily_limit,
    'period_start', _period, 'resets', _resets, 'reset_at', _reset_at,
    'plan_id', _plan.id, 'plan_name', _plan.name, 'reason', NULL);
END;
$$;


--
-- Name: credit_ledger_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.credit_ledger_immutable() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION 'credit_ledger rows are immutable';
END;
$$;


--
-- Name: delete_crm_stage(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_crm_stage(_stage_id uuid, _move_to uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ws uuid;
BEGIN
  SELECT workspace_id INTO ws FROM public.crm_stages WHERE id = _stage_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Stage not found'; END IF;
  IF NOT public.has_workspace_role(ws, auth.uid(),
        array['owner','admin','campaign_manager']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  IF _move_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_stages WHERE id = _move_to AND workspace_id = ws
  ) THEN
    RAISE EXCEPTION 'Target stage is not in this workspace';
  END IF;

  UPDATE public.leads SET stage_id = _move_to WHERE stage_id = _stage_id;
  DELETE FROM public.crm_stages WHERE id = _stage_id;
END;
$$;


--
-- Name: delete_workspace(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_workspace(_workspace_id uuid, _confirm text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ws public.workspaces;
BEGIN
  SELECT * INTO ws FROM public.workspaces WHERE id = _workspace_id;
  IF ws.id IS NULL THEN RAISE EXCEPTION 'Workspace not found'; END IF;
  IF ws.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Only the workspace owner can delete this workspace'; END IF;
  IF lower(trim(coalesce(_confirm,''))) <> lower(ws.name) THEN
    RAISE EXCEPTION 'Type the workspace name exactly to confirm deletion';
  END IF;
  DELETE FROM public.workspaces WHERE id = _workspace_id;
END; $$;


--
-- Name: enforce_managed_sending(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_managed_sending() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only customer (Data API) writes are constrained; server-side/admin code
  -- runs as service_role and assigns the managed provider itself.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Mailboxes must be connected through Sendloop; direct inserts are not allowed';
  END IF;

  NEW.provider := OLD.provider;
  NEW.provider_id := OLD.provider_id;
  NEW.connection_method := OLD.connection_method;
  RETURN NEW;
END;
$$;


--
-- Name: ensure_crm_stages(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_crm_stages(_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_workspace_member(_workspace_id, auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM public.workspaces w
       WHERE w.id = _workspace_id AND w.owner_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  INSERT INTO public.crm_stages (workspace_id, key, name, color, position, is_won, is_lost)
  VALUES
    (_workspace_id, 'new',            'New',            'slate',   0, false, false),
    (_workspace_id, 'contacted',      'Contacted',      'blue',    1, false, false),
    (_workspace_id, 'replied',        'Replied',        'violet',  2, false, false),
    (_workspace_id, 'meeting_booked', 'Meeting Booked', 'amber',   3, false, false),
    (_workspace_id, 'won',            'Won',            'emerald', 4, true,  false),
    (_workspace_id, 'lost',           'Lost',           'rose',    5, false, true)
  ON CONFLICT (workspace_id, key) DO NOTHING;
END;
$$;


--
-- Name: referral_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid,
    code text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    payout_method text,
    payout_destination_hint text,
    suspended_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.referral_profiles REPLICA IDENTITY FULL;


--
-- Name: ensure_referral_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_referral_profile() RETURNS public.referral_profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  prof public.referral_profiles;
  new_code text;
  tries integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to join the referral program'; END IF;

  SELECT * INTO prof FROM public.referral_profiles WHERE user_id = auth.uid();
  IF prof.id IS NOT NULL THEN RETURN prof; END IF;

  LOOP
    tries := tries + 1;
    new_code := upper(substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=OI01lL', 'abcdefghi'), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_profiles WHERE code = new_code);
    IF tries > 10 THEN RAISE EXCEPTION 'Could not generate a referral code, try again'; END IF;
  END LOOP;

  INSERT INTO public.referral_profiles (user_id, code)
  VALUES (auth.uid(), new_code)
  RETURNING * INTO prof;

  INSERT INTO public.referral_audit_logs (actor_id, actor_role, action, entity_type, entity_id, referral_profile_id, detail)
  VALUES (auth.uid(), 'customer', 'referral_profile_created', 'referral_profile', prof.id, prof.id, 'Referral profile created with code ' || prof.code);

  RETURN prof;
END; $$;


--
-- Name: ensure_workspace_owner_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_workspace_owner_member() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner')
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  reg_enabled boolean;
BEGIN
  SELECT COALESCE((value ->> 'registration_enabled')::boolean, true)
    INTO reg_enabled
  FROM public.platform_settings
  WHERE key = 'system.general';

  IF reg_enabled IS NOT NULL AND reg_enabled = false THEN
    RAISE EXCEPTION 'Registration is currently disabled'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;


--
-- Name: has_workspace_role(uuid, uuid, public.workspace_role[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id AND role = ANY(_roles));
$$;


--
-- Name: invite_workspace_member(uuid, text, public.workspace_role, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invite_workspace_member(_workspace_id uuid, _email text, _role public.workspace_role, _message text DEFAULT NULL::text) RETURNS TABLE(id uuid, token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
DECLARE
  clean_email text := lower(trim(_email));
  new_token text := encode(extensions.gen_random_bytes(24), 'hex');
  new_id uuid;
  recent integer;
BEGIN
  IF NOT public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can invite teammates';
  END IF;
  IF clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'Ownership cannot be granted through an invitation'; END IF;
  SELECT count(*) INTO recent FROM public.workspace_invitations i
  WHERE i.workspace_id = _workspace_id AND i.created_at > now() - interval '1 hour';
  IF recent >= 20 THEN RAISE EXCEPTION 'Invitation limit reached for this workspace. Try again in an hour.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations i
    WHERE i.workspace_id = _workspace_id AND lower(i.email) = clean_email
      AND i.created_at > now() - interval '2 minutes'
  ) THEN RAISE EXCEPTION 'An invitation was just sent to that email. Please wait a moment before trying again.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_members wm
    JOIN public.profiles p ON p.id = wm.user_id
    WHERE wm.workspace_id = _workspace_id AND lower(p.email) = clean_email
  ) THEN RAISE EXCEPTION 'That person is already a member of this workspace'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations i
    WHERE i.workspace_id = _workspace_id AND lower(i.email) = clean_email AND i.status = 'pending'
  ) THEN RAISE EXCEPTION 'There is already a pending invitation for that email'; END IF;

  INSERT INTO public.workspace_invitations (workspace_id, email, role, message, token, invited_by)
  VALUES (_workspace_id, clean_email, _role, nullif(trim(coalesce(_message,'')), ''), new_token, auth.uid())
  RETURNING workspace_invitations.id INTO new_id;
  RETURN QUERY SELECT new_id, new_token;
END;
$_$;


--
-- Name: is_workspace_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id);
$$;


--
-- Name: log_workspace_invitation_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_workspace_invitation_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_email, type, detail)
    VALUES (NEW.workspace_id, NEW.invited_by, NEW.email, 'invitation_sent',
            NEW.email || ' was invited as ' || NEW.role::text);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_user_id, target_email, type, detail)
    VALUES (NEW.workspace_id, NEW.accepted_by, NEW.accepted_by, NEW.email, 'invitation_accepted',
            NEW.email || ' accepted the invitation');
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: log_workspace_member_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_workspace_member_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE em text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT email INTO em FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_user_id, target_email, type, detail)
    VALUES (NEW.workspace_id, auth.uid(), NEW.user_id, em, 'member_joined',
            coalesce(em, 'A teammate') || ' joined as ' || NEW.role::text);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT email INTO em FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_user_id, target_email, type, detail)
    VALUES (NEW.workspace_id, auth.uid(), NEW.user_id, em, 'role_changed',
            coalesce(em, 'A teammate') || ' changed from ' || OLD.role::text || ' to ' || NEW.role::text);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT email INTO em FROM public.profiles WHERE id = OLD.user_id;
    INSERT INTO public.workspace_activity (workspace_id, actor_id, target_user_id, target_email, type, detail)
    VALUES (OLD.workspace_id, auth.uid(), OLD.user_id, em, 'member_removed',
            coalesce(em, 'A teammate') || ' was removed from the workspace');
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: mark_conversation_direction(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_conversation_direction() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.direction = 'outbound' THEN
    UPDATE public.conversations SET has_outbound = true
      WHERE id = NEW.conversation_id AND has_outbound = false;
  ELSIF NEW.direction = 'inbound' THEN
    UPDATE public.conversations
      SET has_inbound = true,
          last_inbound_at = GREATEST(COALESCE(last_inbound_at, NEW.created_at), NEW.created_at)
      WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: mark_conversation_outbound(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_conversation_outbound() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.direction = 'outbound' THEN
    UPDATE public.conversations SET has_outbound = true WHERE id = NEW.conversation_id AND has_outbound = false;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: move_crm_contacts(uuid[], uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_crm_contacts(_lead_ids uuid[], _stage_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  ws uuid;
  stage_name text;
  moved integer;
BEGIN
  IF _lead_ids IS NULL OR array_length(_lead_ids, 1) IS NULL THEN RETURN 0; END IF;

  SELECT s.workspace_id, s.name INTO ws, stage_name
  FROM public.crm_stages s WHERE s.id = _stage_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Stage not found'; END IF;
  IF NOT public.is_workspace_member(ws, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = ANY(_lead_ids) AND l.workspace_id IS DISTINCT FROM ws
  ) THEN
    RAISE EXCEPTION 'One or more contacts belong to another workspace';
  END IF;

  UPDATE public.leads
  SET stage_id = _stage_id, last_activity_at = now()
  WHERE id = ANY(_lead_ids) AND workspace_id = ws;
  GET DIAGNOSTICS moved = ROW_COUNT;

  INSERT INTO public.lead_activities (lead_id, workspace_id, type, detail)
  SELECT l.id, ws, 'stage_changed', 'Moved to ' || stage_name
  FROM public.leads l WHERE l.id = ANY(_lead_ids) AND l.workspace_id = ws;

  RETURN moved;
END;
$$;


--
-- Name: notify_support_reply(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_support_reply() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t public.support_tickets; wants boolean;
BEGIN
  SELECT * INTO t FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF t.id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.support_tickets SET last_message_at = now() WHERE id = t.id;

  IF NEW.is_internal OR NEW.author_role = 'customer' THEN RETURN NEW; END IF;

  SELECT (p.support_updates AND p.in_app_enabled) INTO wants
  FROM public.notification_preferences p WHERE p.user_id = t.created_by;

  IF coalesce(wants, true) THEN
    INSERT INTO public.notifications (user_id, workspace_id, type, title, message, entity_type, entity_id)
    VALUES (t.created_by, t.workspace_id, 'support_reply', 'Support replied to your ticket',
            left(NEW.body, 200), 'support_ticket', t.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: notify_support_ticket_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_support_ticket_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE wants boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  SELECT (p.support_updates AND p.in_app_enabled) INTO wants
  FROM public.notification_preferences p WHERE p.user_id = NEW.created_by;

  IF coalesce(wants, true) THEN
    INSERT INTO public.notifications (user_id, workspace_id, type, title, message, entity_type, entity_id)
    VALUES (NEW.created_by, NEW.workspace_id, 'support_status',
            'Your support ticket is now ' || NEW.status,
            coalesce(NEW.subject, 'Support ticket') || ' was moved to ' || NEW.status,
            'support_ticket', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: provider_record_usage(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provider_record_usage(_provider_id uuid, _sent integer DEFAULT 0, _failed integer DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  _hour timestamptz := date_trunc('hour', now());
  _day date := (now() at time zone 'utc')::date;
begin
  update public.email_providers
     set sent_hour = case when usage_hour is distinct from _hour then 0 else sent_hour end + greatest(_sent, 0),
         sent_day = case when usage_day is distinct from _day then 0 else sent_day end + greatest(_sent, 0),
         usage_hour = _hour,
         usage_day = _day,
         success_count = success_count + greatest(_sent, 0),
         failure_count = failure_count + greatest(_failed, 0),
         last_success_at = case when _sent > 0 then now() else last_success_at end
   where id = _provider_id;
end;
$$;


--
-- Name: public_auth_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.public_auth_settings() RETURNS TABLE(google_enabled boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select (value->>'google')::boolean from public.platform_settings where key = 'auth_providers'),
    true
  ) as google_enabled;
$$;


--
-- Name: public_platform_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.public_platform_config() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: public_platform_flags(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.public_platform_flags() RETURNS TABLE(maintenance_mode boolean, maintenance_message text, registration_enabled boolean, google_enabled boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    COALESCE((SELECT (value ->> 'maintenance_mode')::boolean FROM public.platform_settings WHERE key = 'system.maintenance'), false),
    COALESCE((SELECT value ->> 'maintenance_message' FROM public.platform_settings WHERE key = 'system.maintenance'), ''),
    COALESCE((SELECT (value ->> 'registration_enabled')::boolean FROM public.platform_settings WHERE key = 'system.general'), true),
    COALESCE((SELECT (value ->> 'google')::boolean FROM public.platform_settings WHERE key = 'auth_providers'), true);
$$;


--
-- Name: public_review_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.public_review_stats() RETURNS TABLE(customers bigint, emails_sent bigint, campaigns bigint, average_rating numeric, reviews bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    (SELECT count(*) FROM public.workspaces),
    (SELECT count(*) FROM public.campaign_messages WHERE status = 'sent'),
    (SELECT count(*) FROM public.campaigns WHERE status <> 'draft'),
    (SELECT round(avg(rating)::numeric, 1) FROM public.testimonials WHERE active),
    (SELECT count(*) FROM public.testimonials WHERE active);
$$;


--
-- Name: publish_due_blog_posts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_due_blog_posts() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE n integer;
BEGIN
  UPDATE public.blog_posts
  SET status = 'published'
  WHERE status = 'scheduled'
    AND published_at IS NOT NULL
    AND published_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;


--
-- Name: record_blog_slug_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_blog_slug_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    DELETE FROM public.blog_post_slugs WHERE slug = NEW.slug;
    INSERT INTO public.blog_post_slugs (post_id, slug)
    VALUES (OLD.id, OLD.slug)
    ON CONFLICT (slug) DO UPDATE SET post_id = EXCLUDED.post_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: referral_dashboard_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.referral_dashboard_stats() RETURNS TABLE(clicks bigint, signups bigint, customers bigint, active_customers bigint, pending_cents bigint, approved_cents bigint, paid_cents bigint, reversed_cents bigint, requested_cents bigint, available_cents bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM public.referral_profiles WHERE user_id = auth.uid();
  IF pid IS NULL THEN
    RETURN QUERY SELECT 0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint;
    RETURN;
  END IF;

  RETURN QUERY
  WITH c AS (SELECT count(*) n FROM public.referral_clicks WHERE referral_profile_id = pid),
  a AS (
    SELECT count(*) signups,
           count(*) FILTER (WHERE status = 'converted') customers
    FROM public.referral_attributions WHERE referral_profile_id = pid
  ),
  ac AS (
    SELECT count(DISTINCT referred_user_id) n FROM public.referral_commissions
    WHERE referral_profile_id = pid AND status <> 'reversed'
      AND created_at > now() - interval '60 days'
  ),
  m AS (
    SELECT
      coalesce(sum(commission_amount_cents) FILTER (WHERE status = 'pending'), 0) pending,
      coalesce(sum(commission_amount_cents) FILTER (WHERE status = 'approved'), 0) approved,
      coalesce(sum(commission_amount_cents) FILTER (WHERE status = 'paid'), 0) paid,
      coalesce(sum(abs(commission_amount_cents)) FILTER (WHERE status = 'reversed'), 0) reversed
    FROM public.referral_commissions WHERE referral_profile_id = pid
  ),
  p AS (
    SELECT coalesce(sum(amount_cents) FILTER (WHERE status IN ('requested','under_review','approved','processing')), 0) requested
    FROM public.referral_payouts WHERE referral_profile_id = pid
  )
  SELECT c.n, a.signups, a.customers, ac.n, m.pending, m.approved, m.paid, m.reversed, p.requested,
         greatest(m.approved - p.requested, 0)
  FROM c, a, ac, m, p;
END; $$;


--
-- Name: referral_program_public(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.referral_program_public() RETURNS TABLE(enabled boolean, commission_type text, commission_percent numeric, commission_fixed_cents integer, recurring boolean, commission_duration_months integer, minimum_payout_cents integer, attribution_window_days integer, approval_mode text, approval_delay_days integer, payout_schedule text, payout_methods text[], payout_provider_configured boolean, eligibility text, terms text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.enabled, p.commission_type, p.commission_percent, p.commission_fixed_cents,
         p.recurring, p.commission_duration_months, p.minimum_payout_cents,
         p.attribution_window_days, p.approval_mode, p.approval_delay_days,
         p.payout_schedule, p.payout_methods, p.payout_provider_configured,
         p.eligibility, p.terms
  FROM public.referral_programs p WHERE p.singleton LIMIT 1;
$$;


--
-- Name: release_workspace_usage(uuid, text, date, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_workspace_usage(_workspace_id uuid, _resource text, _period_start date, _amount bigint) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.workspace_usage_counters
     SET used = GREATEST(used - GREATEST(COALESCE(_amount, 0), 0), 0), updated_at = now()
   WHERE workspace_id = _workspace_id AND resource = _resource AND period_start = _period_start;
$$;


--
-- Name: release_workspace_usage_v2(uuid, text, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_workspace_usage_v2(_workspace_id uuid, _resource text, _amount bigint DEFAULT 1, _environment text DEFAULT 'live'::text, _reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _state jsonb;
  _period date;
  _today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RETURN; END IF;
  _state := public.consume_workspace_usage_v2(_workspace_id, _resource, 0, _environment, true, NULL);
  _period := (_state->>'period_start')::date;

  UPDATE public.workspace_usage_counters
     SET used = GREATEST(used - _amount, 0), updated_at = now()
   WHERE workspace_id = _workspace_id AND resource = _resource AND period_start = _period;

  IF _resource = 'emails_monthly' THEN
    UPDATE public.workspace_usage_counters
       SET used = GREATEST(used - _amount, 0), updated_at = now()
     WHERE workspace_id = _workspace_id AND resource = 'emails_daily' AND period_start = _today;
  END IF;

  INSERT INTO public.usage_audit_log
    (workspace_id, resource, action, amount, allowed, period_start, reason)
  VALUES (_workspace_id, _resource, 'release', _amount, true, _period, _reason);
END;
$$;


--
-- Name: remove_workspace_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_workspace_member(_member_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ws uuid; target_role public.workspace_role; target_user uuid;
BEGIN
  SELECT workspace_id, role, user_id INTO ws, target_role, target_user
  FROM public.workspace_members WHERE id = _member_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF target_user <> auth.uid()
     AND NOT public.has_workspace_role(ws, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  IF target_role = 'owner' THEN RAISE EXCEPTION 'The workspace owner cannot be removed'; END IF;
  DELETE FROM public.workspace_members WHERE id = _member_id;
END; $$;


--
-- Name: repair_delivery_state(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.repair_delivery_state(_workspace_id uuid DEFAULT NULL::uuid, _since timestamp with time zone DEFAULT (now() - '30 days'::interval)) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  touched integer := 0;
BEGIN
  WITH ev AS (
    SELECT e.message_id,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'delivered')    AS delivered_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'opened')       AS opened_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'clicked')      AS clicked_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'bounced')      AS bounced_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'complained')   AS complained_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'unsubscribed') AS unsubscribed_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'failed')       AS failed_at,
      min(e.occurred_at) FILTER (WHERE e.event_type = 'replied')      AS replied_at,
      max(e.occurred_at)                                              AS last_event_at
    FROM public.email_engagement_events e
    WHERE e.message_id IS NOT NULL
      AND e.occurred_at >= _since
      AND (_workspace_id IS NULL OR e.workspace_id = _workspace_id)
    GROUP BY e.message_id
  ),
  upd AS (
    UPDATE public.campaign_messages m
    SET delivered_at    = coalesce(m.delivered_at, ev.delivered_at),
        opened_at       = coalesce(m.opened_at, ev.opened_at),
        clicked_at      = coalesce(m.clicked_at, ev.clicked_at),
        bounced_at      = coalesce(m.bounced_at, ev.bounced_at),
        complained_at   = coalesce(m.complained_at, ev.complained_at),
        unsubscribed_at = coalesce(m.unsubscribed_at, ev.unsubscribed_at),
        failed_at       = coalesce(m.failed_at, ev.failed_at),
        replied_at      = coalesce(m.replied_at, ev.replied_at),
        last_event_at   = greatest(coalesce(m.last_event_at, ev.last_event_at), ev.last_event_at),
        delivery_status = CASE
          WHEN coalesce(m.bounced_at, ev.bounced_at) IS NOT NULL THEN 'bounced'
          WHEN coalesce(m.failed_at, ev.failed_at) IS NOT NULL THEN 'failed'
          WHEN coalesce(m.complained_at, ev.complained_at) IS NOT NULL THEN 'complained'
          WHEN coalesce(m.unsubscribed_at, ev.unsubscribed_at) IS NOT NULL THEN 'unsubscribed'
          WHEN coalesce(m.replied_at, ev.replied_at) IS NOT NULL THEN 'replied'
          WHEN coalesce(m.clicked_at, ev.clicked_at) IS NOT NULL THEN 'clicked'
          WHEN coalesce(m.opened_at, ev.opened_at) IS NOT NULL THEN 'opened'
          WHEN coalesce(m.delivered_at, ev.delivered_at) IS NOT NULL THEN 'delivered'
          ELSE m.delivery_status END,
        reconciled_at = now()
    FROM ev
    WHERE m.id = ev.message_id
      AND (
        (m.delivered_at IS NULL AND ev.delivered_at IS NOT NULL) OR
        (m.opened_at IS NULL AND ev.opened_at IS NOT NULL) OR
        (m.clicked_at IS NULL AND ev.clicked_at IS NOT NULL) OR
        (m.bounced_at IS NULL AND ev.bounced_at IS NOT NULL) OR
        (m.complained_at IS NULL AND ev.complained_at IS NOT NULL) OR
        (m.unsubscribed_at IS NULL AND ev.unsubscribed_at IS NOT NULL) OR
        (m.failed_at IS NULL AND ev.failed_at IS NOT NULL) OR
        (m.replied_at IS NULL AND ev.replied_at IS NOT NULL)
      )
    RETURNING 1
  )
  SELECT count(*) INTO touched FROM upd;

  UPDATE public.campaign_messages m
  SET replied_at = r.received_at,
      last_event_at = greatest(coalesce(m.last_event_at, r.received_at), r.received_at)
  FROM public.campaign_replies r
  WHERE r.message_id = m.id
    AND m.replied_at IS NULL
    AND r.received_at >= _since
    AND (_workspace_id IS NULL OR m.workspace_id = _workspace_id);

  UPDATE public.campaign_messages m
  SET status = 'failed'
  WHERE m.status = 'sent'
    AND (m.bounced_at IS NOT NULL OR m.failed_at IS NOT NULL)
    AND (_workspace_id IS NULL OR m.workspace_id = _workspace_id);

  RETURN touched;
END;
$$;


--
-- Name: referral_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_profile_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount_cents integer NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    method text,
    destination_hint text,
    reference text,
    admin_notes text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.referral_payouts REPLICA IDENTITY FULL;


--
-- Name: request_referral_payout(integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_referral_payout(_amount_cents integer, _method text, _destination_hint text) RETURNS public.referral_payouts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  prof public.referral_profiles;
  prog public.referral_programs;
  available bigint;
  payout public.referral_payouts;
BEGIN
  SELECT * INTO prof FROM public.referral_profiles WHERE user_id = auth.uid();
  IF prof.id IS NULL THEN RAISE EXCEPTION 'Join the referral program first'; END IF;
  IF prof.status <> 'active' THEN RAISE EXCEPTION 'Your referral account is suspended'; END IF;

  SELECT * INTO prog FROM public.referral_programs WHERE singleton;
  IF NOT prog.enabled THEN RAISE EXCEPTION 'The referral program is currently disabled'; END IF;
  IF _method IS NULL OR NOT (_method = ANY (prog.payout_methods)) THEN
    RAISE EXCEPTION 'Choose one of the payout methods enabled by Sendloop';
  END IF;

  SELECT greatest(
    coalesce((SELECT sum(commission_amount_cents) FROM public.referral_commissions
              WHERE referral_profile_id = prof.id AND status = 'approved'), 0)
    - coalesce((SELECT sum(amount_cents) FROM public.referral_payouts
              WHERE referral_profile_id = prof.id AND status IN ('requested','under_review','approved','processing')), 0), 0)
  INTO available;

  IF _amount_cents <= 0 OR _amount_cents > available THEN
    RAISE EXCEPTION 'Requested amount exceeds your available balance';
  END IF;
  IF _amount_cents < prog.minimum_payout_cents THEN
    RAISE EXCEPTION 'Minimum payout is %', (prog.minimum_payout_cents / 100.0);
  END IF;

  INSERT INTO public.referral_payouts (referral_profile_id, user_id, amount_cents, method, destination_hint)
  VALUES (prof.id, auth.uid(), _amount_cents, _method, nullif(trim(coalesce(_destination_hint,'')), ''))
  RETURNING * INTO payout;

  UPDATE public.referral_profiles
  SET payout_method = _method, payout_destination_hint = payout.destination_hint
  WHERE id = prof.id;

  INSERT INTO public.referral_audit_logs (actor_id, actor_role, action, entity_type, entity_id, referral_profile_id, detail, metadata)
  VALUES (auth.uid(), 'customer', 'payout_requested', 'referral_payout', payout.id, prof.id,
          'Payout requested', jsonb_build_object('amount_cents', _amount_cents, 'method', _method));

  RETURN payout;
END; $$;


--
-- Name: resend_workspace_invitation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resend_workspace_invitation(_invitation_id uuid) RETURNS TABLE(id uuid, token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  ws uuid;
  new_token text := encode(extensions.gen_random_bytes(24), 'hex');
  last_sent timestamptz;
BEGIN
  SELECT workspace_id, updated_at INTO ws, last_sent
  FROM public.workspace_invitations WHERE workspace_invitations.id = _invitation_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.has_workspace_role(ws, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  IF last_sent > now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'This invitation was just sent. Please wait a couple of minutes before resending.';
  END IF;
  UPDATE public.workspace_invitations
  SET token = new_token, expires_at = now() + interval '14 days', status = 'pending'
  WHERE workspace_invitations.id = _invitation_id;
  RETURN QUERY SELECT _invitation_id, new_token;
END;
$$;


--
-- Name: revoke_workspace_invitation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_workspace_invitation(_invitation_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ws uuid;
BEGIN
  SELECT workspace_id INTO ws FROM public.workspace_invitations WHERE id = _invitation_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.has_workspace_role(ws, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  UPDATE public.workspace_invitations SET status = 'revoked' WHERE id = _invitation_id;
END; $$;


--
-- Name: run_ai_personalization_runner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_ai_personalization_runner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'ai_personalization_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-munchreach-signature', token),
    body := '{}'::jsonb
  );
END;
$$;


--
-- Name: run_automation_runner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_automation_runner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE cfg jsonb; base text; token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'automation_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sendloop-signature', token),
    body := jsonb_build_object('limit', coalesce((cfg ->> 'limit')::int, 50))
  );
END;
$$;


--
-- Name: run_campaign_scheduler(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_campaign_scheduler() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'campaign_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sendloop-signature', token),
    body := '{}'::jsonb
  );
END; $$;


--
-- Name: run_delivery_reconcile_runner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_delivery_reconcile_runner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'delivery_reconcile_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-munchreach-signature', token),
    body := '{}'::jsonb
  );
END;
$$;


--
-- Name: run_domain_recheck_runner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_domain_recheck_runner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'domain_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-munchreach-signature', token),
    body := '{}'::jsonb
  );
END;
$$;


--
-- Name: run_inbound_retry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_inbound_retry() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'inbound_retry_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sendloop-signature', token),
    body := '{}'::jsonb
  );
END; $$;


--
-- Name: run_lead_retention_cleanup(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_lead_retention_cleanup(_batch_size integer DEFAULT 500, _max_batches integer DEFAULT 40) RETURNS TABLE(out_workspace_id uuid, out_deleted_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  ws_id uuid;
  removed integer;
  total integer;
  loops integer;
  started timestamptz;
  any_found boolean := false;
BEGIN
  FOR ws_id IN
    SELECT l.workspace_id
    FROM public.leads l
    WHERE l.retention_expires_at <= now()
    GROUP BY l.workspace_id
  LOOP
    any_found := true;
    started := now();
    total := 0;
    loops := 0;
    BEGIN
      LOOP
        EXIT WHEN loops >= _max_batches;
        WITH doomed AS (
          SELECT l.id FROM public.leads l
          WHERE l.workspace_id = ws_id AND l.retention_expires_at <= now()
          ORDER BY l.retention_expires_at
          LIMIT _batch_size
        )
        DELETE FROM public.leads l USING doomed d
        WHERE l.id = d.id AND l.workspace_id = ws_id;
        GET DIAGNOSTICS removed = ROW_COUNT;
        total := total + removed;
        loops := loops + 1;
        EXIT WHEN removed = 0;
      END LOOP;

      INSERT INTO public.lead_retention_runs
        (workspace_id, deleted_count, batches, status, started_at, finished_at)
      VALUES (ws_id, total, loops, 'success', started, now());
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.lead_retention_runs
        (workspace_id, deleted_count, batches, status, error, started_at, finished_at)
      VALUES (ws_id, total, loops, 'error', SQLERRM, started, now());
    END;

    out_workspace_id := ws_id;
    out_deleted_count := total;
    RETURN NEXT;
  END LOOP;

  IF NOT any_found THEN
    INSERT INTO public.lead_retention_runs (workspace_id, deleted_count, batches, status)
    VALUES (NULL, 0, 0, 'idle');
  END IF;
END;
$$;


--
-- Name: run_provider_health_runner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_provider_health_runner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'provider_health_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-munchreach-signature', token),
    body := '{}'::jsonb
  );
END;
$$;


--
-- Name: run_transactional_email_runner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_transactional_email_runner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'transactional_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sendloop-signature', token),
    body := jsonb_build_object('limit', coalesce((cfg ->> 'limit')::int, 25))
  );
END;
$$;


--
-- Name: run_warmup_runner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_warmup_runner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cfg jsonb;
  base text;
  token text;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'warmup_runner';
  IF cfg IS NULL THEN RETURN; END IF;
  base := cfg ->> 'url';
  token := cfg ->> 'token';
  IF base IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := base,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sendloop-signature', token),
    body := jsonb_build_object('limit', coalesce((cfg ->> 'limit')::int, 25))
  );
END;
$$;


--
-- Name: seed_workspace_crm_stages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_workspace_crm_stages() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.ensure_crm_stages(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: sending_account_stats(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sending_account_stats(_account_ids uuid[]) RETURNS TABLE(account_id uuid, sent bigint, delivered bigint, bounced bigint, complained bigint, replies bigint, last_sent_at timestamp with time zone, last_reply_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if _account_ids is null or array_length(_account_ids, 1) is null then
    return;
  end if;

  -- Only accounts in workspaces the caller belongs to are ever reported on.
  return query
  with allowed as (
    select sa.id
    from public.sending_accounts sa
    where sa.id = any(_account_ids)
      and sa.workspace_id is not null
      and public.is_workspace_member(sa.workspace_id, auth.uid())
  ),
  msg as (
    select m.sending_account_id as id,
           count(*) filter (where m.status = 'sent') as sent,
           max(m.sent_at) as last_sent_at
    from public.campaign_messages m
    join allowed a on a.id = m.sending_account_id
    group by m.sending_account_id
  ),
  ev as (
    select e.sending_account_id as id,
           count(*) filter (where e.event_type in ('delivered', 'email.delivered')) as delivered,
           count(*) filter (where e.event_type like '%bounce%') as bounced,
           count(*) filter (where e.event_type like '%complain%' or e.event_type like '%spam%') as complained
    from public.email_events e
    join allowed a on a.id = e.sending_account_id
    group by e.sending_account_id
  ),
  rep as (
    select r.sending_account_id as id,
           count(*) as replies,
           max(r.received_at) as last_reply_at
    from public.campaign_replies r
    join allowed a on a.id = r.sending_account_id
    group by r.sending_account_id
  )
  select a.id,
         coalesce(msg.sent, 0),
         coalesce(ev.delivered, 0),
         coalesce(ev.bounced, 0),
         coalesce(ev.complained, 0),
         coalesce(rep.replies, 0),
         msg.last_sent_at,
         rep.last_reply_at
  from allowed a
  left join msg on msg.id = a.id
  left join ev on ev.id = a.id
  left join rep on rep.id = a.id;
end;
$$;


--
-- Name: set_lead_retention(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_lead_retention() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.retention_expires_at := COALESCE(NEW.created_at, now()) + interval '60 days';
  RETURN NEW;
END;
$$;


--
-- Name: set_sending_account_enabled(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sending_account_enabled(_account_id uuid, _enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.sending_accounts sa
    where sa.id = _account_id
      and sa.workspace_id is not null
      and public.has_workspace_role(
        sa.workspace_id, auth.uid(),
        array['owner','admin','campaign_manager']::public.workspace_role[]
      )
  ) then
    raise exception 'Not authorized for this sending account';
  end if;

  update public.sending_accounts
  set customer_enabled = _enabled, updated_at = now()
  where id = _account_id;

  insert into public.sending_account_audit (workspace_id, sending_account_id, actor_id, action, detail)
  select sa.workspace_id, sa.id, auth.uid(),
         case when _enabled then 'resume' else 'pause' end,
         case when _enabled then 'Sending resumed for ' || sa.from_email
              else 'Sending paused for ' || sa.from_email end
  from public.sending_accounts sa where sa.id = _account_id;
end; $$;


--
-- Name: set_sending_accounts_paused(uuid[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sending_accounts_paused(_account_ids uuid[], _paused boolean) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare affected integer;
begin
  if _account_ids is null or array_length(_account_ids, 1) is null then return 0; end if;
  if exists (
    select 1 from public.sending_accounts sa
    where sa.id = any(_account_ids)
      and (sa.workspace_id is null
        or not public.has_workspace_role(sa.workspace_id, auth.uid(),
             array['owner','admin','campaign_manager']::public.workspace_role[]))
  ) then raise exception 'Not authorized for one or more sending accounts'; end if;
  update public.sending_accounts set customer_enabled = not _paused, updated_at = now()
  where id = any(_account_ids);
  insert into public.sending_account_audit (workspace_id, sending_account_id, actor_id, action, detail)
  select sa.workspace_id, sa.id, auth.uid(),
         case when _paused then 'pause' else 'resume' end,
         case when _paused then 'Sending paused for ' || sa.from_email
              else 'Sending resumed for ' || sa.from_email end
  from public.sending_accounts sa
  where sa.id = any(_account_ids) and sa.workspace_id is not null;
  select count(*) into affected from public.sending_accounts where id = any(_account_ids);
  return affected;
end; $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: touch_workspace_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_workspace_activity(_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.workspace_members SET last_active_at = now()
  WHERE workspace_id = _workspace_id AND user_id = auth.uid();
END; $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_workspace_member_role(uuid, public.workspace_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_workspace_member_role(_member_id uuid, _role public.workspace_role) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ws uuid; current_role public.workspace_role;
BEGIN
  SELECT workspace_id, role INTO ws, current_role FROM public.workspace_members WHERE id = _member_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT public.has_workspace_role(ws, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can change roles';
  END IF;
  IF current_role = 'owner' THEN RAISE EXCEPTION 'The workspace owner role cannot be changed'; END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'Ownership cannot be assigned here'; END IF;
  UPDATE public.workspace_members SET role = _role WHERE id = _member_id;
END; $$;


--
-- Name: update_workspace_settings(uuid, text, text, text, text, text, smallint[], smallint, smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_workspace_settings(_workspace_id uuid, _name text, _slug text, _logo_url text, _timezone text, _sending_timezone text, _send_days smallint[], _send_start_hour smallint, _send_end_hour smallint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE clean_slug text := lower(regexp_replace(coalesce(_slug,''), '[^a-zA-Z0-9]+', '-', 'g'));
BEGIN
  IF NOT public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can change workspace settings';
  END IF;
  clean_slug := trim(both '-' from clean_slug);
  IF length(coalesce(trim(_name), '')) < 2 THEN RAISE EXCEPTION 'Workspace name is too short'; END IF;
  IF length(clean_slug) < 3 THEN RAISE EXCEPTION 'Workspace URL must be at least 3 characters'; END IF;
  IF EXISTS (SELECT 1 FROM public.workspaces w WHERE w.slug = clean_slug AND w.id <> _workspace_id) THEN
    RAISE EXCEPTION 'That workspace URL is already taken';
  END IF;
  IF _send_end_hour <= _send_start_hour THEN RAISE EXCEPTION 'Sending window end must be after the start'; END IF;

  UPDATE public.workspaces
  SET name = trim(_name), slug = clean_slug, logo_url = nullif(trim(coalesce(_logo_url,'')), ''),
      timezone = coalesce(nullif(trim(coalesce(_timezone,'')), ''), 'UTC'),
      sending_timezone = nullif(trim(coalesce(_sending_timezone,'')), ''),
      send_days = coalesce(_send_days, send_days),
      send_start_hour = _send_start_hour, send_end_hour = _send_end_hour
  WHERE id = _workspace_id;
END; $$;


--
-- Name: validate_testimonial(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_testimonial() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  IF NEW.category NOT IN ('agency','saas','sales','recruiting','consulting','other') THEN
    RAISE EXCEPTION 'Unknown review category %', NEW.category;
  END IF;
  IF NEW.reviewed_on > current_date THEN
    RAISE EXCEPTION 'Review date cannot be in the future';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: workspace_team(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workspace_team(_workspace_id uuid) RETURNS TABLE(row_id uuid, kind text, user_id uuid, email text, full_name text, avatar_url text, role text, status text, joined_at timestamp with time zone, last_active_at timestamp with time zone, invited_by_email text, expires_at timestamp with time zone, message text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  RETURN QUERY
  SELECT m.id, 'member'::text, m.user_id, p.email, p.full_name, p.avatar_url,
         m.role::text, 'active'::text, m.created_at, m.last_active_at,
         NULL::text, NULL::timestamptz, NULL::text
  FROM public.workspace_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.workspace_id = _workspace_id
  UNION ALL
  SELECT i.id, 'invitation'::text, NULL::uuid, i.email, NULL::text, NULL::text,
         i.role::text, i.status, i.created_at, NULL::timestamptz,
         pi.email, i.expires_at, i.message
  FROM public.workspace_invitations i
  LEFT JOIN public.profiles pi ON pi.id = i.invited_by
  WHERE i.workspace_id = _workspace_id AND i.status = 'pending'
    AND public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
  ORDER BY 9;
END; $$;


--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    target_label text,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    channel text NOT NULL,
    destination text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    response_code integer,
    duration_ms integer,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_runner_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_runner_state (
    key text NOT NULL,
    locked_by text,
    locked_until timestamp with time zone,
    paused_reason text,
    paused_at timestamp with time zone,
    last_run_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    event_type text NOT NULL,
    idempotency_key text NOT NULL,
    lead_id uuid,
    campaign_id uuid,
    conversation_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    matched_automations integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automation_run_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_run_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    step_id uuid,
    "position" integer NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    status text NOT NULL,
    output jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT automation_run_steps_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'skipped'::text, 'waiting'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.automation_run_steps REPLICA IDENTITY FULL;


--
-- Name: automation_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    automation_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    "position" integer NOT NULL,
    kind text NOT NULL,
    branch text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT automation_steps_branch_check CHECK ((branch = ANY (ARRAY['yes'::text, 'no'::text]))),
    CONSTRAINT automation_steps_kind_check CHECK ((kind = ANY (ARRAY['condition'::text, 'action'::text, 'wait'::text, 'branch'::text])))
);


--
-- Name: automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    trigger_type text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    condition_logic text DEFAULT 'and'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    webhook_token text,
    webhook_secret text,
    last_run_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT automations_condition_logic_check CHECK ((condition_logic = ANY (ARRAY['and'::text, 'or'::text]))),
    CONSTRAINT automations_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.automations REPLICA IDENTITY FULL;


--
-- Name: billing_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    user_id uuid,
    provider public.billing_provider,
    environment public.billing_environment,
    event_id text,
    action text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    provider public.billing_provider NOT NULL,
    environment public.billing_environment NOT NULL,
    external_customer_id text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    subscription_id uuid,
    provider public.billing_provider NOT NULL,
    environment public.billing_environment NOT NULL,
    external_invoice_id text NOT NULL,
    number text,
    amount_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    status text DEFAULT 'paid'::text NOT NULL,
    hosted_url text,
    pdf_url text,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_plan_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_plan_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    provider public.billing_provider NOT NULL,
    environment public.billing_environment NOT NULL,
    billing_interval public.billing_interval NOT NULL,
    external_price_id text NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_provider_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_provider_secrets (
    provider text NOT NULL,
    environment text NOT NULL,
    ciphertext text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_provider_secrets_environment_check CHECK ((environment = ANY (ARRAY['test'::text, 'live'::text])))
);


--
-- Name: billing_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider public.billing_provider NOT NULL,
    environment public.billing_environment NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    public_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_payment_at timestamp with time zone,
    last_webhook_at timestamp with time zone,
    last_error text,
    last_error_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    plan_id uuid,
    provider public.billing_provider NOT NULL,
    environment public.billing_environment NOT NULL,
    external_subscription_id text NOT NULL,
    external_customer_id text,
    status public.billing_sub_status DEFAULT 'active'::public.billing_sub_status NOT NULL,
    billing_interval public.billing_interval DEFAULT 'monthly'::public.billing_interval NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    trial_ends_at timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    cancelled_at timestamp with time zone,
    access_until timestamp with time zone,
    grace_until timestamp with time zone,
    last_event_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    manual_override boolean DEFAULT false NOT NULL,
    manual_assigned_by uuid,
    manual_assigned_at timestamp with time zone,
    manual_note text,
    pending_plan_id uuid,
    pending_interval public.billing_interval,
    pending_effective_at timestamp with time zone
);


--
-- Name: billing_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    subscription_id uuid,
    plan_id uuid,
    provider public.billing_provider NOT NULL,
    environment public.billing_environment NOT NULL,
    external_transaction_id text NOT NULL,
    provider_event_id text,
    kind text DEFAULT 'payment'::text NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    status text DEFAULT 'succeeded'::text NOT NULL,
    description text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider public.billing_provider NOT NULL,
    environment public.billing_environment NOT NULL,
    event_id text NOT NULL,
    event_type text,
    signature_ok boolean DEFAULT false NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    http_status integer,
    retry_count integer DEFAULT 0 NOT NULL,
    error text,
    payload jsonb,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: blog_authors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_authors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    bio text DEFAULT ''::text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    storage_path text NOT NULL,
    public_url text NOT NULL,
    file_name text NOT NULL,
    mime_type text DEFAULT 'image/png'::text NOT NULL,
    size_bytes integer DEFAULT 0 NOT NULL,
    alt_text text DEFAULT ''::text NOT NULL,
    caption text DEFAULT ''::text NOT NULL,
    folder text DEFAULT 'library'::text NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_post_slugs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_post_slugs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    subtitle text DEFAULT ''::text NOT NULL,
    excerpt text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    cover_image_url text,
    category_id uuid,
    author_id uuid,
    content_type public.blog_content_type DEFAULT 'article'::public.blog_content_type NOT NULL,
    status public.blog_post_status DEFAULT 'draft'::public.blog_post_status NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    popular_guide boolean DEFAULT false NOT NULL,
    reading_minutes smallint DEFAULT 5 NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    seo_title text,
    meta_description text,
    canonical_url text,
    og_image_url text,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    content_format text DEFAULT 'markdown'::text NOT NULL,
    CONSTRAINT blog_posts_content_format_check CHECK ((content_format = ANY (ARRAY['markdown'::text, 'html'::text])))
);


--
-- Name: campaign_launch_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_launch_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    actor_id uuid,
    outcome text DEFAULT 'checked'::text NOT NULL,
    ready boolean DEFAULT false NOT NULL,
    issues jsonb DEFAULT '[]'::jsonb NOT NULL,
    list_id uuid,
    list_name text,
    eligible integer DEFAULT 0 NOT NULL,
    already_queued integer DEFAULT 0 NOT NULL,
    audience integer DEFAULT 0 NOT NULL,
    active_mailboxes integer DEFAULT 0 NOT NULL,
    queued_messages integer DEFAULT 0 NOT NULL,
    total_recipients integer DEFAULT 0 NOT NULL,
    first_send_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaign_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    recipient_id uuid,
    lead_id uuid,
    step_id uuid,
    variant_id uuid,
    sending_account_id uuid,
    step_order smallint DEFAULT 1 NOT NULL,
    status public.message_status DEFAULT 'pending'::public.message_status NOT NULL,
    to_email text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    provider text,
    provider_message_id text,
    last_error text,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_status text DEFAULT 'queued'::text NOT NULL,
    delivery_detail text,
    delivered_at timestamp with time zone,
    delayed_at timestamp with time zone,
    bounced_at timestamp with time zone,
    complained_at timestamp with time zone,
    unsubscribed_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    replied_at timestamp with time zone,
    failed_at timestamp with time zone,
    last_event_at timestamp with time zone,
    reconciled_at timestamp with time zone,
    message_type text DEFAULT 'campaign'::text NOT NULL,
    CONSTRAINT campaign_messages_message_type_check CHECK ((message_type = ANY (ARRAY['campaign'::text, 'transactional'::text, 'manual_reply'::text, 'admin_diagnostic'::text])))
);

ALTER TABLE ONLY public.campaign_messages REPLICA IDENTITY FULL;


--
-- Name: campaign_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    sending_account_id uuid,
    current_step smallint DEFAULT 0 NOT NULL,
    status public.recipient_status DEFAULT 'pending'::public.recipient_status NOT NULL,
    next_send_at timestamp with time zone,
    last_sent_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.campaign_recipients REPLICA IDENTITY FULL;


--
-- Name: campaign_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid,
    message_id uuid,
    lead_id uuid,
    sending_account_id uuid,
    from_email text NOT NULL,
    to_email text,
    subject text,
    body text,
    sentiment text DEFAULT 'neutral'::text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.campaign_replies REPLICA IDENTITY FULL;


--
-- Name: campaign_step_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_step_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    step_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    label text DEFAULT 'A'::text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    weight smallint DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaign_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    step_order smallint NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    wait_days smallint DEFAULT 0 NOT NULL,
    wait_hours smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    step_type text DEFAULT 'email'::text NOT NULL,
    delay_minutes smallint DEFAULT 0 NOT NULL,
    same_thread boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: campaign_test_sends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_test_sends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    sending_account_id uuid,
    requested_by uuid NOT NULL,
    recipient_email text NOT NULL,
    provider text NOT NULL,
    provider_message_id text,
    provider_response text,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    webhook_event_id uuid,
    webhook_status text,
    webhook_event_type text,
    webhook_received_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_test_sends_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'error'::text])))
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    list_id uuid,
    sending_account_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    send_days smallint[] DEFAULT '{1,2,3,4,5}'::smallint[] NOT NULL,
    send_start_hour smallint DEFAULT 9 NOT NULL,
    send_end_hour smallint DEFAULT 17 NOT NULL,
    daily_cap integer DEFAULT 100 NOT NULL,
    stop_on_reply boolean DEFAULT true NOT NULL,
    status public.campaign_status DEFAULT 'draft'::public.campaign_status NOT NULL,
    launched_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    min_delay_minutes smallint DEFAULT 5 NOT NULL,
    random_delay_minutes smallint DEFAULT 10 NOT NULL,
    max_per_hour integer DEFAULT 60 NOT NULL,
    business_days_only boolean DEFAULT false NOT NULL,
    open_tracking boolean DEFAULT true NOT NULL,
    click_tracking boolean DEFAULT true NOT NULL,
    text_only boolean DEFAULT false NOT NULL,
    stop_on_company_reply boolean DEFAULT false NOT NULL,
    max_contacts_per_company smallint DEFAULT 0 NOT NULL,
    unsubscribe_enabled boolean DEFAULT true NOT NULL,
    inbox_rotation_enabled boolean DEFAULT true NOT NULL,
    inbox_rotation_strategy text DEFAULT 'round_robin'::text NOT NULL,
    rotation_daily_cap_per_inbox integer DEFAULT 0 NOT NULL,
    custom_variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    eligible_count integer DEFAULT 0 NOT NULL,
    audience_count integer DEFAULT 0 NOT NULL,
    readiness_ready boolean DEFAULT false NOT NULL,
    readiness_issues jsonb DEFAULT '[]'::jsonb NOT NULL,
    readiness_checked_at timestamp with time zone,
    ai_enabled boolean DEFAULT false NOT NULL,
    ai_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT campaigns_inbox_rotation_strategy_check CHECK ((inbox_rotation_strategy = ANY (ARRAY['round_robin'::text, 'random'::text, 'least_used'::text])))
);


--
-- Name: conversation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    type text NOT NULL,
    detail text,
    actor_id uuid,
    dedupe_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.conversation_events REPLICA IDENTITY FULL;


--
-- Name: conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    direction text NOT NULL,
    from_email text NOT NULL,
    from_name text,
    to_email text NOT NULL,
    cc_emails text[] DEFAULT '{}'::text[] NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    html text,
    message_id text,
    in_reply_to text,
    reference_ids text[] DEFAULT '{}'::text[] NOT NULL,
    campaign_message_id uuid,
    sending_account_id uuid,
    provider_message_id text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bcc_emails text[] DEFAULT '{}'::text[] NOT NULL,
    delivery_status text DEFAULT 'sent'::text NOT NULL,
    delivery_detail text,
    delivered_at timestamp with time zone,
    CONSTRAINT conversation_messages_direction_check CHECK ((direction = ANY (ARRAY['outbound'::text, 'inbound'::text])))
);

ALTER TABLE ONLY public.conversation_messages REPLICA IDENTITY FULL;


--
-- Name: conversation_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    mentions uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    lead_id uuid,
    campaign_id uuid,
    sending_account_id uuid,
    thread_key text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    prospect_email text NOT NULL,
    status text DEFAULT 'lead'::text NOT NULL,
    assigned_to uuid,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    unread boolean DEFAULT true NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    snoozed_until timestamp with time zone,
    message_count integer DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    last_direction text DEFAULT 'outbound'::text NOT NULL,
    last_preview text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    has_outbound boolean DEFAULT false NOT NULL,
    has_inbound boolean DEFAULT false NOT NULL,
    last_inbound_at timestamp with time zone,
    CONSTRAINT conversations_status_check CHECK ((status = ANY (ARRAY['lead'::text, 'interested'::text, 'meeting_booked'::text, 'meeting_completed'::text, 'won'::text, 'not_interested'::text, 'ooo'::text, 'unsubscribed'::text, 'bounced'::text])))
);

ALTER TABLE ONLY public.conversations REPLICA IDENTITY FULL;


--
-- Name: crm_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    color text DEFAULT 'slate'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_won boolean DEFAULT false NOT NULL,
    is_lost boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.crm_stages REPLICA IDENTITY FULL;


--
-- Name: domain_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.domain_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    domain_id uuid NOT NULL,
    kind text NOT NULL,
    severity text DEFAULT 'critical'::text NOT NULL,
    title text NOT NULL,
    detail text,
    records text[] DEFAULT '{}'::text[] NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT domain_alerts_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'warning'::text, 'info'::text])))
);


--
-- Name: email_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    conversation_id uuid,
    lead_id uuid,
    sending_account_id uuid,
    to_email text DEFAULT ''::text NOT NULL,
    cc_emails text[] DEFAULT '{}'::text[] NOT NULL,
    bcc_emails text[] DEFAULT '{}'::text[] NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_engagement_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_engagement_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid,
    sending_account_id uuid,
    message_id uuid,
    lead_id uuid,
    recipient_email text,
    event_type text NOT NULL,
    provider text,
    provider_message_id text,
    external_id text,
    url text,
    detail text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.email_engagement_events REPLICA IDENTITY FULL;


--
-- Name: email_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text DEFAULT 'unknown'::text NOT NULL,
    event_type text DEFAULT 'inbound'::text NOT NULL,
    external_id text,
    workspace_id uuid,
    sending_account_id uuid,
    lead_id uuid,
    conversation_id uuid,
    message_id text,
    from_email text,
    to_email text,
    subject text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    signature_status text DEFAULT 'unverified'::text NOT NULL,
    signature_detail text,
    routing_token text,
    token_status text,
    failure_code text,
    duplicate_count integer DEFAULT 0 NOT NULL,
    last_retry_at timestamp with time zone,
    message_type text
);


--
-- Name: email_provider_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_provider_secrets (
    provider_id uuid NOT NULL,
    credentials_ciphertext text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider public.sending_provider NOT NULL,
    name text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    priority smallint DEFAULT 100 NOT NULL,
    daily_capacity integer DEFAULT 1000 NOT NULL,
    hourly_capacity integer DEFAULT 200 NOT NULL,
    cost_per_1k_cents integer DEFAULT 0 NOT NULL,
    status public.connection_status DEFAULT 'untested'::public.connection_status NOT NULL,
    last_tested_at timestamp with time zone,
    last_error text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reply_to_email text,
    mode text DEFAULT 'live'::text NOT NULL,
    region text,
    health_status text DEFAULT 'unknown'::text NOT NULL,
    health_checked_at timestamp with time zone,
    health_detail text,
    last_success_at timestamp with time zone,
    success_count integer DEFAULT 0 NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    sent_hour integer DEFAULT 0 NOT NULL,
    sent_day integer DEFAULT 0 NOT NULL,
    usage_hour timestamp with time zone,
    usage_day date,
    health_reason text,
    last_failure_at timestamp with time zone,
    last_http_status integer,
    CONSTRAINT email_providers_health_check CHECK ((health_status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'down'::text, 'unknown'::text]))),
    CONSTRAINT email_providers_mode_check CHECK ((mode = ANY (ARRAY['sandbox'::text, 'live'::text])))
);


--
-- Name: email_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_suppressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    email text NOT NULL,
    reason text DEFAULT 'bounced'::text NOT NULL,
    source text DEFAULT 'webhook'::text NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    is_official boolean DEFAULT false NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'Cold Outreach'::text NOT NULL,
    description text,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    variables text[] DEFAULT '{}'::text[] NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    published boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_templates_ownership CHECK (((is_official AND (workspace_id IS NULL)) OR ((NOT is_official) AND (workspace_id IS NOT NULL))))
);


--
-- Name: guide_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guide_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text DEFAULT 'Getting Started'::text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    published boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inbound_event_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbound_event_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    actor_id uuid,
    actor_email text,
    action text NOT NULL,
    previous_status text,
    result_status text NOT NULL,
    outcome text NOT NULL,
    conversation_id uuid,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inbound_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbound_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    workspace_id uuid NOT NULL,
    sending_account_id uuid,
    lead_id uuid,
    campaign_id uuid,
    conversation_id uuid,
    purpose text DEFAULT 'campaign'::text NOT NULL,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inbound_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbound_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid NOT NULL,
    to_email text NOT NULL,
    sending_account_id uuid,
    reply_to text NOT NULL,
    token text,
    provider_message_id text,
    status text DEFAULT 'sent'::text NOT NULL,
    error text,
    conversation_id uuid,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    replied_at timestamp with time zone
);


--
-- Name: integration_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'connected'::text NOT NULL,
    account_label text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    last_synced_at timestamp with time zone,
    last_event_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integration_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    connection_id uuid,
    slug text NOT NULL,
    direction text DEFAULT 'outbound'::text NOT NULL,
    event_type text NOT NULL,
    status text DEFAULT 'success'::text NOT NULL,
    message text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integration_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_secrets (
    connection_id uuid NOT NULL,
    credentials_ciphertext text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integration_sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_sync_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    connection_id uuid,
    slug text NOT NULL,
    action text NOT NULL,
    status text DEFAULT 'success'::text NOT NULL,
    records integer DEFAULT 0 NOT NULL,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    slug text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    tagline text DEFAULT ''::text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    requires_paid_plan boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid,
    type text NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.lead_activities REPLICA IDENTITY FULL;


--
-- Name: lead_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.lead_notes REPLICA IDENTITY FULL;


--
-- Name: lead_retention_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_retention_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    deleted_count integer DEFAULT 0 NOT NULL,
    batches integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'success'::text NOT NULL,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    created_by uuid NOT NULL,
    title text NOT NULL,
    due_at timestamp with time zone,
    completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.lead_tasks REPLICA IDENTITY FULL;


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    list_id uuid,
    email text NOT NULL,
    first_name text,
    last_name text,
    company text,
    job_title text,
    phone text,
    website text,
    country text,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    city text,
    state text,
    crm_stage text DEFAULT 'none'::text NOT NULL,
    last_activity_at timestamp with time zone,
    linkedin_url text,
    stage_id uuid,
    owner_id uuid,
    lead_source text,
    deal_value numeric(12,2),
    archived boolean DEFAULT false NOT NULL,
    retention_expires_at timestamp with time zone DEFAULT (now() + '60 days'::interval) NOT NULL
);

ALTER TABLE ONLY public.leads REPLICA IDENTITY FULL;


--
-- Name: newsletter_subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    source text DEFAULT 'blog'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    new_replies boolean DEFAULT true NOT NULL,
    campaign_completed boolean DEFAULT true NOT NULL,
    bounce_alerts boolean DEFAULT true NOT NULL,
    deliverability_alerts boolean DEFAULT true NOT NULL,
    warmup_alerts boolean DEFAULT true NOT NULL,
    team_activity boolean DEFAULT true NOT NULL,
    support_updates boolean DEFAULT true NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    in_app_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    referral_updates boolean DEFAULT true NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid,
    type text DEFAULT 'system'::text NOT NULL,
    title text NOT NULL,
    message text,
    entity_type text,
    entity_id uuid,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;


--
-- Name: outbound_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbound_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_message_id text NOT NULL,
    message_type text NOT NULL,
    provider text,
    workspace_id uuid,
    sending_account_id uuid,
    to_email text,
    ref_table text,
    ref_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outbound_messages_message_type_check CHECK ((message_type = ANY (ARRAY['campaign'::text, 'warmup'::text, 'transactional'::text, 'admin_diagnostic'::text, 'manual_reply'::text])))
);


--
-- Name: plan_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_features (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    category text DEFAULT 'General'::text NOT NULL,
    name text NOT NULL,
    included boolean DEFAULT true NOT NULL,
    value text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    feature_key text
);


--
-- Name: plan_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    granted_by uuid,
    revoked_by uuid,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_grants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    tagline text,
    sort_order integer DEFAULT 0 NOT NULL,
    monthly_price integer DEFAULT 0 NOT NULL,
    yearly_price integer DEFAULT 0 NOT NULL,
    is_popular boolean DEFAULT false NOT NULL,
    is_enterprise boolean DEFAULT false NOT NULL,
    max_workspaces integer,
    max_users integer,
    max_leads integer,
    max_campaigns integer,
    max_emails_monthly integer,
    max_sending_accounts integer,
    warmup_enabled boolean DEFAULT false NOT NULL,
    unified_inbox_enabled boolean DEFAULT true NOT NULL,
    analytics_enabled boolean DEFAULT true NOT NULL,
    api_access boolean DEFAULT false NOT NULL,
    priority_support boolean DEFAULT false NOT NULL,
    custom_branding boolean DEFAULT false NOT NULL,
    sso_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_automations integer,
    is_active boolean DEFAULT true NOT NULL,
    monthly_credits integer DEFAULT 0 NOT NULL,
    max_domains integer,
    max_active_campaigns integer,
    max_ai_monthly integer,
    trial_days integer DEFAULT 0 NOT NULL,
    max_emails_daily integer,
    max_warmup_daily integer
);


--
-- Name: platform_announcement_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_announcement_dismissals (
    announcement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    level text DEFAULT 'info'::text NOT NULL,
    audience text DEFAULT 'customer'::text NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    dismissible boolean DEFAULT true NOT NULL,
    cta_label text,
    cta_url text,
    enabled boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_announcements_audience_check CHECK ((audience = ANY (ARRAY['customer'::text, 'admin'::text, 'all'::text]))),
    CONSTRAINT platform_announcements_level_check CHECK ((level = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])))
);


--
-- Name: platform_feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_feature_flags (
    key text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    environment text DEFAULT 'all'::text NOT NULL,
    rollout_percentage integer DEFAULT 100 NOT NULL,
    audience text DEFAULT 'customer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT platform_feature_flags_audience_check CHECK ((audience = ANY (ARRAY['customer'::text, 'admin'::text]))),
    CONSTRAINT platform_feature_flags_environment_check CHECK ((environment = ANY (ARRAY['all'::text, 'production'::text, 'preview'::text]))),
    CONSTRAINT platform_feature_flags_rollout_percentage_check CHECK (((rollout_percentage >= 0) AND (rollout_percentage <= 100)))
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: privacy_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.privacy_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    company text,
    request_type text NOT NULL,
    details text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    admin_notes text,
    handled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    theme text DEFAULT 'system'::text NOT NULL,
    timezone text,
    onboarding_completed boolean DEFAULT false NOT NULL,
    first_name text,
    last_name text,
    display_name text
);


--
-- Name: provider_health_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_health_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    operation text NOT NULL,
    ok boolean NOT NULL,
    http_status integer,
    error_code text,
    message text,
    domain text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_routing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_routing_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid,
    previous_provider_id uuid,
    domain_id uuid,
    domain text,
    workspace_id uuid,
    event text NOT NULL,
    reason text,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referral_attributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_attributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_profile_id uuid NOT NULL,
    referrer_user_id uuid NOT NULL,
    referred_user_id uuid NOT NULL,
    referred_workspace_id uuid,
    code text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    program_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    signed_up_at timestamp with time zone DEFAULT now() NOT NULL,
    converted_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.referral_attributions REPLICA IDENTITY FULL;


--
-- Name: referral_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    actor_role text DEFAULT 'system'::text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    referral_profile_id uuid,
    workspace_id uuid,
    detail text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referral_billing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_billing_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result text,
    error text,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referral_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_clicks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_profile_id uuid,
    code text NOT NULL,
    ip_hash text,
    user_agent text,
    referer text,
    landing_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.referral_clicks REPLICA IDENTITY FULL;


--
-- Name: referral_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attribution_id uuid NOT NULL,
    referral_profile_id uuid NOT NULL,
    referrer_user_id uuid NOT NULL,
    referred_user_id uuid NOT NULL,
    referred_workspace_id uuid,
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    subscription_id text,
    payment_id text,
    plan_name text,
    amount_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    commission_type text NOT NULL,
    commission_rate numeric(6,3) DEFAULT 0 NOT NULL,
    commission_amount_cents integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payout_id uuid,
    reversal_of uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    paid_at timestamp with time zone,
    reversed_at timestamp with time zone
);

ALTER TABLE ONLY public.referral_commissions REPLICA IDENTITY FULL;


--
-- Name: referral_fraud_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_fraud_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_profile_id uuid,
    attribution_id uuid,
    reason text NOT NULL,
    severity text DEFAULT 'warning'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone
);

ALTER TABLE ONLY public.referral_fraud_flags REPLICA IDENTITY FULL;


--
-- Name: referral_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    singleton boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    commission_type text DEFAULT 'percentage'::text NOT NULL,
    commission_percent numeric(6,3) DEFAULT 0 NOT NULL,
    commission_fixed_cents integer DEFAULT 0 NOT NULL,
    recurring boolean DEFAULT false NOT NULL,
    commission_duration_months integer DEFAULT 12 NOT NULL,
    minimum_payout_cents integer DEFAULT 5000 NOT NULL,
    attribution_window_days integer DEFAULT 60 NOT NULL,
    approval_mode text DEFAULT 'manual'::text NOT NULL,
    approval_delay_days integer DEFAULT 30 NOT NULL,
    refund_policy text DEFAULT 'reverse'::text NOT NULL,
    payout_schedule text DEFAULT 'monthly'::text NOT NULL,
    payout_methods text[] DEFAULT ARRAY['paypal'::text, 'bank_transfer'::text] NOT NULL,
    payout_provider_configured boolean DEFAULT false NOT NULL,
    eligibility text DEFAULT 'Any Sendloop account in good standing can join the referral program.'::text NOT NULL,
    terms text DEFAULT ''::text NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referral_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text DEFAULT 'unknown'::text NOT NULL,
    event_id text,
    event_type text,
    signature_ok boolean DEFAULT false NOT NULL,
    status_code integer DEFAULT 200 NOT NULL,
    result text,
    error text,
    source_ip_hash text,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.referral_webhook_events REPLICA IDENTITY FULL;


--
-- Name: sending_account_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sending_account_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    sending_account_id uuid,
    actor_id uuid,
    action text NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sending_account_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sending_account_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    sending_account_id uuid NOT NULL,
    actor_id uuid,
    kind text NOT NULL,
    ok boolean NOT NULL,
    provider text,
    status_code integer,
    message text,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sending_account_checks_kind_check CHECK ((kind = ANY (ARRAY['connect'::text, 'reconnect'::text, 'test'::text, 'send'::text, 'warmup_send'::text])))
);


--
-- Name: sending_account_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sending_account_secrets (
    sending_account_id uuid NOT NULL,
    credentials_ciphertext text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sending_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sending_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    provider public.sending_provider NOT NULL,
    label text NOT NULL,
    from_name text NOT NULL,
    from_email text NOT NULL,
    reply_to text,
    daily_limit integer DEFAULT 50 NOT NULL,
    status public.connection_status DEFAULT 'untested'::public.connection_status NOT NULL,
    last_tested_at timestamp with time zone,
    last_error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_id uuid,
    hourly_limit integer DEFAULT 20 NOT NULL,
    sent_today integer DEFAULT 0 NOT NULL,
    health_score smallint DEFAULT 100 NOT NULL,
    warmup_status text DEFAULT 'warming'::text NOT NULL,
    warmup_daily_target integer DEFAULT 30 NOT NULL,
    customer_enabled boolean DEFAULT true NOT NULL,
    paused boolean DEFAULT false NOT NULL,
    assigned_at timestamp with time zone,
    admin_notes text,
    spf_status text DEFAULT 'unknown'::text NOT NULL,
    dkim_status text DEFAULT 'unknown'::text NOT NULL,
    dmarc_status text DEFAULT 'unknown'::text NOT NULL,
    mx_status text DEFAULT 'unknown'::text NOT NULL,
    warmup_started_at timestamp with time zone,
    warmup_target_days smallint DEFAULT 14 NOT NULL,
    last_sent_at timestamp with time zone,
    last_reply_at timestamp with time zone,
    domain_id uuid,
    connection_method text,
    auth_status text DEFAULT 'untested'::text NOT NULL,
    CONSTRAINT sending_accounts_auth_status_check CHECK (((spf_status = ANY (ARRAY['pass'::text, 'fail'::text, 'unknown'::text])) AND (dkim_status = ANY (ARRAY['pass'::text, 'fail'::text, 'unknown'::text])) AND (dmarc_status = ANY (ARRAY['pass'::text, 'fail'::text, 'unknown'::text])) AND (mx_status = ANY (ARRAY['pass'::text, 'fail'::text, 'unknown'::text])))),
    CONSTRAINT sending_accounts_daily_limit_check CHECK (((daily_limit > 0) AND (daily_limit <= 5000)))
);

ALTER TABLE ONLY public.sending_accounts REPLICA IDENTITY FULL;


--
-- Name: sending_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sending_domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    domain text NOT NULL,
    registrar text,
    dkim_selector text NOT NULL,
    tracking_host text,
    dns_status text DEFAULT 'pending'::text NOT NULL,
    spf_status text DEFAULT 'pending'::text NOT NULL,
    dkim_status text DEFAULT 'pending'::text NOT NULL,
    dmarc_status text DEFAULT 'pending'::text NOT NULL,
    mx_status text DEFAULT 'pending'::text NOT NULL,
    tracking_status text DEFAULT 'pending'::text NOT NULL,
    last_checked_at timestamp with time zone,
    verified_at timestamp with time zone,
    last_error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text,
    provider_id uuid,
    provider_domain_id text,
    provider_status text DEFAULT 'unknown'::text NOT NULL,
    provider_error text,
    provider_checked_at timestamp with time zone,
    provider_records jsonb DEFAULT '[]'::jsonb NOT NULL,
    record_checks jsonb DEFAULT '[]'::jsonb NOT NULL,
    stage text DEFAULT 'pending_dns'::text NOT NULL,
    disabled_at timestamp with time zone,
    ready_at timestamp with time zone,
    provider_locked_until timestamp with time zone,
    provider_assigned_at timestamp with time zone
);


--
-- Name: service_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alert_type text DEFAULT 'information'::text NOT NULL,
    title text NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    resolved_at timestamp with time zone,
    published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: site_faqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_slug text NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: site_nav_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_nav_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location text NOT NULL,
    parent_id uuid,
    group_label text,
    label text NOT NULL,
    href text NOT NULL,
    description text,
    icon text,
    is_external boolean DEFAULT false NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT site_nav_items_location_check CHECK ((location = ANY (ARRAY['header'::text, 'footer'::text, 'social'::text])))
);


--
-- Name: site_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    path text NOT NULL,
    title text NOT NULL,
    section text DEFAULT 'marketing'::text NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    seo_title text,
    meta_description text,
    canonical_url text,
    og_title text,
    og_description text,
    og_image_url text,
    robots_index boolean DEFAULT true NOT NULL,
    robots_follow boolean DEFAULT true NOT NULL,
    structured_data jsonb,
    include_in_sitemap boolean DEFAULT true NOT NULL,
    changefreq text DEFAULT 'weekly'::text NOT NULL,
    priority numeric(2,1) DEFAULT 0.7 NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT site_pages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'unpublished'::text])))
);


--
-- Name: site_redirects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_redirects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_path text NOT NULL,
    destination_path text NOT NULL,
    status_code smallint DEFAULT 301 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT site_redirects_check CHECK ((source_path <> destination_path)),
    CONSTRAINT site_redirects_status_code_check CHECK ((status_code = ANY (ARRAY[301, 302])))
);


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subprocessors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subprocessors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    service text DEFAULT ''::text NOT NULL,
    purpose text DEFAULT ''::text NOT NULL,
    data_processed text DEFAULT ''::text NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    published boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_id uuid,
    author_role text DEFAULT 'customer'::text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    attachment_path text,
    attachment_name text,
    attachment_size integer
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    created_by uuid,
    subject text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_to uuid,
    closed_at timestamp with time zone,
    customer_last_read_at timestamp with time zone,
    staff_last_read_at timestamp with time zone,
    contact_name text,
    contact_email text,
    contact_workspace text,
    source text DEFAULT 'app'::text NOT NULL
);


--
-- Name: template_uses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_uses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    company text DEFAULT ''::text NOT NULL,
    avatar_url text,
    company_logo_url text,
    testimonial text NOT NULL,
    result text,
    pages text[] DEFAULT '{}'::text[] NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rating smallint DEFAULT 5 NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    reviewed_on date DEFAULT CURRENT_DATE NOT NULL,
    bio text
);


--
-- Name: transactional_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactional_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_key text NOT NULL,
    template_id uuid,
    template_version integer,
    to_email text NOT NULL,
    from_email text,
    reply_to text,
    subject text NOT NULL,
    html text,
    text_body text,
    variables jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text,
    provider_message_id text,
    provider_status_code integer,
    error text,
    bounce_reason text,
    idempotency_key text,
    test_mode boolean DEFAULT false NOT NULL,
    workspace_id uuid,
    user_id uuid,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    failed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transactional_template_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactional_template_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    version integer NOT NULL,
    subject text NOT NULL,
    preheader text,
    from_name text,
    from_email text,
    reply_to text,
    html text NOT NULL,
    text_body text,
    published_by uuid,
    published_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transactional_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactional_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_key text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    is_default boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    subject text NOT NULL,
    preheader text,
    from_name text,
    from_email text,
    reply_to text,
    html text NOT NULL,
    text_body text,
    variables text[] DEFAULT '{}'::text[] NOT NULL,
    draft jsonb,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: unmatched_inbound_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unmatched_inbound_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_email text NOT NULL,
    from_name text,
    to_email text NOT NULL,
    subject text,
    body text,
    html text,
    message_id text,
    in_reply_to text,
    reference_ids text[] DEFAULT '{}'::text[] NOT NULL,
    reason text,
    resolved_conversation_id uuid,
    resolved_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usage_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    resource text NOT NULL,
    action text NOT NULL,
    amount bigint DEFAULT 0 NOT NULL,
    allowed boolean DEFAULT true NOT NULL,
    used_after bigint,
    limit_value bigint,
    period_start date,
    plan_id uuid,
    plan_name text,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warmup_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warmup_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    sender_account_id uuid NOT NULL,
    recipient_account_id uuid NOT NULL,
    subject text NOT NULL,
    thread_key text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    message_count smallint DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT warmup_conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'replied'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: warmup_daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warmup_daily_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    sending_account_id uuid NOT NULL,
    day date NOT NULL,
    target smallint DEFAULT 0 NOT NULL,
    scheduled integer DEFAULT 0 NOT NULL,
    sent integer DEFAULT 0 NOT NULL,
    delivered integer DEFAULT 0 NOT NULL,
    bounced integer DEFAULT 0 NOT NULL,
    complained integer DEFAULT 0 NOT NULL,
    failed integer DEFAULT 0 NOT NULL,
    replied integer DEFAULT 0 NOT NULL,
    health_score smallint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    inbox integer DEFAULT 0 NOT NULL,
    spam integer DEFAULT 0 NOT NULL,
    deferred integer DEFAULT 0 NOT NULL,
    rejected integer DEFAULT 0 NOT NULL,
    not_received integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.warmup_daily_stats REPLICA IDENTITY FULL;


--
-- Name: warmup_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warmup_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    sending_account_id uuid NOT NULL,
    job_id uuid,
    type text NOT NULL,
    detail text,
    provider text,
    provider_message_id text,
    external_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT warmup_events_type_check CHECK ((type = ANY (ARRAY['scheduled'::text, 'sent'::text, 'delivered'::text, 'bounced'::text, 'complained'::text, 'failed'::text, 'deferred'::text, 'replied'::text, 'opened'::text, 'clicked'::text])))
);


--
-- Name: warmup_health; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warmup_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    sending_account_id uuid NOT NULL,
    score smallint NOT NULL,
    status text NOT NULL,
    factors jsonb DEFAULT '[]'::jsonb NOT NULL,
    recommendation text,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT warmup_health_score_check CHECK (((score >= 0) AND (score <= 100))),
    CONSTRAINT warmup_health_status_check CHECK ((status = ANY (ARRAY['healthy'::text, 'good'::text, 'warning'::text, 'critical'::text, 'paused'::text, 'error'::text])))
);

ALTER TABLE ONLY public.warmup_health REPLICA IDENTITY FULL;


--
-- Name: warmup_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warmup_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    mailbox_provider text,
    enabled boolean DEFAULT true NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    sent_count integer DEFAULT 0 NOT NULL,
    received_count integer DEFAULT 0 NOT NULL,
    bounce_count integer DEFAULT 0 NOT NULL,
    reply_count integer DEFAULT 0 NOT NULL,
    last_sent_at timestamp with time zone,
    last_received_at timestamp with time zone,
    last_bounce_at timestamp with time zone,
    last_error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warmup_runner_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warmup_runner_state (
    id text NOT NULL,
    lease_until timestamp with time zone,
    lease_owner text,
    paused boolean DEFAULT false NOT NULL,
    pause_reason text,
    last_run_at timestamp with time zone,
    last_result jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warmup_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warmup_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    sending_account_id uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    mode text DEFAULT 'balanced'::text NOT NULL,
    start_volume smallint DEFAULT 4 NOT NULL,
    max_volume smallint DEFAULT 40 NOT NULL,
    daily_increase smallint DEFAULT 2 NOT NULL,
    ramp_days smallint DEFAULT 30 NOT NULL,
    send_days smallint[] DEFAULT '{1,2,3,4,5}'::smallint[] NOT NULL,
    send_start_hour smallint DEFAULT 8 NOT NULL,
    send_end_hour smallint DEFAULT 18 NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    reply_rate smallint DEFAULT 35 NOT NULL,
    max_bounce_rate smallint DEFAULT 5 NOT NULL,
    min_health_score smallint DEFAULT 50 NOT NULL,
    auto_pause boolean DEFAULT true NOT NULL,
    paused_by_system boolean DEFAULT false NOT NULL,
    pause_reason text,
    paused_at timestamp with time zone,
    started_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_run_reason text,
    last_run_at timestamp with time zone,
    solo_mode boolean DEFAULT true NOT NULL,
    CONSTRAINT warmup_settings_daily_increase_check CHECK (((daily_increase >= 1) AND (daily_increase <= 50))),
    CONSTRAINT warmup_settings_max_bounce_rate_check CHECK (((max_bounce_rate >= 1) AND (max_bounce_rate <= 50))),
    CONSTRAINT warmup_settings_max_volume_check CHECK (((max_volume >= 1) AND (max_volume <= 400))),
    CONSTRAINT warmup_settings_min_health_score_check CHECK (((min_health_score >= 0) AND (min_health_score <= 100))),
    CONSTRAINT warmup_settings_mode_check CHECK ((mode = ANY (ARRAY['conservative'::text, 'balanced'::text, 'aggressive'::text]))),
    CONSTRAINT warmup_settings_ramp_days_check CHECK (((ramp_days >= 3) AND (ramp_days <= 120))),
    CONSTRAINT warmup_settings_reply_rate_check CHECK (((reply_rate >= 0) AND (reply_rate <= 100))),
    CONSTRAINT warmup_settings_send_end_hour_check CHECK (((send_end_hour >= 1) AND (send_end_hour <= 24))),
    CONSTRAINT warmup_settings_send_start_hour_check CHECK (((send_start_hour >= 0) AND (send_start_hour <= 23))),
    CONSTRAINT warmup_settings_start_volume_check CHECK (((start_volume >= 1) AND (start_volume <= 200)))
);

ALTER TABLE ONLY public.warmup_settings REPLICA IDENTITY FULL;


--
-- Name: workspace_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    actor_id uuid,
    target_user_id uuid,
    target_email text,
    type text NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_ai_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_ai_keys (
    workspace_id uuid NOT NULL,
    provider text DEFAULT 'openai'::text NOT NULL,
    model text DEFAULT 'gpt-4o-mini'::text NOT NULL,
    key_ciphertext text NOT NULL,
    key_last4 text,
    status text DEFAULT 'unverified'::text NOT NULL,
    last_error text,
    verified_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_credits (
    workspace_id uuid NOT NULL,
    balance bigint DEFAULT 0 NOT NULL,
    allocated_total bigint DEFAULT 0 NOT NULL,
    consumed_total bigint DEFAULT 0 NOT NULL,
    last_allocated_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    email text NOT NULL,
    role public.workspace_role DEFAULT 'member'::public.workspace_role NOT NULL,
    message text,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid
);


--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.workspace_role DEFAULT 'client_viewer'::public.workspace_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone
);


--
-- Name: workspace_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    plan_id uuid,
    status text DEFAULT 'trialing'::text NOT NULL,
    billing_interval text DEFAULT 'monthly'::text NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_end timestamp with time zone,
    payment_status text DEFAULT 'none'::text NOT NULL,
    external_customer_id text,
    external_subscription_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_usage_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_usage_counters (
    workspace_id uuid NOT NULL,
    resource text NOT NULL,
    period_start date NOT NULL,
    used bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    owner_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    outreach_type text,
    onboarding_completed boolean DEFAULT false NOT NULL,
    checklist_dismissed boolean DEFAULT false NOT NULL,
    company_name text,
    logo_url text,
    team_size text,
    persona text,
    outreach_goal text,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    sending_timezone text,
    send_days smallint[] DEFAULT ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint] NOT NULL,
    send_start_hour smallint DEFAULT 9 NOT NULL,
    send_end_hour smallint DEFAULT 17 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    suspended_at timestamp with time zone,
    suspended_reason text,
    suspended_by uuid,
    trial_consumed_at timestamp with time zone,
    CONSTRAINT workspaces_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: admin_notifications admin_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_pkey PRIMARY KEY (id);


--
-- Name: ai_personalizations ai_personalizations_campaign_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_personalizations
    ADD CONSTRAINT ai_personalizations_campaign_id_lead_id_key UNIQUE (campaign_id, lead_id);


--
-- Name: ai_personalizations ai_personalizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_personalizations
    ADD CONSTRAINT ai_personalizations_pkey PRIMARY KEY (id);


--
-- Name: ai_runner_state ai_runner_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_runner_state
    ADD CONSTRAINT ai_runner_state_pkey PRIMARY KEY (key);


--
-- Name: automation_events automation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_events
    ADD CONSTRAINT automation_events_pkey PRIMARY KEY (id);


--
-- Name: automation_events automation_events_workspace_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_events
    ADD CONSTRAINT automation_events_workspace_id_idempotency_key_key UNIQUE (workspace_id, idempotency_key);


--
-- Name: automation_run_steps automation_run_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_run_steps
    ADD CONSTRAINT automation_run_steps_pkey PRIMARY KEY (id);


--
-- Name: automation_run_steps automation_run_steps_run_id_position_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_run_steps
    ADD CONSTRAINT automation_run_steps_run_id_position_kind_key UNIQUE (run_id, "position", kind);


--
-- Name: automation_runs automation_runs_automation_id_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_automation_id_event_id_key UNIQUE (automation_id, event_id);


--
-- Name: automation_runs automation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_pkey PRIMARY KEY (id);


--
-- Name: automation_steps automation_steps_automation_id_position_branch_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_steps
    ADD CONSTRAINT automation_steps_automation_id_position_branch_key UNIQUE (automation_id, "position", branch);


--
-- Name: automation_steps automation_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_steps
    ADD CONSTRAINT automation_steps_pkey PRIMARY KEY (id);


--
-- Name: automations automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_pkey PRIMARY KEY (id);


--
-- Name: automations automations_webhook_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_webhook_token_key UNIQUE (webhook_token);


--
-- Name: billing_audit_log billing_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_audit_log
    ADD CONSTRAINT billing_audit_log_pkey PRIMARY KEY (id);


--
-- Name: billing_customers billing_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_pkey PRIMARY KEY (id);


--
-- Name: billing_customers billing_customers_provider_environment_external_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_provider_environment_external_customer_id_key UNIQUE (provider, environment, external_customer_id);


--
-- Name: billing_customers billing_customers_workspace_id_provider_environment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_workspace_id_provider_environment_key UNIQUE (workspace_id, provider, environment);


--
-- Name: billing_invoices billing_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);


--
-- Name: billing_invoices billing_invoices_provider_environment_external_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_provider_environment_external_invoice_id_key UNIQUE (provider, environment, external_invoice_id);


--
-- Name: billing_plan_prices billing_plan_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plan_prices
    ADD CONSTRAINT billing_plan_prices_pkey PRIMARY KEY (id);


--
-- Name: billing_plan_prices billing_plan_prices_plan_id_provider_environment_billing_in_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plan_prices
    ADD CONSTRAINT billing_plan_prices_plan_id_provider_environment_billing_in_key UNIQUE (plan_id, provider, environment, billing_interval);


--
-- Name: billing_provider_secrets billing_provider_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_provider_secrets
    ADD CONSTRAINT billing_provider_secrets_pkey PRIMARY KEY (provider, environment);


--
-- Name: billing_providers billing_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_providers
    ADD CONSTRAINT billing_providers_pkey PRIMARY KEY (id);


--
-- Name: billing_providers billing_providers_provider_environment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_providers
    ADD CONSTRAINT billing_providers_provider_environment_key UNIQUE (provider, environment);


--
-- Name: billing_subscriptions billing_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: billing_subscriptions billing_subscriptions_provider_environment_external_subscri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_provider_environment_external_subscri_key UNIQUE (provider, environment, external_subscription_id);


--
-- Name: billing_transactions billing_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_transactions
    ADD CONSTRAINT billing_transactions_pkey PRIMARY KEY (id);


--
-- Name: billing_transactions billing_transactions_provider_environment_external_transact_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_transactions
    ADD CONSTRAINT billing_transactions_provider_environment_external_transact_key UNIQUE (provider, environment, external_transaction_id, kind);


--
-- Name: billing_webhook_events billing_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_webhook_events
    ADD CONSTRAINT billing_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: billing_webhook_events billing_webhook_events_provider_environment_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_webhook_events
    ADD CONSTRAINT billing_webhook_events_provider_environment_event_id_key UNIQUE (provider, environment, event_id);


--
-- Name: blog_authors blog_authors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_authors
    ADD CONSTRAINT blog_authors_pkey PRIMARY KEY (id);


--
-- Name: blog_authors blog_authors_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_authors
    ADD CONSTRAINT blog_authors_slug_key UNIQUE (slug);


--
-- Name: blog_categories blog_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_pkey PRIMARY KEY (id);


--
-- Name: blog_categories blog_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_slug_key UNIQUE (slug);


--
-- Name: blog_media blog_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_media
    ADD CONSTRAINT blog_media_pkey PRIMARY KEY (id);


--
-- Name: blog_media blog_media_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_media
    ADD CONSTRAINT blog_media_storage_path_key UNIQUE (storage_path);


--
-- Name: blog_post_slugs blog_post_slugs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_post_slugs
    ADD CONSTRAINT blog_post_slugs_pkey PRIMARY KEY (id);


--
-- Name: blog_post_slugs blog_post_slugs_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_post_slugs
    ADD CONSTRAINT blog_post_slugs_slug_key UNIQUE (slug);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_slug_key UNIQUE (slug);


--
-- Name: campaign_launch_events campaign_launch_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_launch_events
    ADD CONSTRAINT campaign_launch_events_pkey PRIMARY KEY (id);


--
-- Name: campaign_messages campaign_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_pkey PRIMARY KEY (id);


--
-- Name: campaign_recipients campaign_recipients_campaign_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_campaign_id_lead_id_key UNIQUE (campaign_id, lead_id);


--
-- Name: campaign_recipients campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: campaign_replies campaign_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_replies
    ADD CONSTRAINT campaign_replies_pkey PRIMARY KEY (id);


--
-- Name: campaign_step_variants campaign_step_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_step_variants
    ADD CONSTRAINT campaign_step_variants_pkey PRIMARY KEY (id);


--
-- Name: campaign_steps campaign_steps_campaign_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_steps
    ADD CONSTRAINT campaign_steps_campaign_id_step_order_key UNIQUE (campaign_id, step_order);


--
-- Name: campaign_steps campaign_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_steps
    ADD CONSTRAINT campaign_steps_pkey PRIMARY KEY (id);


--
-- Name: campaign_test_sends campaign_test_sends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_test_sends
    ADD CONSTRAINT campaign_test_sends_pkey PRIMARY KEY (id);


--
-- Name: campaign_test_sends campaign_test_sends_request_id_recipient_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_test_sends
    ADD CONSTRAINT campaign_test_sends_request_id_recipient_email_key UNIQUE (request_id, recipient_email);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: conversation_events conversation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_pkey PRIMARY KEY (id);


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: conversation_notes conversation_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_thread_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_thread_unique UNIQUE (workspace_id, thread_key);


--
-- Name: credit_ledger credit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_pkey PRIMARY KEY (id);


--
-- Name: crm_stages crm_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stages
    ADD CONSTRAINT crm_stages_pkey PRIMARY KEY (id);


--
-- Name: crm_stages crm_stages_workspace_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stages
    ADD CONSTRAINT crm_stages_workspace_id_key_key UNIQUE (workspace_id, key);


--
-- Name: domain_alerts domain_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_alerts
    ADD CONSTRAINT domain_alerts_pkey PRIMARY KEY (id);


--
-- Name: email_drafts email_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_pkey PRIMARY KEY (id);


--
-- Name: email_engagement_events email_engagement_events_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_events
    ADD CONSTRAINT email_engagement_events_external_id_key UNIQUE (external_id);


--
-- Name: email_engagement_events email_engagement_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_events
    ADD CONSTRAINT email_engagement_events_pkey PRIMARY KEY (id);


--
-- Name: email_events email_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_pkey PRIMARY KEY (id);


--
-- Name: email_provider_secrets email_provider_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_provider_secrets
    ADD CONSTRAINT email_provider_secrets_pkey PRIMARY KEY (provider_id);


--
-- Name: email_providers email_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_providers
    ADD CONSTRAINT email_providers_pkey PRIMARY KEY (id);


--
-- Name: email_suppressions email_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_pkey PRIMARY KEY (id);


--
-- Name: email_suppressions email_suppressions_workspace_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_workspace_id_email_key UNIQUE (workspace_id, email);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: guide_articles guide_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_articles
    ADD CONSTRAINT guide_articles_pkey PRIMARY KEY (id);


--
-- Name: guide_articles guide_articles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_articles
    ADD CONSTRAINT guide_articles_slug_key UNIQUE (slug);


--
-- Name: inbound_event_actions inbound_event_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_event_actions
    ADD CONSTRAINT inbound_event_actions_pkey PRIMARY KEY (id);


--
-- Name: inbound_routes inbound_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_routes
    ADD CONSTRAINT inbound_routes_pkey PRIMARY KEY (id);


--
-- Name: inbound_routes inbound_routes_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_routes
    ADD CONSTRAINT inbound_routes_token_key UNIQUE (token);


--
-- Name: inbound_tests inbound_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_tests
    ADD CONSTRAINT inbound_tests_pkey PRIMARY KEY (id);


--
-- Name: integration_connections integration_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_pkey PRIMARY KEY (id);


--
-- Name: integration_connections integration_connections_workspace_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_workspace_id_slug_key UNIQUE (workspace_id, slug);


--
-- Name: integration_events integration_events_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: integration_events integration_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_pkey PRIMARY KEY (id);


--
-- Name: integration_secrets integration_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_secrets
    ADD CONSTRAINT integration_secrets_pkey PRIMARY KEY (connection_id);


--
-- Name: integration_sync_logs integration_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_sync_logs
    ADD CONSTRAINT integration_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (slug);


--
-- Name: lead_activities lead_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);


--
-- Name: lead_lists lead_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_lists
    ADD CONSTRAINT lead_lists_pkey PRIMARY KEY (id);


--
-- Name: lead_notes lead_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_pkey PRIMARY KEY (id);


--
-- Name: lead_retention_runs lead_retention_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_retention_runs
    ADD CONSTRAINT lead_retention_runs_pkey PRIMARY KEY (id);


--
-- Name: lead_tasks lead_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tasks
    ADD CONSTRAINT lead_tasks_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: leads leads_workspace_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_workspace_id_email_key UNIQUE (workspace_id, email);


--
-- Name: newsletter_subscribers newsletter_subscribers_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_email_unique UNIQUE (email);


--
-- Name: newsletter_subscribers newsletter_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: outbound_messages outbound_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_messages
    ADD CONSTRAINT outbound_messages_pkey PRIMARY KEY (id);


--
-- Name: outbound_messages outbound_messages_provider_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_messages
    ADD CONSTRAINT outbound_messages_provider_message_id_key UNIQUE (provider_message_id);


--
-- Name: plan_features plan_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_pkey PRIMARY KEY (id);


--
-- Name: plan_grants plan_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_grants
    ADD CONSTRAINT plan_grants_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: plans plans_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_slug_key UNIQUE (slug);


--
-- Name: platform_announcement_dismissals platform_announcement_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcement_dismissals
    ADD CONSTRAINT platform_announcement_dismissals_pkey PRIMARY KEY (announcement_id, user_id);


--
-- Name: platform_announcements platform_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_pkey PRIMARY KEY (id);


--
-- Name: platform_feature_flags platform_feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_feature_flags
    ADD CONSTRAINT platform_feature_flags_pkey PRIMARY KEY (key);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: privacy_requests privacy_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_requests
    ADD CONSTRAINT privacy_requests_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: provider_health_events provider_health_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_health_events
    ADD CONSTRAINT provider_health_events_pkey PRIMARY KEY (id);


--
-- Name: provider_routing_events provider_routing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_routing_events
    ADD CONSTRAINT provider_routing_events_pkey PRIMARY KEY (id);


--
-- Name: referral_attributions referral_attributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_attributions
    ADD CONSTRAINT referral_attributions_pkey PRIMARY KEY (id);


--
-- Name: referral_attributions referral_attributions_referred_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_attributions
    ADD CONSTRAINT referral_attributions_referred_user_id_key UNIQUE (referred_user_id);


--
-- Name: referral_audit_logs referral_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_audit_logs
    ADD CONSTRAINT referral_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: referral_billing_events referral_billing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_billing_events
    ADD CONSTRAINT referral_billing_events_pkey PRIMARY KEY (id);


--
-- Name: referral_billing_events referral_billing_events_provider_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_billing_events
    ADD CONSTRAINT referral_billing_events_provider_event_id_key UNIQUE (provider, event_id);


--
-- Name: referral_clicks referral_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_clicks
    ADD CONSTRAINT referral_clicks_pkey PRIMARY KEY (id);


--
-- Name: referral_commissions referral_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_pkey PRIMARY KEY (id);


--
-- Name: referral_fraud_flags referral_fraud_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_fraud_flags
    ADD CONSTRAINT referral_fraud_flags_pkey PRIMARY KEY (id);


--
-- Name: referral_payouts referral_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_payouts
    ADD CONSTRAINT referral_payouts_pkey PRIMARY KEY (id);


--
-- Name: referral_profiles referral_profiles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_profiles
    ADD CONSTRAINT referral_profiles_code_key UNIQUE (code);


--
-- Name: referral_profiles referral_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_profiles
    ADD CONSTRAINT referral_profiles_pkey PRIMARY KEY (id);


--
-- Name: referral_profiles referral_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_profiles
    ADD CONSTRAINT referral_profiles_user_id_key UNIQUE (user_id);


--
-- Name: referral_programs referral_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_programs
    ADD CONSTRAINT referral_programs_pkey PRIMARY KEY (id);


--
-- Name: referral_programs referral_programs_singleton_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_programs
    ADD CONSTRAINT referral_programs_singleton_key UNIQUE (singleton);


--
-- Name: referral_webhook_events referral_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_webhook_events
    ADD CONSTRAINT referral_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: sending_account_audit sending_account_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_account_audit
    ADD CONSTRAINT sending_account_audit_pkey PRIMARY KEY (id);


--
-- Name: sending_account_checks sending_account_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_account_checks
    ADD CONSTRAINT sending_account_checks_pkey PRIMARY KEY (id);


--
-- Name: sending_account_secrets sending_account_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_account_secrets
    ADD CONSTRAINT sending_account_secrets_pkey PRIMARY KEY (sending_account_id);


--
-- Name: sending_accounts sending_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_accounts
    ADD CONSTRAINT sending_accounts_pkey PRIMARY KEY (id);


--
-- Name: sending_domains sending_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_domains
    ADD CONSTRAINT sending_domains_pkey PRIMARY KEY (id);


--
-- Name: service_alerts service_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_alerts
    ADD CONSTRAINT service_alerts_pkey PRIMARY KEY (id);


--
-- Name: site_faqs site_faqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_faqs
    ADD CONSTRAINT site_faqs_pkey PRIMARY KEY (id);


--
-- Name: site_nav_items site_nav_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_nav_items
    ADD CONSTRAINT site_nav_items_pkey PRIMARY KEY (id);


--
-- Name: site_pages site_pages_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_pages
    ADD CONSTRAINT site_pages_path_key UNIQUE (path);


--
-- Name: site_pages site_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_pages
    ADD CONSTRAINT site_pages_pkey PRIMARY KEY (id);


--
-- Name: site_redirects site_redirects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_redirects
    ADD CONSTRAINT site_redirects_pkey PRIMARY KEY (id);


--
-- Name: site_redirects site_redirects_source_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_redirects
    ADD CONSTRAINT site_redirects_source_path_key UNIQUE (source_path);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (key);


--
-- Name: subprocessors subprocessors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subprocessors
    ADD CONSTRAINT subprocessors_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_messages support_ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: template_uses template_uses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_uses
    ADD CONSTRAINT template_uses_pkey PRIMARY KEY (id);


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);


--
-- Name: transactional_emails transactional_emails_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactional_emails
    ADD CONSTRAINT transactional_emails_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: transactional_emails transactional_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactional_emails
    ADD CONSTRAINT transactional_emails_pkey PRIMARY KEY (id);


--
-- Name: transactional_template_versions transactional_template_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactional_template_versions
    ADD CONSTRAINT transactional_template_versions_pkey PRIMARY KEY (id);


--
-- Name: transactional_template_versions transactional_template_versions_template_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactional_template_versions
    ADD CONSTRAINT transactional_template_versions_template_id_version_key UNIQUE (template_id, version);


--
-- Name: transactional_templates transactional_templates_event_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactional_templates
    ADD CONSTRAINT transactional_templates_event_key_key UNIQUE (event_key);


--
-- Name: transactional_templates transactional_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactional_templates
    ADD CONSTRAINT transactional_templates_pkey PRIMARY KEY (id);


--
-- Name: unmatched_inbound_emails unmatched_inbound_emails_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unmatched_inbound_emails
    ADD CONSTRAINT unmatched_inbound_emails_message_id_key UNIQUE (message_id);


--
-- Name: unmatched_inbound_emails unmatched_inbound_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unmatched_inbound_emails
    ADD CONSTRAINT unmatched_inbound_emails_pkey PRIMARY KEY (id);


--
-- Name: usage_audit_log usage_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_audit_log
    ADD CONSTRAINT usage_audit_log_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: warmup_conversations warmup_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_conversations
    ADD CONSTRAINT warmup_conversations_pkey PRIMARY KEY (id);


--
-- Name: warmup_conversations warmup_conversations_thread_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_conversations
    ADD CONSTRAINT warmup_conversations_thread_key_key UNIQUE (thread_key);


--
-- Name: warmup_daily_stats warmup_daily_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_daily_stats
    ADD CONSTRAINT warmup_daily_stats_pkey PRIMARY KEY (id);


--
-- Name: warmup_daily_stats warmup_daily_stats_sending_account_id_day_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_daily_stats
    ADD CONSTRAINT warmup_daily_stats_sending_account_id_day_key UNIQUE (sending_account_id, day);


--
-- Name: warmup_events warmup_events_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_events
    ADD CONSTRAINT warmup_events_external_id_key UNIQUE (external_id);


--
-- Name: warmup_events warmup_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_events
    ADD CONSTRAINT warmup_events_pkey PRIMARY KEY (id);


--
-- Name: warmup_health warmup_health_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_health
    ADD CONSTRAINT warmup_health_pkey PRIMARY KEY (id);


--
-- Name: warmup_jobs warmup_jobs_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_jobs
    ADD CONSTRAINT warmup_jobs_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: warmup_jobs warmup_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_jobs
    ADD CONSTRAINT warmup_jobs_pkey PRIMARY KEY (id);


--
-- Name: warmup_recipients warmup_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_recipients
    ADD CONSTRAINT warmup_recipients_pkey PRIMARY KEY (id);


--
-- Name: warmup_runner_state warmup_runner_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_runner_state
    ADD CONSTRAINT warmup_runner_state_pkey PRIMARY KEY (id);


--
-- Name: warmup_settings warmup_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_settings
    ADD CONSTRAINT warmup_settings_pkey PRIMARY KEY (id);


--
-- Name: warmup_settings warmup_settings_sending_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_settings
    ADD CONSTRAINT warmup_settings_sending_account_id_key UNIQUE (sending_account_id);


--
-- Name: workspace_activity workspace_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_activity
    ADD CONSTRAINT workspace_activity_pkey PRIMARY KEY (id);


--
-- Name: workspace_ai_keys workspace_ai_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_ai_keys
    ADD CONSTRAINT workspace_ai_keys_pkey PRIMARY KEY (workspace_id);


--
-- Name: workspace_credits workspace_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_credits
    ADD CONSTRAINT workspace_credits_pkey PRIMARY KEY (workspace_id);


--
-- Name: workspace_invitations workspace_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_pkey PRIMARY KEY (id);


--
-- Name: workspace_invitations workspace_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_token_key UNIQUE (token);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_workspace_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_user_id_key UNIQUE (workspace_id, user_id);


--
-- Name: workspace_subscriptions workspace_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: workspace_subscriptions workspace_subscriptions_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_workspace_id_key UNIQUE (workspace_id);


--
-- Name: workspace_usage_counters workspace_usage_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_usage_counters
    ADD CONSTRAINT workspace_usage_counters_pkey PRIMARY KEY (workspace_id, resource, period_start);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);


--
-- Name: admin_audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: admin_notifications_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_notifications_created_idx ON public.admin_notifications USING btree (created_at DESC);


--
-- Name: ai_personalizations_campaign_quality_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_personalizations_campaign_quality_idx ON public.ai_personalizations USING btree (campaign_id, quality);


--
-- Name: ai_personalizations_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_personalizations_queue_idx ON public.ai_personalizations USING btree (status, created_at);


--
-- Name: ai_personalizations_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_personalizations_workspace_idx ON public.ai_personalizations USING btree (workspace_id, created_at DESC);


--
-- Name: automation_events_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_events_workspace_idx ON public.automation_events USING btree (workspace_id, event_type, created_at DESC);


--
-- Name: automation_run_steps_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_run_steps_run_idx ON public.automation_run_steps USING btree (run_id, "position");


--
-- Name: automation_runs_automation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_runs_automation_idx ON public.automation_runs USING btree (automation_id, created_at DESC);


--
-- Name: automation_runs_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_runs_due_idx ON public.automation_runs USING btree (status, resume_at);


--
-- Name: automation_runs_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_runs_workspace_idx ON public.automation_runs USING btree (workspace_id, created_at DESC);


--
-- Name: automation_steps_automation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_steps_automation_idx ON public.automation_steps USING btree (automation_id, "position");


--
-- Name: automations_trigger_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automations_trigger_idx ON public.automations USING btree (trigger_type, status);


--
-- Name: automations_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automations_workspace_idx ON public.automations USING btree (workspace_id, status);


--
-- Name: billing_audit_log_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_audit_log_recent_idx ON public.billing_audit_log USING btree (created_at DESC);


--
-- Name: billing_invoices_ws_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_invoices_ws_idx ON public.billing_invoices USING btree (workspace_id, issued_at DESC);


--
-- Name: billing_subscriptions_ws_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_subscriptions_ws_idx ON public.billing_subscriptions USING btree (workspace_id);


--
-- Name: billing_transactions_ws_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_transactions_ws_idx ON public.billing_transactions USING btree (workspace_id, occurred_at DESC);


--
-- Name: billing_webhook_events_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_webhook_events_recent_idx ON public.billing_webhook_events USING btree (received_at DESC);


--
-- Name: blog_media_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_media_created_idx ON public.blog_media USING btree (created_at DESC);


--
-- Name: blog_posts_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_author_idx ON public.blog_posts USING btree (author_id);


--
-- Name: blog_posts_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_category_idx ON public.blog_posts USING btree (category_id);


--
-- Name: blog_posts_status_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_status_published_idx ON public.blog_posts USING btree (status, published_at DESC);


--
-- Name: campaign_launch_events_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_launch_events_campaign_idx ON public.campaign_launch_events USING btree (campaign_id, created_at DESC);


--
-- Name: campaign_messages_campaign_delivery_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_campaign_delivery_idx ON public.campaign_messages USING btree (campaign_id, delivery_status);


--
-- Name: campaign_messages_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_campaign_idx ON public.campaign_messages USING btree (campaign_id, status);


--
-- Name: campaign_messages_message_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_message_type_idx ON public.campaign_messages USING btree (message_type);


--
-- Name: campaign_messages_provider_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_provider_message_id_idx ON public.campaign_messages USING btree (provider_message_id);


--
-- Name: campaign_messages_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_workspace_idx ON public.campaign_messages USING btree (workspace_id, scheduled_at);


--
-- Name: campaign_recipients_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_recipients_due_idx ON public.campaign_recipients USING btree (status, next_send_at);


--
-- Name: campaign_step_variants_step_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_step_variants_step_idx ON public.campaign_step_variants USING btree (step_id);


--
-- Name: campaign_steps_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_steps_campaign_idx ON public.campaign_steps USING btree (campaign_id, step_order);


--
-- Name: campaign_test_sends_campaign_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_test_sends_campaign_created_idx ON public.campaign_test_sends USING btree (campaign_id, created_at DESC);


--
-- Name: campaign_test_sends_provider_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_test_sends_provider_message_idx ON public.campaign_test_sends USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: campaigns_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_workspace_idx ON public.campaigns USING btree (workspace_id, created_at DESC);


--
-- Name: conversation_events_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversation_events_dedupe ON public.conversation_events USING btree (workspace_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: conversation_messages_conv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_messages_conv_idx ON public.conversation_messages USING btree (conversation_id, occurred_at);


--
-- Name: conversation_messages_msgid_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversation_messages_msgid_unique ON public.conversation_messages USING btree (workspace_id, message_id) WHERE (message_id IS NOT NULL);


--
-- Name: conversations_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_lead_idx ON public.conversations USING btree (lead_id);


--
-- Name: conversations_workspace_inbound_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_workspace_inbound_idx ON public.conversations USING btree (workspace_id, has_inbound, last_message_at DESC);


--
-- Name: conversations_ws_last_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_ws_last_idx ON public.conversations USING btree (workspace_id, last_message_at DESC);


--
-- Name: credit_ledger_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX credit_ledger_created_idx ON public.credit_ledger USING btree (created_at DESC);


--
-- Name: credit_ledger_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX credit_ledger_workspace_idx ON public.credit_ledger USING btree (workspace_id, created_at DESC);


--
-- Name: crm_stages_workspace_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_stages_workspace_position_idx ON public.crm_stages USING btree (workspace_id, "position");


--
-- Name: domain_alerts_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX domain_alerts_open_idx ON public.domain_alerts USING btree (domain_id, created_at DESC) WHERE (resolved_at IS NULL);


--
-- Name: email_drafts_ws_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_drafts_ws_idx ON public.email_drafts USING btree (workspace_id, updated_at DESC);


--
-- Name: email_engagement_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_engagement_account ON public.email_engagement_events USING btree (sending_account_id, event_type);


--
-- Name: email_engagement_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_engagement_campaign ON public.email_engagement_events USING btree (campaign_id, event_type);


--
-- Name: email_engagement_ws_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_engagement_ws_time ON public.email_engagement_events USING btree (workspace_id, occurred_at DESC);


--
-- Name: email_engagement_ws_type_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_engagement_ws_type_time ON public.email_engagement_events USING btree (workspace_id, event_type, occurred_at DESC);


--
-- Name: email_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_events_created_at_idx ON public.email_events USING btree (created_at DESC);


--
-- Name: email_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_events_created_idx ON public.email_events USING btree (created_at DESC);


--
-- Name: email_events_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_events_external_id_key ON public.email_events USING btree (external_id) WHERE (external_id IS NOT NULL);


--
-- Name: email_events_token_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_events_token_status_idx ON public.email_events USING btree (token_status) WHERE (token_status IS NOT NULL);


--
-- Name: email_suppressions_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_suppressions_email_idx ON public.email_suppressions USING btree (email);


--
-- Name: email_templates_official_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_templates_official_idx ON public.email_templates USING btree (is_official, published);


--
-- Name: email_templates_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_templates_workspace_idx ON public.email_templates USING btree (workspace_id);


--
-- Name: idx_campaign_replies_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_replies_campaign ON public.campaign_replies USING btree (campaign_id, received_at DESC);


--
-- Name: idx_campaign_replies_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_replies_lead ON public.campaign_replies USING btree (lead_id, received_at DESC);


--
-- Name: inbound_event_actions_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbound_event_actions_event_idx ON public.inbound_event_actions USING btree (event_id, created_at DESC);


--
-- Name: inbound_routes_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbound_routes_workspace_idx ON public.inbound_routes USING btree (workspace_id);


--
-- Name: integration_events_ws_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_events_ws_idx ON public.integration_events USING btree (workspace_id, created_at DESC);


--
-- Name: integration_sync_logs_ws_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_sync_logs_ws_idx ON public.integration_sync_logs USING btree (workspace_id, started_at DESC);


--
-- Name: lead_activities_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_activities_lead_idx ON public.lead_activities USING btree (lead_id, created_at DESC);


--
-- Name: lead_lists_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_lists_workspace_idx ON public.lead_lists USING btree (workspace_id);


--
-- Name: lead_retention_runs_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_retention_runs_started_idx ON public.lead_retention_runs USING btree (started_at DESC);


--
-- Name: leads_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_list_idx ON public.leads USING btree (list_id);


--
-- Name: leads_retention_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_retention_idx ON public.leads USING btree (retention_expires_at);


--
-- Name: leads_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_stage_idx ON public.leads USING btree (workspace_id, stage_id);


--
-- Name: leads_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_tags_idx ON public.leads USING gin (tags);


--
-- Name: leads_workspace_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_workspace_created_idx ON public.leads USING btree (workspace_id, created_at DESC);


--
-- Name: leads_workspace_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leads_workspace_email_key ON public.leads USING btree (workspace_id, email);


--
-- Name: leads_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_workspace_idx ON public.leads USING btree (workspace_id);


--
-- Name: newsletter_subscribers_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX newsletter_subscribers_email_key ON public.newsletter_subscribers USING btree (lower(email));


--
-- Name: notifications_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: outbound_messages_to_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_messages_to_email_idx ON public.outbound_messages USING btree (lower(to_email), created_at DESC);


--
-- Name: outbound_messages_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_messages_type_idx ON public.outbound_messages USING btree (message_type, created_at DESC);


--
-- Name: plan_features_plan_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plan_features_plan_key_uidx ON public.plan_features USING btree (plan_id, feature_key) WHERE (feature_key IS NOT NULL);


--
-- Name: plan_grants_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_grants_workspace_idx ON public.plan_grants USING btree (workspace_id, status);


--
-- Name: provider_health_events_provider_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_health_events_provider_time_idx ON public.provider_health_events USING btree (provider_id, occurred_at DESC);


--
-- Name: provider_routing_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_routing_events_created_idx ON public.provider_routing_events USING btree (created_at DESC);


--
-- Name: provider_routing_events_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_routing_events_provider_idx ON public.provider_routing_events USING btree (provider_id, created_at DESC);


--
-- Name: referral_attributions_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referral_attributions_profile_idx ON public.referral_attributions USING btree (referral_profile_id, created_at DESC);


--
-- Name: referral_audit_logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referral_audit_logs_created_idx ON public.referral_audit_logs USING btree (created_at DESC);


--
-- Name: referral_clicks_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referral_clicks_profile_idx ON public.referral_clicks USING btree (referral_profile_id, created_at DESC);


--
-- Name: referral_commissions_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX referral_commissions_event_idx ON public.referral_commissions USING btree (provider, provider_event_id) WHERE (reversal_of IS NULL);


--
-- Name: referral_commissions_referrer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referral_commissions_referrer_idx ON public.referral_commissions USING btree (referrer_user_id, status);


--
-- Name: referral_payouts_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referral_payouts_profile_idx ON public.referral_payouts USING btree (referral_profile_id, created_at DESC);


--
-- Name: referral_profiles_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referral_profiles_code_idx ON public.referral_profiles USING btree (lower(code));


--
-- Name: referral_webhook_events_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referral_webhook_events_received_idx ON public.referral_webhook_events USING btree (received_at DESC);


--
-- Name: sending_account_audit_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sending_account_audit_account_idx ON public.sending_account_audit USING btree (sending_account_id, created_at DESC);


--
-- Name: sending_account_audit_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sending_account_audit_workspace_idx ON public.sending_account_audit USING btree (workspace_id, created_at DESC);


--
-- Name: sending_account_checks_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sending_account_checks_account_idx ON public.sending_account_checks USING btree (sending_account_id, created_at DESC);


--
-- Name: sending_accounts_domain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sending_accounts_domain_id_idx ON public.sending_accounts USING btree (domain_id);


--
-- Name: sending_accounts_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sending_accounts_workspace_idx ON public.sending_accounts USING btree (workspace_id);


--
-- Name: sending_domains_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sending_domains_stage_idx ON public.sending_domains USING btree (stage);


--
-- Name: sending_domains_workspace_domain_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sending_domains_workspace_domain_key ON public.sending_domains USING btree (workspace_id, lower(domain));


--
-- Name: site_faqs_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_faqs_page_idx ON public.site_faqs USING btree (page_slug, sort_order);


--
-- Name: site_nav_items_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_nav_items_location_idx ON public.site_nav_items USING btree (location, sort_order);


--
-- Name: support_ticket_messages_ticket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_ticket_messages_ticket_idx ON public.support_ticket_messages USING btree (ticket_id, created_at);


--
-- Name: template_uses_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX template_uses_workspace_idx ON public.template_uses USING btree (workspace_id, used_at DESC);


--
-- Name: transactional_emails_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactional_emails_created_idx ON public.transactional_emails USING btree (created_at DESC);


--
-- Name: transactional_emails_provider_msg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactional_emails_provider_msg_idx ON public.transactional_emails USING btree (provider_message_id);


--
-- Name: transactional_emails_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactional_emails_recipient_idx ON public.transactional_emails USING btree (to_email);


--
-- Name: transactional_emails_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactional_emails_status_idx ON public.transactional_emails USING btree (status, next_attempt_at);


--
-- Name: unmatched_inbound_emails_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unmatched_inbound_emails_received_idx ON public.unmatched_inbound_emails USING btree (received_at DESC);


--
-- Name: usage_audit_log_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_audit_log_resource_idx ON public.usage_audit_log USING btree (resource, created_at DESC);


--
-- Name: usage_audit_log_ws_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_audit_log_ws_idx ON public.usage_audit_log USING btree (workspace_id, created_at DESC);


--
-- Name: warmup_events_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_events_account_idx ON public.warmup_events USING btree (sending_account_id, occurred_at DESC);


--
-- Name: warmup_health_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_health_account_idx ON public.warmup_health USING btree (sending_account_id, computed_at DESC);


--
-- Name: warmup_jobs_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_jobs_account_idx ON public.warmup_jobs USING btree (sending_account_id, created_at DESC);


--
-- Name: warmup_jobs_account_processed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_jobs_account_processed_idx ON public.warmup_jobs USING btree (sending_account_id, processed_at DESC);


--
-- Name: warmup_jobs_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_jobs_due_idx ON public.warmup_jobs USING btree (status, scheduled_at) WHERE (status = 'queued'::text);


--
-- Name: warmup_jobs_placement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_jobs_placement_idx ON public.warmup_jobs USING btree (placement, processed_at);


--
-- Name: warmup_jobs_pool_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_jobs_pool_recipient_idx ON public.warmup_jobs USING btree (pool_recipient_id, created_at DESC);


--
-- Name: warmup_jobs_provider_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_jobs_provider_message_id_idx ON public.warmup_jobs USING btree (provider_message_id);


--
-- Name: warmup_jobs_provider_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_jobs_provider_message_idx ON public.warmup_jobs USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: warmup_jobs_stuck_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_jobs_stuck_idx ON public.warmup_jobs USING btree (status, locked_at) WHERE (status = 'processing'::text);


--
-- Name: warmup_jobs_warmup_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warmup_jobs_warmup_token_key ON public.warmup_jobs USING btree (warmup_token) WHERE (warmup_token IS NOT NULL);


--
-- Name: warmup_recipients_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warmup_recipients_active_idx ON public.warmup_recipients USING btree (enabled, status, last_sent_at);


--
-- Name: warmup_recipients_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warmup_recipients_email_key ON public.warmup_recipients USING btree (lower(email));


--
-- Name: workspace_activity_ws_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_activity_ws_idx ON public.workspace_activity USING btree (workspace_id, created_at DESC);


--
-- Name: workspace_invitations_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_invitations_pending_idx ON public.workspace_invitations USING btree (workspace_id, lower(email)) WHERE (status = 'pending'::text);


--
-- Name: ai_personalizations ai_personalizations_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_personalizations_touch BEFORE UPDATE ON public.ai_personalizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: automations automations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER automations_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: billing_plan_prices billing_plan_prices_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER billing_plan_prices_touch BEFORE UPDATE ON public.billing_plan_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: billing_providers billing_providers_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER billing_providers_touch BEFORE UPDATE ON public.billing_providers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: billing_subscriptions billing_subscriptions_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER billing_subscriptions_touch BEFORE UPDATE ON public.billing_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: blog_authors blog_authors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blog_authors_updated_at BEFORE UPDATE ON public.blog_authors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: blog_posts blog_posts_slug_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blog_posts_slug_history AFTER UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.record_blog_slug_change();


--
-- Name: blog_posts blog_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: campaign_messages campaign_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaign_messages_updated_at BEFORE UPDATE ON public.campaign_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: campaign_recipients campaign_recipients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaign_recipients_updated_at BEFORE UPDATE ON public.campaign_recipients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: campaign_step_variants campaign_step_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaign_step_variants_updated_at BEFORE UPDATE ON public.campaign_step_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: campaign_steps campaign_steps_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaign_steps_updated_at BEFORE UPDATE ON public.campaign_steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: campaign_test_sends campaign_test_sends_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaign_test_sends_updated_at BEFORE UPDATE ON public.campaign_test_sends FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: campaigns campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: conversation_messages conversation_messages_direction; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversation_messages_direction AFTER INSERT ON public.conversation_messages FOR EACH ROW EXECUTE FUNCTION public.mark_conversation_direction();


--
-- Name: conversation_notes conversation_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversation_notes_updated_at BEFORE UPDATE ON public.conversation_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: conversations conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: credit_ledger credit_ledger_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER credit_ledger_no_update BEFORE DELETE OR UPDATE ON public.credit_ledger FOR EACH ROW EXECUTE FUNCTION public.credit_ledger_immutable();


--
-- Name: crm_stages crm_stages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_stages_updated_at BEFORE UPDATE ON public.crm_stages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: email_drafts email_drafts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_drafts_updated_at BEFORE UPDATE ON public.email_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: email_events email_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_events_updated_at BEFORE UPDATE ON public.email_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: email_providers email_providers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_providers_updated_at BEFORE UPDATE ON public.email_providers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: email_templates email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: guide_articles guide_articles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guide_articles_updated_at BEFORE UPDATE ON public.guide_articles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: integration_connections integration_connections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER integration_connections_updated_at BEFORE UPDATE ON public.integration_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: integrations integrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lead_lists lead_lists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_lists_updated_at BEFORE UPDATE ON public.lead_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lead_notes lead_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_notes_updated_at BEFORE UPDATE ON public.lead_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lead_tasks lead_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_tasks_updated_at BEFORE UPDATE ON public.lead_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: leads leads_set_retention; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_set_retention BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_lead_retention();


--
-- Name: leads leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notification_preferences notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: plan_grants plan_grants_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plan_grants_set_updated_at BEFORE UPDATE ON public.plan_grants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: plans plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: platform_announcements platform_announcements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER platform_announcements_updated_at BEFORE UPDATE ON public.platform_announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: platform_feature_flags platform_feature_flags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER platform_feature_flags_updated_at BEFORE UPDATE ON public.platform_feature_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: platform_settings platform_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER platform_settings_updated_at BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: privacy_requests privacy_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER privacy_requests_updated_at BEFORE UPDATE ON public.privacy_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: referral_payouts referral_payouts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER referral_payouts_updated_at BEFORE UPDATE ON public.referral_payouts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: referral_profiles referral_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER referral_profiles_updated_at BEFORE UPDATE ON public.referral_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: referral_programs referral_programs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER referral_programs_updated_at BEFORE UPDATE ON public.referral_programs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sending_accounts sending_accounts_managed_provider; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sending_accounts_managed_provider BEFORE INSERT OR UPDATE ON public.sending_accounts FOR EACH ROW EXECUTE FUNCTION public.enforce_managed_sending();


--
-- Name: sending_accounts sending_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sending_accounts_updated_at BEFORE UPDATE ON public.sending_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sending_domains sending_domains_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sending_domains_set_updated_at BEFORE UPDATE ON public.sending_domains FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: service_alerts service_alerts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER service_alerts_updated_at BEFORE UPDATE ON public.service_alerts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: site_faqs site_faqs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER site_faqs_updated_at BEFORE UPDATE ON public.site_faqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: site_nav_items site_nav_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER site_nav_items_updated_at BEFORE UPDATE ON public.site_nav_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: site_pages site_pages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER site_pages_updated_at BEFORE UPDATE ON public.site_pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: site_redirects site_redirects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER site_redirects_updated_at BEFORE UPDATE ON public.site_redirects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subprocessors subprocessors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subprocessors_updated_at BEFORE UPDATE ON public.subprocessors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: support_ticket_messages support_messages_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER support_messages_notify AFTER INSERT ON public.support_ticket_messages FOR EACH ROW EXECUTE FUNCTION public.notify_support_reply();


--
-- Name: support_tickets support_tickets_status_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER support_tickets_status_notify AFTER UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.notify_support_ticket_status();


--
-- Name: support_tickets support_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: testimonials testimonials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER testimonials_updated_at BEFORE UPDATE ON public.testimonials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: testimonials testimonials_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER testimonials_validate BEFORE INSERT OR UPDATE ON public.testimonials FOR EACH ROW EXECUTE FUNCTION public.validate_testimonial();


--
-- Name: transactional_emails transactional_emails_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transactional_emails_updated_at BEFORE UPDATE ON public.transactional_emails FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transactional_templates transactional_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transactional_templates_updated_at BEFORE UPDATE ON public.transactional_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: warmup_daily_stats warmup_daily_stats_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER warmup_daily_stats_updated_at BEFORE UPDATE ON public.warmup_daily_stats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: warmup_recipients warmup_recipients_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER warmup_recipients_set_updated_at BEFORE UPDATE ON public.warmup_recipients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: warmup_settings warmup_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER warmup_settings_updated_at BEFORE UPDATE ON public.warmup_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: workspace_invitations workspace_invitations_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_invitations_activity AFTER INSERT OR UPDATE ON public.workspace_invitations FOR EACH ROW EXECUTE FUNCTION public.log_workspace_invitation_activity();


--
-- Name: workspace_invitations workspace_invitations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_invitations_updated_at BEFORE UPDATE ON public.workspace_invitations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: workspace_members workspace_members_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_members_activity AFTER INSERT OR DELETE OR UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.log_workspace_member_activity();


--
-- Name: workspace_subscriptions workspace_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_subscriptions_updated_at BEFORE UPDATE ON public.workspace_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: workspaces workspaces_ensure_owner_member; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspaces_ensure_owner_member AFTER INSERT OR UPDATE OF owner_id ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.ensure_workspace_owner_member();


--
-- Name: workspaces workspaces_seed_crm_stages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspaces_seed_crm_stages AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.seed_workspace_crm_stages();


--
-- Name: workspaces workspaces_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ai_personalizations ai_personalizations_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_personalizations
    ADD CONSTRAINT ai_personalizations_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: ai_personalizations ai_personalizations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_personalizations
    ADD CONSTRAINT ai_personalizations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: ai_personalizations ai_personalizations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_personalizations
    ADD CONSTRAINT ai_personalizations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: automation_events automation_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_events
    ADD CONSTRAINT automation_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: automation_events automation_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_events
    ADD CONSTRAINT automation_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: automation_events automation_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_events
    ADD CONSTRAINT automation_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: automation_events automation_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_events
    ADD CONSTRAINT automation_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: automation_run_steps automation_run_steps_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_run_steps
    ADD CONSTRAINT automation_run_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.automation_runs(id) ON DELETE CASCADE;


--
-- Name: automation_run_steps automation_run_steps_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_run_steps
    ADD CONSTRAINT automation_run_steps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: automation_runs automation_runs_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;


--
-- Name: automation_runs automation_runs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: automation_runs automation_runs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.automation_events(id) ON DELETE SET NULL;


--
-- Name: automation_runs automation_runs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: automation_runs automation_runs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: automation_steps automation_steps_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_steps
    ADD CONSTRAINT automation_steps_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;


--
-- Name: automation_steps automation_steps_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_steps
    ADD CONSTRAINT automation_steps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: automations automations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: billing_audit_log billing_audit_log_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_audit_log
    ADD CONSTRAINT billing_audit_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: billing_customers billing_customers_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: billing_invoices billing_invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL;


--
-- Name: billing_invoices billing_invoices_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: billing_plan_prices billing_plan_prices_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plan_prices
    ADD CONSTRAINT billing_plan_prices_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: billing_subscriptions billing_subscriptions_pending_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pending_plan_id_fkey FOREIGN KEY (pending_plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;


--
-- Name: billing_subscriptions billing_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;


--
-- Name: billing_subscriptions billing_subscriptions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: billing_transactions billing_transactions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_transactions
    ADD CONSTRAINT billing_transactions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;


--
-- Name: billing_transactions billing_transactions_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_transactions
    ADD CONSTRAINT billing_transactions_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL;


--
-- Name: billing_transactions billing_transactions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_transactions
    ADD CONSTRAINT billing_transactions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: blog_post_slugs blog_post_slugs_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_post_slugs
    ADD CONSTRAINT blog_post_slugs_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.blog_posts(id) ON DELETE CASCADE;


--
-- Name: blog_posts blog_posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.blog_authors(id) ON DELETE SET NULL;


--
-- Name: blog_posts blog_posts_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.blog_categories(id) ON DELETE SET NULL;


--
-- Name: campaign_launch_events campaign_launch_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_launch_events
    ADD CONSTRAINT campaign_launch_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_launch_events campaign_launch_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_launch_events
    ADD CONSTRAINT campaign_launch_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_messages campaign_messages_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_messages campaign_messages_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: campaign_messages campaign_messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.campaign_recipients(id) ON DELETE CASCADE;


--
-- Name: campaign_messages campaign_messages_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: campaign_messages campaign_messages_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.campaign_steps(id) ON DELETE SET NULL;


--
-- Name: campaign_messages campaign_messages_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.campaign_step_variants(id) ON DELETE SET NULL;


--
-- Name: campaign_messages campaign_messages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_recipients campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_recipients campaign_recipients_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: campaign_recipients campaign_recipients_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: campaign_recipients campaign_recipients_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_replies campaign_replies_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_replies
    ADD CONSTRAINT campaign_replies_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_replies campaign_replies_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_replies
    ADD CONSTRAINT campaign_replies_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: campaign_replies campaign_replies_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_replies
    ADD CONSTRAINT campaign_replies_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.campaign_messages(id) ON DELETE SET NULL;


--
-- Name: campaign_replies campaign_replies_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_replies
    ADD CONSTRAINT campaign_replies_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: campaign_replies campaign_replies_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_replies
    ADD CONSTRAINT campaign_replies_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_step_variants campaign_step_variants_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_step_variants
    ADD CONSTRAINT campaign_step_variants_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_step_variants campaign_step_variants_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_step_variants
    ADD CONSTRAINT campaign_step_variants_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.campaign_steps(id) ON DELETE CASCADE;


--
-- Name: campaign_step_variants campaign_step_variants_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_step_variants
    ADD CONSTRAINT campaign_step_variants_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_steps campaign_steps_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_steps
    ADD CONSTRAINT campaign_steps_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_steps campaign_steps_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_steps
    ADD CONSTRAINT campaign_steps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_test_sends campaign_test_sends_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_test_sends
    ADD CONSTRAINT campaign_test_sends_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_test_sends campaign_test_sends_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_test_sends
    ADD CONSTRAINT campaign_test_sends_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: campaign_test_sends campaign_test_sends_webhook_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_test_sends
    ADD CONSTRAINT campaign_test_sends_webhook_event_id_fkey FOREIGN KEY (webhook_event_id) REFERENCES public.email_events(id) ON DELETE SET NULL;


--
-- Name: campaign_test_sends campaign_test_sends_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_test_sends
    ADD CONSTRAINT campaign_test_sends_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lead_lists(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: conversation_events conversation_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_events conversation_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_campaign_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_campaign_message_id_fkey FOREIGN KEY (campaign_message_id) REFERENCES public.campaign_messages(id) ON DELETE SET NULL;


--
-- Name: conversation_messages conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: conversation_messages conversation_messages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: conversation_notes conversation_notes_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_notes conversation_notes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: credit_ledger credit_ledger_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: crm_stages crm_stages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stages
    ADD CONSTRAINT crm_stages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: domain_alerts domain_alerts_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_alerts
    ADD CONSTRAINT domain_alerts_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.sending_domains(id) ON DELETE CASCADE;


--
-- Name: domain_alerts domain_alerts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_alerts
    ADD CONSTRAINT domain_alerts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: email_drafts email_drafts_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: email_drafts email_drafts_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: email_drafts email_drafts_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: email_drafts email_drafts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: email_engagement_events email_engagement_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_events
    ADD CONSTRAINT email_engagement_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: email_engagement_events email_engagement_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_events
    ADD CONSTRAINT email_engagement_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: email_engagement_events email_engagement_events_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_events
    ADD CONSTRAINT email_engagement_events_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.campaign_messages(id) ON DELETE SET NULL;


--
-- Name: email_engagement_events email_engagement_events_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_events
    ADD CONSTRAINT email_engagement_events_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: email_engagement_events email_engagement_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_engagement_events
    ADD CONSTRAINT email_engagement_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: email_events email_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: email_events email_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: email_events email_events_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: email_events email_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: email_provider_secrets email_provider_secrets_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_provider_secrets
    ADD CONSTRAINT email_provider_secrets_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.email_providers(id) ON DELETE CASCADE;


--
-- Name: email_suppressions email_suppressions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: inbound_event_actions inbound_event_actions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_event_actions
    ADD CONSTRAINT inbound_event_actions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.email_events(id) ON DELETE CASCADE;


--
-- Name: inbound_routes inbound_routes_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_routes
    ADD CONSTRAINT inbound_routes_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: inbound_routes inbound_routes_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_routes
    ADD CONSTRAINT inbound_routes_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: inbound_routes inbound_routes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_routes
    ADD CONSTRAINT inbound_routes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: inbound_routes inbound_routes_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_routes
    ADD CONSTRAINT inbound_routes_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: inbound_routes inbound_routes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_routes
    ADD CONSTRAINT inbound_routes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: inbound_tests inbound_tests_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_tests
    ADD CONSTRAINT inbound_tests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: inbound_tests inbound_tests_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_tests
    ADD CONSTRAINT inbound_tests_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: integration_connections integration_connections_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_slug_fkey FOREIGN KEY (slug) REFERENCES public.integrations(slug) ON DELETE CASCADE;


--
-- Name: integration_connections integration_connections_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: integration_events integration_events_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.integration_connections(id) ON DELETE CASCADE;


--
-- Name: integration_events integration_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: integration_secrets integration_secrets_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_secrets
    ADD CONSTRAINT integration_secrets_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.integration_connections(id) ON DELETE CASCADE;


--
-- Name: integration_sync_logs integration_sync_logs_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_sync_logs
    ADD CONSTRAINT integration_sync_logs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.integration_connections(id) ON DELETE CASCADE;


--
-- Name: integration_sync_logs integration_sync_logs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_sync_logs
    ADD CONSTRAINT integration_sync_logs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: lead_activities lead_activities_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: lead_activities lead_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_activities lead_activities_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: lead_lists lead_lists_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_lists
    ADD CONSTRAINT lead_lists_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: lead_notes lead_notes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_notes lead_notes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: lead_retention_runs lead_retention_runs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_retention_runs
    ADD CONSTRAINT lead_retention_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: lead_tasks lead_tasks_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tasks
    ADD CONSTRAINT lead_tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_tasks lead_tasks_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tasks
    ADD CONSTRAINT lead_tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: leads leads_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lead_lists(id) ON DELETE SET NULL;


--
-- Name: leads leads_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.crm_stages(id) ON DELETE SET NULL;


--
-- Name: leads leads_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: plan_features plan_features_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: plan_grants plan_grants_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_grants
    ADD CONSTRAINT plan_grants_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;


--
-- Name: plan_grants plan_grants_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_grants
    ADD CONSTRAINT plan_grants_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: platform_announcement_dismissals platform_announcement_dismissals_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcement_dismissals
    ADD CONSTRAINT platform_announcement_dismissals_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.platform_announcements(id) ON DELETE CASCADE;


--
-- Name: platform_announcement_dismissals platform_announcement_dismissals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcement_dismissals
    ADD CONSTRAINT platform_announcement_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: platform_announcements platform_announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: platform_feature_flags platform_feature_flags_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_feature_flags
    ADD CONSTRAINT platform_feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: provider_health_events provider_health_events_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_health_events
    ADD CONSTRAINT provider_health_events_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.email_providers(id) ON DELETE CASCADE;


--
-- Name: provider_routing_events provider_routing_events_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_routing_events
    ADD CONSTRAINT provider_routing_events_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.sending_domains(id) ON DELETE SET NULL;


--
-- Name: provider_routing_events provider_routing_events_previous_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_routing_events
    ADD CONSTRAINT provider_routing_events_previous_provider_id_fkey FOREIGN KEY (previous_provider_id) REFERENCES public.email_providers(id) ON DELETE SET NULL;


--
-- Name: provider_routing_events provider_routing_events_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_routing_events
    ADD CONSTRAINT provider_routing_events_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.email_providers(id) ON DELETE SET NULL;


--
-- Name: provider_routing_events provider_routing_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_routing_events
    ADD CONSTRAINT provider_routing_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: referral_attributions referral_attributions_referral_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_attributions
    ADD CONSTRAINT referral_attributions_referral_profile_id_fkey FOREIGN KEY (referral_profile_id) REFERENCES public.referral_profiles(id) ON DELETE CASCADE;


--
-- Name: referral_attributions referral_attributions_referred_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_attributions
    ADD CONSTRAINT referral_attributions_referred_workspace_id_fkey FOREIGN KEY (referred_workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: referral_audit_logs referral_audit_logs_referral_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_audit_logs
    ADD CONSTRAINT referral_audit_logs_referral_profile_id_fkey FOREIGN KEY (referral_profile_id) REFERENCES public.referral_profiles(id) ON DELETE SET NULL;


--
-- Name: referral_audit_logs referral_audit_logs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_audit_logs
    ADD CONSTRAINT referral_audit_logs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: referral_clicks referral_clicks_referral_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_clicks
    ADD CONSTRAINT referral_clicks_referral_profile_id_fkey FOREIGN KEY (referral_profile_id) REFERENCES public.referral_profiles(id) ON DELETE CASCADE;


--
-- Name: referral_commissions referral_commissions_attribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_attribution_id_fkey FOREIGN KEY (attribution_id) REFERENCES public.referral_attributions(id) ON DELETE CASCADE;


--
-- Name: referral_commissions referral_commissions_payout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.referral_payouts(id) ON DELETE SET NULL;


--
-- Name: referral_commissions referral_commissions_referral_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_referral_profile_id_fkey FOREIGN KEY (referral_profile_id) REFERENCES public.referral_profiles(id) ON DELETE CASCADE;


--
-- Name: referral_commissions referral_commissions_referred_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_referred_workspace_id_fkey FOREIGN KEY (referred_workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: referral_commissions referral_commissions_reversal_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_reversal_of_fkey FOREIGN KEY (reversal_of) REFERENCES public.referral_commissions(id) ON DELETE SET NULL;


--
-- Name: referral_fraud_flags referral_fraud_flags_attribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_fraud_flags
    ADD CONSTRAINT referral_fraud_flags_attribution_id_fkey FOREIGN KEY (attribution_id) REFERENCES public.referral_attributions(id) ON DELETE SET NULL;


--
-- Name: referral_fraud_flags referral_fraud_flags_referral_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_fraud_flags
    ADD CONSTRAINT referral_fraud_flags_referral_profile_id_fkey FOREIGN KEY (referral_profile_id) REFERENCES public.referral_profiles(id) ON DELETE CASCADE;


--
-- Name: referral_payouts referral_payouts_referral_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_payouts
    ADD CONSTRAINT referral_payouts_referral_profile_id_fkey FOREIGN KEY (referral_profile_id) REFERENCES public.referral_profiles(id) ON DELETE CASCADE;


--
-- Name: referral_profiles referral_profiles_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_profiles
    ADD CONSTRAINT referral_profiles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: sending_account_audit sending_account_audit_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_account_audit
    ADD CONSTRAINT sending_account_audit_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: sending_account_audit sending_account_audit_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_account_audit
    ADD CONSTRAINT sending_account_audit_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: sending_account_checks sending_account_checks_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_account_checks
    ADD CONSTRAINT sending_account_checks_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE CASCADE;


--
-- Name: sending_account_checks sending_account_checks_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_account_checks
    ADD CONSTRAINT sending_account_checks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: sending_account_secrets sending_account_secrets_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_account_secrets
    ADD CONSTRAINT sending_account_secrets_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE CASCADE;


--
-- Name: sending_accounts sending_accounts_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_accounts
    ADD CONSTRAINT sending_accounts_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.sending_domains(id) ON DELETE SET NULL;


--
-- Name: sending_accounts sending_accounts_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_accounts
    ADD CONSTRAINT sending_accounts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.email_providers(id) ON DELETE SET NULL;


--
-- Name: sending_accounts sending_accounts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_accounts
    ADD CONSTRAINT sending_accounts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: sending_domains sending_domains_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_domains
    ADD CONSTRAINT sending_domains_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: site_nav_items site_nav_items_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_nav_items
    ADD CONSTRAINT site_nav_items_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.site_nav_items(id) ON DELETE CASCADE;


--
-- Name: site_pages site_pages_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_pages
    ADD CONSTRAINT site_pages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: site_redirects site_redirects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_redirects
    ADD CONSTRAINT site_redirects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: site_settings site_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: support_ticket_messages support_ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: template_uses template_uses_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_uses
    ADD CONSTRAINT template_uses_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE CASCADE;


--
-- Name: template_uses template_uses_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_uses
    ADD CONSTRAINT template_uses_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: transactional_emails transactional_emails_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactional_emails
    ADD CONSTRAINT transactional_emails_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.transactional_templates(id) ON DELETE SET NULL;


--
-- Name: transactional_template_versions transactional_template_versions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactional_template_versions
    ADD CONSTRAINT transactional_template_versions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.transactional_templates(id) ON DELETE CASCADE;


--
-- Name: usage_audit_log usage_audit_log_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_audit_log
    ADD CONSTRAINT usage_audit_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: warmup_conversations warmup_conversations_recipient_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_conversations
    ADD CONSTRAINT warmup_conversations_recipient_account_id_fkey FOREIGN KEY (recipient_account_id) REFERENCES public.sending_accounts(id) ON DELETE CASCADE;


--
-- Name: warmup_conversations warmup_conversations_sender_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_conversations
    ADD CONSTRAINT warmup_conversations_sender_account_id_fkey FOREIGN KEY (sender_account_id) REFERENCES public.sending_accounts(id) ON DELETE CASCADE;


--
-- Name: warmup_conversations warmup_conversations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_conversations
    ADD CONSTRAINT warmup_conversations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: warmup_daily_stats warmup_daily_stats_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_daily_stats
    ADD CONSTRAINT warmup_daily_stats_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE CASCADE;


--
-- Name: warmup_daily_stats warmup_daily_stats_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_daily_stats
    ADD CONSTRAINT warmup_daily_stats_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: warmup_events warmup_events_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_events
    ADD CONSTRAINT warmup_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.warmup_jobs(id) ON DELETE SET NULL;


--
-- Name: warmup_events warmup_events_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_events
    ADD CONSTRAINT warmup_events_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE CASCADE;


--
-- Name: warmup_events warmup_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_events
    ADD CONSTRAINT warmup_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: warmup_health warmup_health_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_health
    ADD CONSTRAINT warmup_health_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE CASCADE;


--
-- Name: warmup_health warmup_health_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_health
    ADD CONSTRAINT warmup_health_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: warmup_jobs warmup_jobs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_jobs
    ADD CONSTRAINT warmup_jobs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.warmup_conversations(id) ON DELETE SET NULL;


--
-- Name: warmup_jobs warmup_jobs_pool_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_jobs
    ADD CONSTRAINT warmup_jobs_pool_recipient_id_fkey FOREIGN KEY (pool_recipient_id) REFERENCES public.warmup_recipients(id) ON DELETE SET NULL;


--
-- Name: warmup_jobs warmup_jobs_recipient_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_jobs
    ADD CONSTRAINT warmup_jobs_recipient_account_id_fkey FOREIGN KEY (recipient_account_id) REFERENCES public.sending_accounts(id) ON DELETE SET NULL;


--
-- Name: warmup_jobs warmup_jobs_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_jobs
    ADD CONSTRAINT warmup_jobs_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE CASCADE;


--
-- Name: warmup_jobs warmup_jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_jobs
    ADD CONSTRAINT warmup_jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: warmup_settings warmup_settings_sending_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_settings
    ADD CONSTRAINT warmup_settings_sending_account_id_fkey FOREIGN KEY (sending_account_id) REFERENCES public.sending_accounts(id) ON DELETE CASCADE;


--
-- Name: warmup_settings warmup_settings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_settings
    ADD CONSTRAINT warmup_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_activity workspace_activity_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_activity
    ADD CONSTRAINT workspace_activity_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_ai_keys workspace_ai_keys_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_ai_keys
    ADD CONSTRAINT workspace_ai_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_credits workspace_credits_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_credits
    ADD CONSTRAINT workspace_credits_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_invitations workspace_invitations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_subscriptions workspace_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: workspace_subscriptions workspace_subscriptions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_usage_counters workspace_usage_counters_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_usage_counters
    ADD CONSTRAINT workspace_usage_counters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: testimonials Active testimonials are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active testimonials are public" ON public.testimonials FOR SELECT USING ((active = true));


--
-- Name: site_faqs Admins can delete FAQs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete FAQs" ON public.site_faqs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: testimonials Admins can delete testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete testimonials" ON public.testimonials FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_faqs Admins can insert FAQs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert FAQs" ON public.site_faqs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: testimonials Admins can insert testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert testimonials" ON public.testimonials FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: testimonials Admins can read all testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all testimonials" ON public.testimonials FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_faqs Admins can read every FAQ; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read every FAQ" ON public.site_faqs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: inbound_event_actions Admins can read inbound event actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read inbound event actions" ON public.inbound_event_actions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: outbound_messages Admins can read outbound message classification; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read outbound message classification" ON public.outbound_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_faqs Admins can update FAQs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update FAQs" ON public.site_faqs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: testimonials Admins can update testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update testimonials" ON public.testimonials FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: blog_authors Admins manage authors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage authors" ON public.blog_authors TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: blog_categories Admins manage categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage categories" ON public.blog_categories TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: referral_fraud_flags Admins manage fraud flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage fraud flags" ON public.referral_fraud_flags TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: blog_media Admins manage media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage media" ON public.blog_media TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_nav_items Admins manage navigation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage navigation" ON public.site_nav_items TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: platform_settings Admins manage platform settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage platform settings" ON public.platform_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: blog_posts Admins manage posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage posts" ON public.blog_posts TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: referral_programs Admins manage program settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage program settings" ON public.referral_programs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_redirects Admins manage redirects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage redirects" ON public.site_redirects TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: referral_profiles Admins manage referral profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage referral profiles" ON public.referral_profiles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_settings Admins manage site settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage site settings" ON public.site_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: blog_post_slugs Admins manage slug history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage slug history" ON public.blog_post_slugs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: warmup_recipients Admins manage warmup recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage warmup recipients" ON public.warmup_recipients TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_pages Admins manage website pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage website pages" ON public.site_pages TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ai_runner_state Admins read AI runner state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read AI runner state" ON public.ai_runner_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: blog_posts Admins read all posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all posts" ON public.blog_posts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: referral_billing_events Admins read billing events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read billing events" ON public.referral_billing_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_events Admins read email events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read email events" ON public.email_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: lead_retention_runs Admins read lead retention runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read lead retention runs" ON public.lead_retention_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: provider_health_events Admins read provider health events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read provider health events" ON public.provider_health_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: newsletter_subscribers Admins read subscribers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read subscribers" ON public.newsletter_subscribers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: unmatched_inbound_emails Admins read unmatched inbound; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read unmatched inbound" ON public.unmatched_inbound_emails FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: blog_authors Authors are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors are public" ON public.blog_authors FOR SELECT USING (true);


--
-- Name: conversation_notes Authors or managers delete notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors or managers delete notes" ON public.conversation_notes FOR DELETE TO authenticated USING (((author_id = auth.uid()) OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])));


--
-- Name: lead_notes Authors update lead notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors update lead notes" ON public.lead_notes FOR UPDATE TO authenticated USING ((public.is_workspace_member(workspace_id, auth.uid()) AND (author_id = auth.uid()))) WITH CHECK ((public.is_workspace_member(workspace_id, auth.uid()) AND (author_id = auth.uid())));


--
-- Name: conversation_notes Authors update notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors update notes" ON public.conversation_notes FOR UPDATE TO authenticated USING ((author_id = auth.uid())) WITH CHECK ((author_id = auth.uid()));


--
-- Name: campaign_test_sends Campaign managers create campaign test diagnostics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign managers create campaign test diagnostics" ON public.campaign_test_sends FOR INSERT TO authenticated WITH CHECK (((requested_by = auth.uid()) AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])));


--
-- Name: campaign_test_sends Campaign managers update campaign test diagnostics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign managers update campaign test diagnostics" ON public.campaign_test_sends FOR UPDATE TO authenticated USING (((requested_by = auth.uid()) AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]))) WITH CHECK (((requested_by = auth.uid()) AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])));


--
-- Name: blog_categories Categories are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Categories are public" ON public.blog_categories FOR SELECT USING (true);


--
-- Name: campaign_messages Managers create campaign messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers create campaign messages" ON public.campaign_messages FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: email_templates Managers create workspace templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers create workspace templates" ON public.email_templates FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR ((NOT is_official) AND (workspace_id IS NOT NULL) AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]))));


--
-- Name: automations Managers delete automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers delete automations" ON public.automations FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_messages Managers delete campaign messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers delete campaign messages" ON public.campaign_messages FOR DELETE TO authenticated USING ((public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: conversations Managers delete conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers delete conversations" ON public.conversations FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));


--
-- Name: email_templates Managers delete own workspace templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers delete own workspace templates" ON public.email_templates FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR ((NOT is_official) AND (workspace_id IS NOT NULL) AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]))));


--
-- Name: automations Managers insert automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers insert automations" ON public.automations FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: automations Managers update automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update automations" ON public.automations FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_messages Managers update campaign messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update campaign messages" ON public.campaign_messages FOR UPDATE TO authenticated USING ((public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]) OR public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK ((public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: email_templates Managers update own workspace templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update own workspace templates" ON public.email_templates FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR ((NOT is_official) AND (workspace_id IS NOT NULL) AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR ((NOT is_official) AND (workspace_id IS NOT NULL) AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]))));


--
-- Name: automation_steps Managers write automation steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers write automation steps" ON public.automation_steps TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: blog_media Media is public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Media is public" ON public.blog_media FOR SELECT USING (true);


--
-- Name: campaign_replies Members can add replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can add replies" ON public.campaign_replies FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: campaign_replies Members can delete replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can delete replies" ON public.campaign_replies FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_replies Members can read replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can read replies" ON public.campaign_replies FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: campaign_replies Members can update replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can update replies" ON public.campaign_replies FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: lead_notes Members create lead notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members create lead notes" ON public.lead_notes FOR INSERT TO authenticated WITH CHECK ((public.is_workspace_member(workspace_id, auth.uid()) AND (author_id = auth.uid())));


--
-- Name: lead_tasks Members create lead tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members create lead tasks" ON public.lead_tasks FOR INSERT TO authenticated WITH CHECK ((public.is_workspace_member(workspace_id, auth.uid()) AND (created_by = auth.uid())));


--
-- Name: conversation_notes Members create notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members create notes" ON public.conversation_notes FOR INSERT TO authenticated WITH CHECK ((public.is_workspace_member(workspace_id, auth.uid()) AND (author_id = auth.uid())));


--
-- Name: ai_personalizations Members create workspace personalizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members create workspace personalizations" ON public.ai_personalizations FOR INSERT TO authenticated WITH CHECK ((public.is_workspace_member(workspace_id, auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE ((c.id = ai_personalizations.campaign_id) AND (c.workspace_id = ai_personalizations.workspace_id)))) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = ai_personalizations.lead_id) AND (l.workspace_id = ai_personalizations.workspace_id))))));


--
-- Name: lead_notes Members delete lead notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members delete lead notes" ON public.lead_notes FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: lead_tasks Members delete lead tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members delete lead tasks" ON public.lead_tasks FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: ai_personalizations Members delete workspace personalizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members delete workspace personalizations" ON public.ai_personalizations FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: conversation_events Members insert conversation events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members insert conversation events" ON public.conversation_events FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: conversation_messages Members insert conversation messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members insert conversation messages" ON public.conversation_messages FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: email_drafts Members manage their drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members manage their drafts" ON public.email_drafts TO authenticated USING (((user_id = auth.uid()) AND public.is_workspace_member(workspace_id, auth.uid()))) WITH CHECK (((user_id = auth.uid()) AND public.is_workspace_member(workspace_id, auth.uid())));


--
-- Name: automation_events Members read automation events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read automation events" ON public.automation_events FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: automation_run_steps Members read automation run steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read automation run steps" ON public.automation_run_steps FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: automation_runs Members read automation runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read automation runs" ON public.automation_runs FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: automation_steps Members read automation steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read automation steps" ON public.automation_steps FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: automations Members read automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read automations" ON public.automations FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: campaign_messages Members read campaign messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read campaign messages" ON public.campaign_messages FOR SELECT TO authenticated USING ((public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: conversation_events Members read conversation events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read conversation events" ON public.conversation_events FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: conversation_messages Members read conversation messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read conversation messages" ON public.conversation_messages FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: conversations Members read conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read conversations" ON public.conversations FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: email_engagement_events Members read engagement events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read engagement events" ON public.email_engagement_events FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: lead_activities Members read lead activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read lead activity" ON public.lead_activities FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: lead_notes Members read lead notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read lead notes" ON public.lead_notes FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: lead_tasks Members read lead tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read lead tasks" ON public.lead_tasks FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: conversation_notes Members read notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read notes" ON public.conversation_notes FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: plan_grants Members read own workspace grants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read own workspace grants" ON public.plan_grants FOR SELECT TO authenticated USING ((public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: template_uses Members read template uses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read template uses" ON public.template_uses FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: ai_personalizations Members read workspace personalizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read workspace personalizations" ON public.ai_personalizations FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: workspace_usage_counters Members read workspace usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read workspace usage" ON public.workspace_usage_counters FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: template_uses Members record template uses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members record template uses" ON public.template_uses FOR INSERT TO authenticated WITH CHECK ((public.is_workspace_member(workspace_id, auth.uid()) AND (user_id = auth.uid())));


--
-- Name: conversations Members update conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members update conversations" ON public.conversations FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: lead_tasks Members update lead tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members update lead tasks" ON public.lead_tasks FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: ai_personalizations Members update workspace personalizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members update workspace personalizations" ON public.ai_personalizations FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: conversations Members write conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members write conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: lead_activities Members write lead activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members write lead activity" ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: plan_features Plan features are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Plan features are publicly readable" ON public.plan_features FOR SELECT TO authenticated, anon USING (true);


--
-- Name: plans Plans are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Plans are publicly readable" ON public.plans FOR SELECT TO authenticated, anon USING (true);


--
-- Name: admin_audit_log Platform admins can read admin audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can read admin audit log" ON public.admin_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: admin_notifications Platform admins can read notification audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can read notification audit" ON public.admin_notifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: referral_webhook_events Platform staff can read referral webhook events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform staff can read referral webhook events" ON public.referral_webhook_events FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'support'::public.app_role)));


--
-- Name: site_nav_items Public can read navigation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read navigation" ON public.site_nav_items FOR SELECT USING (true);


--
-- Name: site_redirects Public can read redirects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read redirects" ON public.site_redirects FOR SELECT USING (true);


--
-- Name: site_settings Public can read site settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read site settings" ON public.site_settings FOR SELECT USING (true);


--
-- Name: site_pages Public can read website pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read website pages" ON public.site_pages FOR SELECT USING (true);


--
-- Name: site_faqs Published FAQs are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Published FAQs are public" ON public.site_faqs FOR SELECT TO authenticated, anon USING ((published = true));


--
-- Name: blog_posts Published posts are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Published posts are public" ON public.blog_posts FOR SELECT USING (((status = 'published'::public.blog_post_status) AND (published_at IS NOT NULL) AND (published_at <= now())));


--
-- Name: email_templates Read official or own workspace templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read official or own workspace templates" ON public.email_templates FOR SELECT TO authenticated USING (((is_official AND published) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR ((workspace_id IS NOT NULL) AND public.is_workspace_member(workspace_id, auth.uid()))));


--
-- Name: referral_attributions Referrers read own attributions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Referrers read own attributions" ON public.referral_attributions FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (referrer_user_id = auth.uid())));


--
-- Name: referral_audit_logs Referrers read own audit trail; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Referrers read own audit trail" ON public.referral_audit_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (referral_profile_id IN ( SELECT referral_profiles.id
   FROM public.referral_profiles
  WHERE (referral_profiles.user_id = auth.uid())))));


--
-- Name: referral_clicks Referrers read own clicks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Referrers read own clicks" ON public.referral_clicks FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (referral_profile_id IN ( SELECT referral_profiles.id
   FROM public.referral_profiles
  WHERE (referral_profiles.user_id = auth.uid())))));


--
-- Name: referral_commissions Referrers read own commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Referrers read own commissions" ON public.referral_commissions FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (referrer_user_id = auth.uid())));


--
-- Name: referral_payouts Referrers read own payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Referrers read own payouts" ON public.referral_payouts FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (user_id = auth.uid())));


--
-- Name: referral_profiles Referrers read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Referrers read own profile" ON public.referral_profiles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: referral_profiles Referrers update own payout preference; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Referrers update own payout preference" ON public.referral_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: referral_programs Signed-in users read program settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Signed-in users read program settings" ON public.referral_programs FOR SELECT TO authenticated USING (true);


--
-- Name: blog_post_slugs Slug history is public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Slug history is public" ON public.blog_post_slugs FOR SELECT USING (true);


--
-- Name: notifications Users delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications Users insert own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: notifications Users read own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications Users update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: email_suppressions Workspace members can view suppressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can view suppressions" ON public.email_suppressions FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: campaign_test_sends Workspace members read campaign test diagnostics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members read campaign test diagnostics" ON public.campaign_test_sends FOR SELECT TO authenticated USING ((public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: sending_account_audit Workspace members read sending account audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members read sending account audit" ON public.sending_account_audit FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: admin_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_personalizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_personalizations ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_runner_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_runner_state ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_announcements announcements admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "announcements admin manage" ON public.platform_announcements TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: platform_announcements announcements readable when live; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "announcements readable when live" ON public.platform_announcements FOR SELECT TO authenticated USING (((enabled = true) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at >= now()))));


--
-- Name: automation_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_run_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_run_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_audit_log billing_audit_log read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "billing_audit_log read" ON public.billing_audit_log FOR SELECT TO authenticated USING ((((workspace_id IS NOT NULL) AND public.is_workspace_member(workspace_id, auth.uid())) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: billing_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_customers billing_customers member read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "billing_customers member read" ON public.billing_customers FOR SELECT TO authenticated USING ((public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: billing_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_invoices billing_invoices member read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "billing_invoices member read" ON public.billing_invoices FOR SELECT TO authenticated USING ((((workspace_id IS NOT NULL) AND public.is_workspace_member(workspace_id, auth.uid())) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: billing_plan_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_plan_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_plan_prices billing_plan_prices admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "billing_plan_prices admin manage" ON public.billing_plan_prices TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: billing_plan_prices billing_plan_prices readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "billing_plan_prices readable" ON public.billing_plan_prices FOR SELECT TO authenticated USING (true);


--
-- Name: billing_provider_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_provider_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_providers billing_providers admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "billing_providers admin manage" ON public.billing_providers TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: billing_providers billing_providers readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "billing_providers readable" ON public.billing_providers FOR SELECT TO authenticated USING (true);


--
-- Name: billing_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_subscriptions billing_subscriptions member read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "billing_subscriptions member read" ON public.billing_subscriptions FOR SELECT TO authenticated USING ((public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: billing_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_transactions billing_transactions member read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "billing_transactions member read" ON public.billing_transactions FOR SELECT TO authenticated USING ((((workspace_id IS NOT NULL) AND public.is_workspace_member(workspace_id, auth.uid())) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: billing_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_webhook_events billing_webhook_events admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "billing_webhook_events admin read" ON public.billing_webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: blog_authors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_authors ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_media ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_post_slugs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_post_slugs ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_launch_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_launch_events ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_recipients campaign_recipients_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_recipients_delete ON public.campaign_recipients FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_recipients campaign_recipients_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_recipients_insert ON public.campaign_recipients FOR INSERT TO authenticated WITH CHECK ((public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE ((c.id = campaign_recipients.campaign_id) AND (c.workspace_id = campaign_recipients.workspace_id)))) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = campaign_recipients.lead_id) AND (l.workspace_id = campaign_recipients.workspace_id))))));


--
-- Name: campaign_recipients campaign_recipients_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_recipients_select ON public.campaign_recipients FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: campaign_recipients campaign_recipients_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_recipients_update ON public.campaign_recipients FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_step_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_step_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_step_variants campaign_step_variants_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_step_variants_delete ON public.campaign_step_variants FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_step_variants campaign_step_variants_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_step_variants_insert ON public.campaign_step_variants FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_step_variants campaign_step_variants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_step_variants_select ON public.campaign_step_variants FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: campaign_step_variants campaign_step_variants_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_step_variants_update ON public.campaign_step_variants FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_steps campaign_steps_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_steps_delete ON public.campaign_steps FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_steps campaign_steps_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_steps_insert ON public.campaign_steps FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_steps campaign_steps_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_steps_select ON public.campaign_steps FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: campaign_steps campaign_steps_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_steps_update ON public.campaign_steps FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaign_test_sends; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_test_sends ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns campaigns_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_delete ON public.campaigns FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));


--
-- Name: campaigns campaigns_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_insert ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: campaigns campaigns_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_select ON public.campaigns FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: campaigns campaigns_select_platform_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_select_platform_admin ON public.campaigns FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: campaigns campaigns_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_update ON public.campaigns FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: conversation_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_ledger credit_ledger_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY credit_ledger_member_read ON public.credit_ledger FOR SELECT TO authenticated USING ((public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: workspace_credits credits_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY credits_member_read ON public.workspace_credits FOR SELECT TO authenticated USING ((public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: crm_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_stages crm_stages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_stages_select ON public.crm_stages FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: crm_stages crm_stages_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_stages_write ON public.crm_stages TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role, 'inbox_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role, 'inbox_manager'::public.workspace_role]));


--
-- Name: domain_alerts domain alerts readable by workspace members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "domain alerts readable by workspace members" ON public.domain_alerts FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: domain_alerts domain alerts resolvable by workspace members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "domain alerts resolvable by workspace members" ON public.domain_alerts FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: domain_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.domain_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_engagement_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_engagement_events ENABLE ROW LEVEL SECURITY;

--
-- Name: email_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

--
-- Name: email_provider_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_provider_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: email_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: email_providers email_providers_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_providers_admin_all ON public.email_providers TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_suppressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_feature_flags flags admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "flags admin manage" ON public.platform_feature_flags TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: platform_feature_flags flags readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "flags readable" ON public.platform_feature_flags FOR SELECT TO authenticated USING ((audience = 'customer'::text));


--
-- Name: guide_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guide_articles ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_articles guide_articles_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guide_articles_admin_all ON public.guide_articles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: guide_articles guide_articles_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guide_articles_public_read ON public.guide_articles FOR SELECT USING ((published = true));


--
-- Name: inbound_event_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbound_event_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: inbound_routes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbound_routes ENABLE ROW LEVEL SECURITY;

--
-- Name: inbound_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbound_tests ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_connections integration_connections_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integration_connections_admin ON public.integration_connections TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: integration_connections integration_connections_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integration_connections_select ON public.integration_connections FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: integration_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_events integration_events_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integration_events_admin ON public.integration_events TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: integration_events integration_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integration_events_select ON public.integration_events FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: integration_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_sync_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_sync_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_sync_logs integration_sync_logs_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integration_sync_logs_admin ON public.integration_sync_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: integration_sync_logs integration_sync_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integration_sync_logs_select ON public.integration_sync_logs FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations integrations_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integrations_admin_all ON public.integrations TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: integrations integrations_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integrations_public_read ON public.integrations FOR SELECT TO authenticated, anon USING (true);


--
-- Name: workspace_invitations invitations readable by workspace admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "invitations readable by workspace admins" ON public.workspace_invitations FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));


--
-- Name: campaign_launch_events launch events readable by workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "launch events readable by workspace" ON public.campaign_launch_events FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: campaign_launch_events launch events writable by workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "launch events writable by workspace" ON public.campaign_launch_events FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: lead_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_lists lead_lists_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_lists_delete ON public.lead_lists FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));


--
-- Name: lead_lists lead_lists_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_lists_insert ON public.lead_lists FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: lead_lists lead_lists_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_lists_select ON public.lead_lists FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: lead_lists lead_lists_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_lists_update ON public.lead_lists FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: lead_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_retention_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_retention_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_delete ON public.leads FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: leads leads_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_insert ON public.leads FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: leads leads_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: leads leads_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: sending_account_checks mailbox checks readable by workspace members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mailbox checks readable by workspace members" ON public.sending_account_checks FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: sending_account_checks mailbox checks writable by workspace members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mailbox checks writable by workspace members" ON public.sending_account_checks FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: workspace_members members_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_delete_admin ON public.workspace_members FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])));


--
-- Name: workspace_members members_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_insert_admin ON public.workspace_members FOR INSERT TO authenticated WITH CHECK ((((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = auth.uid()))))) OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])));


--
-- Name: workspace_members members_select_platform_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_select_platform_admin ON public.workspace_members FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: workspace_members members_select_same_workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_select_same_workspace ON public.workspace_members FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_workspace_member(workspace_id, auth.uid())));


--
-- Name: workspace_members members_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_update_admin ON public.workspace_members FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));


--
-- Name: newsletter_subscribers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences notification_preferences_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_own ON public.notification_preferences TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: outbound_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbound_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_announcement_dismissals own dismissals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own dismissals" ON public.platform_announcement_dismissals TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: plan_features; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: transactional_emails platform admins read transactional emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform admins read transactional emails" ON public.transactional_emails FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: transactional_templates platform admins read transactional templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform admins read transactional templates" ON public.transactional_templates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: transactional_template_versions platform admins read transactional versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform admins read transactional versions" ON public.transactional_template_versions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: platform_announcement_dismissals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_announcement_dismissals ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_feature_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: privacy_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: privacy_requests privacy_requests_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY privacy_requests_admin_all ON public.privacy_requests TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: profiles profiles_select_platform_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_platform_admin ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: provider_health_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_health_events ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_routing_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_routing_events ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_routing_events provider_routing_events_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_routing_events_admin_read ON public.provider_routing_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: referral_attributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_billing_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_billing_events ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_clicks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_fraud_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_fraud_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_programs ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: sending_account_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sending_account_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: sending_account_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sending_account_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: sending_account_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sending_account_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: sending_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sending_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: sending_accounts sending_accounts_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sending_accounts_admin_all ON public.sending_accounts TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sending_accounts sending_accounts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sending_accounts_delete ON public.sending_accounts FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));


--
-- Name: sending_accounts sending_accounts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sending_accounts_insert ON public.sending_accounts FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: sending_accounts sending_accounts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sending_accounts_select ON public.sending_accounts FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: sending_accounts sending_accounts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sending_accounts_update ON public.sending_accounts FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: sending_domains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sending_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sending_domains sending_domains_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sending_domains_admin_all ON public.sending_domains TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sending_domains sending_domains_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sending_domains_delete ON public.sending_domains FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));


--
-- Name: sending_domains sending_domains_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sending_domains_insert ON public.sending_domains FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: sending_domains sending_domains_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sending_domains_select ON public.sending_domains FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: sending_domains sending_domains_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sending_domains_update ON public.sending_domains FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: service_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: service_alerts service_alerts_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_alerts_admin_all ON public.service_alerts TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: service_alerts service_alerts_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_alerts_public_read ON public.service_alerts FOR SELECT USING ((published = true));


--
-- Name: site_faqs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_faqs ENABLE ROW LEVEL SECURITY;

--
-- Name: site_nav_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_nav_items ENABLE ROW LEVEL SECURITY;

--
-- Name: site_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: site_redirects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_redirects ENABLE ROW LEVEL SECURITY;

--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: subprocessors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subprocessors ENABLE ROW LEVEL SECURITY;

--
-- Name: subprocessors subprocessors_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subprocessors_admin_all ON public.subprocessors TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: subprocessors subprocessors_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subprocessors_public_read ON public.subprocessors FOR SELECT USING ((published = true));


--
-- Name: support_ticket_messages support_messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_messages_insert ON public.support_ticket_messages FOR INSERT TO authenticated WITH CHECK (((author_id = auth.uid()) AND ((is_internal = false) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'support'::public.app_role)) AND (EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE ((t.id = support_ticket_messages.ticket_id) AND ((t.created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'support'::public.app_role)))))));


--
-- Name: support_ticket_messages support_messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_messages_select ON public.support_ticket_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE ((t.id = support_ticket_messages.ticket_id) AND (((t.created_by = auth.uid()) AND (support_ticket_messages.is_internal = false)) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'support'::public.app_role))))));


--
-- Name: support_ticket_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets support_tickets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_tickets_insert ON public.support_tickets FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));


--
-- Name: support_tickets support_tickets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_tickets_select ON public.support_tickets FOR SELECT TO authenticated USING (((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'support'::public.app_role)));


--
-- Name: support_tickets support_tickets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_tickets_update ON public.support_tickets FOR UPDATE TO authenticated USING (((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'support'::public.app_role))) WITH CHECK (((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'support'::public.app_role)));


--
-- Name: template_uses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_uses ENABLE ROW LEVEL SECURITY;

--
-- Name: testimonials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

--
-- Name: transactional_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactional_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: transactional_template_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactional_template_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: transactional_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactional_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: unmatched_inbound_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unmatched_inbound_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_audit_log usage_audit_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usage_audit_read ON public.usage_audit_log FOR SELECT TO authenticated USING ((public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: warmup_conversations warmup conversations readable by workspace members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warmup conversations readable by workspace members" ON public.warmup_conversations FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: warmup_events warmup events readable by workspace members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warmup events readable by workspace members" ON public.warmup_events FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: warmup_health warmup health readable by workspace members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warmup health readable by workspace members" ON public.warmup_health FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: warmup_jobs warmup jobs readable by workspace members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warmup jobs readable by workspace members" ON public.warmup_jobs FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: warmup_runner_state warmup runner state readable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warmup runner state readable by admins" ON public.warmup_runner_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: warmup_settings warmup settings deletable by managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warmup settings deletable by managers" ON public.warmup_settings FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));


--
-- Name: warmup_settings warmup settings insertable by managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warmup settings insertable by managers" ON public.warmup_settings FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: warmup_settings warmup settings readable by workspace members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warmup settings readable by workspace members" ON public.warmup_settings FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: warmup_settings warmup settings updatable by managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warmup settings updatable by managers" ON public.warmup_settings FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role])) WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role, 'campaign_manager'::public.workspace_role]));


--
-- Name: warmup_daily_stats warmup stats readable by workspace members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warmup stats readable by workspace members" ON public.warmup_daily_stats FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: warmup_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warmup_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: warmup_daily_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warmup_daily_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: warmup_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warmup_events ENABLE ROW LEVEL SECURITY;

--
-- Name: warmup_health; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warmup_health ENABLE ROW LEVEL SECURITY;

--
-- Name: warmup_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warmup_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: warmup_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warmup_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: warmup_runner_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warmup_runner_state ENABLE ROW LEVEL SECURITY;

--
-- Name: warmup_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warmup_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_activity workspace_activity_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_activity_select ON public.workspace_activity FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: workspace_ai_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_ai_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_credits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_subscriptions workspace_subscriptions_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_subscriptions_admin ON public.workspace_subscriptions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: workspace_subscriptions workspace_subscriptions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_subscriptions_select ON public.workspace_subscriptions FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));


--
-- Name: workspace_usage_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_usage_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces workspaces_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_delete_owner ON public.workspaces FOR DELETE TO authenticated USING ((owner_id = auth.uid()));


--
-- Name: workspaces workspaces_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_insert_own ON public.workspaces FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));


--
-- Name: workspaces workspaces_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_select_member ON public.workspaces FOR SELECT TO authenticated USING (((owner_id = auth.uid()) OR public.is_workspace_member(id, auth.uid())));


--
-- Name: workspaces workspaces_select_platform_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_select_platform_admin ON public.workspaces FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: workspaces workspaces_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_update_admin ON public.workspaces FOR UPDATE TO authenticated USING (((owner_id = auth.uid()) OR public.has_workspace_role(id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]))) WITH CHECK (((owner_id = auth.uid()) OR public.has_workspace_role(id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION accept_workspace_invitation(_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accept_workspace_invitation(_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_workspace_invitation(_token text) TO authenticated;
GRANT ALL ON FUNCTION public.accept_workspace_invitation(_token text) TO service_role;


--
-- Name: FUNCTION analytics_by_account(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.analytics_by_account(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_by_account(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.analytics_by_account(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION analytics_by_campaign(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.analytics_by_campaign(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_by_campaign(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.analytics_by_campaign(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION analytics_summary(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.analytics_summary(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_summary(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.analytics_summary(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION analytics_timeseries(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone, _bucket text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.analytics_timeseries(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone, _bucket text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_timeseries(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone, _bucket text) TO authenticated;
GRANT ALL ON FUNCTION public.analytics_timeseries(_workspace_id uuid, _from timestamp with time zone, _to timestamp with time zone, _bucket text) TO service_role;


--
-- Name: TABLE credit_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.credit_ledger TO anon;
GRANT ALL ON TABLE public.credit_ledger TO authenticated;
GRANT ALL ON TABLE public.credit_ledger TO service_role;


--
-- Name: FUNCTION apply_credit_change(_workspace_id uuid, _amount bigint, _entry_type text, _reason text, _reference text, _actor text, _actor_user_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_credit_change(_workspace_id uuid, _amount bigint, _entry_type text, _reason text, _reference text, _actor text, _actor_user_id uuid, _user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_credit_change(_workspace_id uuid, _amount bigint, _entry_type text, _reason text, _reference text, _actor text, _actor_user_id uuid, _user_id uuid) TO service_role;


--
-- Name: TABLE ai_personalizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_personalizations TO anon;
GRANT ALL ON TABLE public.ai_personalizations TO authenticated;
GRANT ALL ON TABLE public.ai_personalizations TO service_role;


--
-- Name: FUNCTION claim_ai_personalization_jobs(_worker text, _limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_ai_personalization_jobs(_worker text, _limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_ai_personalization_jobs(_worker text, _limit integer) TO service_role;


--
-- Name: TABLE automation_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.automation_runs TO anon;
GRANT ALL ON TABLE public.automation_runs TO authenticated;
GRANT ALL ON TABLE public.automation_runs TO service_role;


--
-- Name: FUNCTION claim_automation_runs(_worker text, _limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_automation_runs(_worker text, _limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_automation_runs(_worker text, _limit integer) TO service_role;


--
-- Name: TABLE warmup_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warmup_jobs TO anon;
GRANT ALL ON TABLE public.warmup_jobs TO authenticated;
GRANT ALL ON TABLE public.warmup_jobs TO service_role;


--
-- Name: FUNCTION claim_warmup_jobs(_worker text, _limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_warmup_jobs(_worker text, _limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_warmup_jobs(_worker text, _limit integer) TO service_role;


--
-- Name: FUNCTION claim_warmup_jobs_for_account(_worker text, _limit integer, _account uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_warmup_jobs_for_account(_worker text, _limit integer, _account uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_warmup_jobs_for_account(_worker text, _limit integer, _account uuid) TO service_role;


--
-- Name: FUNCTION consume_workspace_usage(_workspace_id uuid, _resource text, _period_start date, _amount bigint, _limit bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_workspace_usage(_workspace_id uuid, _resource text, _period_start date, _amount bigint, _limit bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_workspace_usage(_workspace_id uuid, _resource text, _period_start date, _amount bigint, _limit bigint) TO service_role;


--
-- Name: FUNCTION consume_workspace_usage_v2(_workspace_id uuid, _resource text, _amount bigint, _environment text, _dry_run boolean, _reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_workspace_usage_v2(_workspace_id uuid, _resource text, _amount bigint, _environment text, _dry_run boolean, _reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_workspace_usage_v2(_workspace_id uuid, _resource text, _amount bigint, _environment text, _dry_run boolean, _reason text) TO service_role;


--
-- Name: FUNCTION credit_ledger_immutable(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.credit_ledger_immutable() FROM PUBLIC;
GRANT ALL ON FUNCTION public.credit_ledger_immutable() TO service_role;


--
-- Name: FUNCTION delete_crm_stage(_stage_id uuid, _move_to uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_crm_stage(_stage_id uuid, _move_to uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_crm_stage(_stage_id uuid, _move_to uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_crm_stage(_stage_id uuid, _move_to uuid) TO service_role;


--
-- Name: FUNCTION delete_workspace(_workspace_id uuid, _confirm text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_workspace(_workspace_id uuid, _confirm text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_workspace(_workspace_id uuid, _confirm text) TO authenticated;
GRANT ALL ON FUNCTION public.delete_workspace(_workspace_id uuid, _confirm text) TO service_role;


--
-- Name: FUNCTION enforce_managed_sending(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_managed_sending() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_managed_sending() TO service_role;


--
-- Name: FUNCTION ensure_crm_stages(_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_crm_stages(_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_crm_stages(_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_crm_stages(_workspace_id uuid) TO service_role;


--
-- Name: TABLE referral_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_profiles TO anon;
GRANT ALL ON TABLE public.referral_profiles TO authenticated;
GRANT ALL ON TABLE public.referral_profiles TO service_role;


--
-- Name: FUNCTION ensure_referral_profile(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_referral_profile() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_referral_profile() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_referral_profile() TO service_role;


--
-- Name: FUNCTION ensure_workspace_owner_member(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_workspace_owner_member() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_workspace_owner_member() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO postgres;
GRANT ALL ON FUNCTION public.handle_new_user() TO supabase_admin;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO postgres;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO supabase_admin;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
-- Name: FUNCTION has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[]) TO authenticated;
GRANT ALL ON FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[]) TO postgres;
GRANT ALL ON FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[]) TO supabase_admin;
GRANT ALL ON FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[]) TO service_role;


--
-- Name: FUNCTION invite_workspace_member(_workspace_id uuid, _email text, _role public.workspace_role, _message text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.invite_workspace_member(_workspace_id uuid, _email text, _role public.workspace_role, _message text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invite_workspace_member(_workspace_id uuid, _email text, _role public.workspace_role, _message text) TO authenticated;
GRANT ALL ON FUNCTION public.invite_workspace_member(_workspace_id uuid, _email text, _role public.workspace_role, _message text) TO service_role;


--
-- Name: FUNCTION is_workspace_member(_workspace_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid) TO supabase_admin;
GRANT ALL ON FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION log_workspace_invitation_activity(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_workspace_invitation_activity() FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_workspace_invitation_activity() TO service_role;


--
-- Name: FUNCTION log_workspace_member_activity(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_workspace_member_activity() FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_workspace_member_activity() TO service_role;


--
-- Name: FUNCTION mark_conversation_direction(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_conversation_direction() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_conversation_direction() TO service_role;


--
-- Name: FUNCTION mark_conversation_outbound(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_conversation_outbound() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_conversation_outbound() TO postgres;
GRANT ALL ON FUNCTION public.mark_conversation_outbound() TO supabase_admin;
GRANT ALL ON FUNCTION public.mark_conversation_outbound() TO service_role;


--
-- Name: FUNCTION move_crm_contacts(_lead_ids uuid[], _stage_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.move_crm_contacts(_lead_ids uuid[], _stage_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.move_crm_contacts(_lead_ids uuid[], _stage_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.move_crm_contacts(_lead_ids uuid[], _stage_id uuid) TO service_role;


--
-- Name: FUNCTION notify_support_reply(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_support_reply() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_support_reply() TO service_role;


--
-- Name: FUNCTION notify_support_ticket_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_support_ticket_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_support_ticket_status() TO service_role;


--
-- Name: FUNCTION provider_record_usage(_provider_id uuid, _sent integer, _failed integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.provider_record_usage(_provider_id uuid, _sent integer, _failed integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.provider_record_usage(_provider_id uuid, _sent integer, _failed integer) TO service_role;


--
-- Name: FUNCTION public_auth_settings(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.public_auth_settings() FROM PUBLIC;
GRANT ALL ON FUNCTION public.public_auth_settings() TO anon;
GRANT ALL ON FUNCTION public.public_auth_settings() TO authenticated;
GRANT ALL ON FUNCTION public.public_auth_settings() TO service_role;


--
-- Name: FUNCTION public_platform_config(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.public_platform_config() TO anon;
GRANT ALL ON FUNCTION public.public_platform_config() TO authenticated;
GRANT ALL ON FUNCTION public.public_platform_config() TO service_role;


--
-- Name: FUNCTION public_platform_flags(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.public_platform_flags() TO anon;
GRANT ALL ON FUNCTION public.public_platform_flags() TO authenticated;
GRANT ALL ON FUNCTION public.public_platform_flags() TO service_role;


--
-- Name: FUNCTION public_review_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.public_review_stats() TO anon;
GRANT ALL ON FUNCTION public.public_review_stats() TO authenticated;
GRANT ALL ON FUNCTION public.public_review_stats() TO service_role;


--
-- Name: FUNCTION publish_due_blog_posts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.publish_due_blog_posts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_due_blog_posts() TO service_role;


--
-- Name: FUNCTION record_blog_slug_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_blog_slug_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_blog_slug_change() TO service_role;


--
-- Name: FUNCTION referral_dashboard_stats(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.referral_dashboard_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.referral_dashboard_stats() TO authenticated;
GRANT ALL ON FUNCTION public.referral_dashboard_stats() TO service_role;


--
-- Name: FUNCTION referral_program_public(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.referral_program_public() TO anon;
GRANT ALL ON FUNCTION public.referral_program_public() TO authenticated;
GRANT ALL ON FUNCTION public.referral_program_public() TO service_role;


--
-- Name: FUNCTION release_workspace_usage(_workspace_id uuid, _resource text, _period_start date, _amount bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_workspace_usage(_workspace_id uuid, _resource text, _period_start date, _amount bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_workspace_usage(_workspace_id uuid, _resource text, _period_start date, _amount bigint) TO service_role;


--
-- Name: FUNCTION release_workspace_usage_v2(_workspace_id uuid, _resource text, _amount bigint, _environment text, _reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_workspace_usage_v2(_workspace_id uuid, _resource text, _amount bigint, _environment text, _reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_workspace_usage_v2(_workspace_id uuid, _resource text, _amount bigint, _environment text, _reason text) TO service_role;


--
-- Name: FUNCTION remove_workspace_member(_member_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_workspace_member(_member_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_workspace_member(_member_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_workspace_member(_member_id uuid) TO service_role;


--
-- Name: FUNCTION repair_delivery_state(_workspace_id uuid, _since timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.repair_delivery_state(_workspace_id uuid, _since timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.repair_delivery_state(_workspace_id uuid, _since timestamp with time zone) TO service_role;


--
-- Name: TABLE referral_payouts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_payouts TO anon;
GRANT ALL ON TABLE public.referral_payouts TO authenticated;
GRANT ALL ON TABLE public.referral_payouts TO service_role;


--
-- Name: FUNCTION request_referral_payout(_amount_cents integer, _method text, _destination_hint text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_referral_payout(_amount_cents integer, _method text, _destination_hint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_referral_payout(_amount_cents integer, _method text, _destination_hint text) TO authenticated;
GRANT ALL ON FUNCTION public.request_referral_payout(_amount_cents integer, _method text, _destination_hint text) TO service_role;


--
-- Name: FUNCTION resend_workspace_invitation(_invitation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resend_workspace_invitation(_invitation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resend_workspace_invitation(_invitation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.resend_workspace_invitation(_invitation_id uuid) TO service_role;


--
-- Name: FUNCTION revoke_workspace_invitation(_invitation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_workspace_invitation(_invitation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_workspace_invitation(_invitation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_workspace_invitation(_invitation_id uuid) TO service_role;


--
-- Name: FUNCTION run_ai_personalization_runner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_ai_personalization_runner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_ai_personalization_runner() TO service_role;


--
-- Name: FUNCTION run_automation_runner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_automation_runner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_automation_runner() TO service_role;


--
-- Name: FUNCTION run_campaign_scheduler(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_campaign_scheduler() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_campaign_scheduler() TO postgres;
GRANT ALL ON FUNCTION public.run_campaign_scheduler() TO supabase_admin;
GRANT ALL ON FUNCTION public.run_campaign_scheduler() TO service_role;


--
-- Name: FUNCTION run_delivery_reconcile_runner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_delivery_reconcile_runner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_delivery_reconcile_runner() TO service_role;


--
-- Name: FUNCTION run_domain_recheck_runner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_domain_recheck_runner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_domain_recheck_runner() TO service_role;


--
-- Name: FUNCTION run_inbound_retry(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_inbound_retry() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_inbound_retry() TO postgres;
GRANT ALL ON FUNCTION public.run_inbound_retry() TO supabase_admin;
GRANT ALL ON FUNCTION public.run_inbound_retry() TO service_role;


--
-- Name: FUNCTION run_lead_retention_cleanup(_batch_size integer, _max_batches integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_lead_retention_cleanup(_batch_size integer, _max_batches integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_lead_retention_cleanup(_batch_size integer, _max_batches integer) TO service_role;


--
-- Name: FUNCTION run_provider_health_runner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_provider_health_runner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_provider_health_runner() TO service_role;


--
-- Name: FUNCTION run_transactional_email_runner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_transactional_email_runner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_transactional_email_runner() TO service_role;


--
-- Name: FUNCTION run_warmup_runner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_warmup_runner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_warmup_runner() TO service_role;


--
-- Name: FUNCTION seed_workspace_crm_stages(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.seed_workspace_crm_stages() FROM PUBLIC;
GRANT ALL ON FUNCTION public.seed_workspace_crm_stages() TO service_role;


--
-- Name: FUNCTION sending_account_stats(_account_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sending_account_stats(_account_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sending_account_stats(_account_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION set_lead_retention(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_lead_retention() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_lead_retention() TO service_role;


--
-- Name: FUNCTION set_sending_account_enabled(_account_id uuid, _enabled boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_sending_account_enabled(_account_id uuid, _enabled boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_sending_account_enabled(_account_id uuid, _enabled boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_sending_account_enabled(_account_id uuid, _enabled boolean) TO postgres;
GRANT ALL ON FUNCTION public.set_sending_account_enabled(_account_id uuid, _enabled boolean) TO supabase_admin;
GRANT ALL ON FUNCTION public.set_sending_account_enabled(_account_id uuid, _enabled boolean) TO service_role;


--
-- Name: FUNCTION set_sending_accounts_paused(_account_ids uuid[], _paused boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_sending_accounts_paused(_account_ids uuid[], _paused boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_sending_accounts_paused(_account_ids uuid[], _paused boolean) TO authenticated;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_updated_at() TO postgres;
GRANT ALL ON FUNCTION public.set_updated_at() TO supabase_admin;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION touch_workspace_activity(_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.touch_workspace_activity(_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_workspace_activity(_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION update_workspace_member_role(_member_id uuid, _role public.workspace_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_workspace_member_role(_member_id uuid, _role public.workspace_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_workspace_member_role(_member_id uuid, _role public.workspace_role) TO authenticated;
GRANT ALL ON FUNCTION public.update_workspace_member_role(_member_id uuid, _role public.workspace_role) TO service_role;


--
-- Name: FUNCTION update_workspace_settings(_workspace_id uuid, _name text, _slug text, _logo_url text, _timezone text, _sending_timezone text, _send_days smallint[], _send_start_hour smallint, _send_end_hour smallint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_workspace_settings(_workspace_id uuid, _name text, _slug text, _logo_url text, _timezone text, _sending_timezone text, _send_days smallint[], _send_start_hour smallint, _send_end_hour smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_workspace_settings(_workspace_id uuid, _name text, _slug text, _logo_url text, _timezone text, _sending_timezone text, _send_days smallint[], _send_start_hour smallint, _send_end_hour smallint) TO authenticated;
GRANT ALL ON FUNCTION public.update_workspace_settings(_workspace_id uuid, _name text, _slug text, _logo_url text, _timezone text, _sending_timezone text, _send_days smallint[], _send_start_hour smallint, _send_end_hour smallint) TO service_role;


--
-- Name: FUNCTION validate_testimonial(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_testimonial() TO anon;
GRANT ALL ON FUNCTION public.validate_testimonial() TO authenticated;
GRANT ALL ON FUNCTION public.validate_testimonial() TO service_role;


--
-- Name: FUNCTION workspace_team(_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.workspace_team(_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_team(_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workspace_team(_workspace_id uuid) TO service_role;


--
-- Name: TABLE admin_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_audit_log TO anon;
GRANT ALL ON TABLE public.admin_audit_log TO authenticated;
GRANT ALL ON TABLE public.admin_audit_log TO service_role;


--
-- Name: TABLE admin_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.admin_notifications TO authenticated;
GRANT ALL ON TABLE public.admin_notifications TO service_role;
GRANT ALL ON TABLE public.admin_notifications TO postgres;
GRANT ALL ON TABLE public.admin_notifications TO supabase_admin;


--
-- Name: TABLE ai_runner_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_runner_state TO anon;
GRANT ALL ON TABLE public.ai_runner_state TO authenticated;
GRANT ALL ON TABLE public.ai_runner_state TO service_role;


--
-- Name: TABLE automation_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.automation_events TO anon;
GRANT ALL ON TABLE public.automation_events TO authenticated;
GRANT ALL ON TABLE public.automation_events TO service_role;


--
-- Name: TABLE automation_run_steps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.automation_run_steps TO anon;
GRANT ALL ON TABLE public.automation_run_steps TO authenticated;
GRANT ALL ON TABLE public.automation_run_steps TO service_role;


--
-- Name: TABLE automation_steps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.automation_steps TO anon;
GRANT ALL ON TABLE public.automation_steps TO authenticated;
GRANT ALL ON TABLE public.automation_steps TO service_role;


--
-- Name: TABLE automations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.automations TO anon;
GRANT ALL ON TABLE public.automations TO authenticated;
GRANT ALL ON TABLE public.automations TO service_role;


--
-- Name: TABLE billing_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_audit_log TO anon;
GRANT ALL ON TABLE public.billing_audit_log TO authenticated;
GRANT ALL ON TABLE public.billing_audit_log TO service_role;


--
-- Name: TABLE billing_customers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.billing_customers TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.billing_customers TO authenticated;
GRANT ALL ON TABLE public.billing_customers TO service_role;


--
-- Name: TABLE billing_invoices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.billing_invoices TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.billing_invoices TO authenticated;
GRANT ALL ON TABLE public.billing_invoices TO service_role;


--
-- Name: TABLE billing_plan_prices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_plan_prices TO anon;
GRANT ALL ON TABLE public.billing_plan_prices TO authenticated;
GRANT ALL ON TABLE public.billing_plan_prices TO service_role;


--
-- Name: TABLE billing_provider_secrets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_provider_secrets TO anon;
GRANT ALL ON TABLE public.billing_provider_secrets TO authenticated;
GRANT ALL ON TABLE public.billing_provider_secrets TO service_role;


--
-- Name: TABLE billing_providers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_providers TO anon;
GRANT ALL ON TABLE public.billing_providers TO authenticated;
GRANT ALL ON TABLE public.billing_providers TO service_role;


--
-- Name: TABLE billing_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.billing_subscriptions TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.billing_subscriptions TO authenticated;
GRANT ALL ON TABLE public.billing_subscriptions TO service_role;


--
-- Name: TABLE billing_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.billing_transactions TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.billing_transactions TO authenticated;
GRANT ALL ON TABLE public.billing_transactions TO service_role;


--
-- Name: TABLE billing_webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_webhook_events TO anon;
GRANT ALL ON TABLE public.billing_webhook_events TO authenticated;
GRANT ALL ON TABLE public.billing_webhook_events TO service_role;


--
-- Name: TABLE blog_authors; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.blog_authors TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.blog_authors TO authenticated;
GRANT ALL ON TABLE public.blog_authors TO service_role;


--
-- Name: TABLE blog_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.blog_categories TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.blog_categories TO authenticated;
GRANT ALL ON TABLE public.blog_categories TO service_role;


--
-- Name: TABLE blog_media; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.blog_media TO anon;
GRANT ALL ON TABLE public.blog_media TO authenticated;
GRANT ALL ON TABLE public.blog_media TO service_role;


--
-- Name: TABLE blog_post_slugs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.blog_post_slugs TO anon;
GRANT ALL ON TABLE public.blog_post_slugs TO authenticated;
GRANT ALL ON TABLE public.blog_post_slugs TO service_role;


--
-- Name: TABLE blog_posts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.blog_posts TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.blog_posts TO authenticated;
GRANT ALL ON TABLE public.blog_posts TO service_role;


--
-- Name: TABLE campaign_launch_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campaign_launch_events TO anon;
GRANT ALL ON TABLE public.campaign_launch_events TO authenticated;
GRANT ALL ON TABLE public.campaign_launch_events TO service_role;


--
-- Name: TABLE campaign_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.campaign_messages TO authenticated;
GRANT ALL ON TABLE public.campaign_messages TO service_role;
GRANT ALL ON TABLE public.campaign_messages TO postgres;
GRANT ALL ON TABLE public.campaign_messages TO supabase_admin;


--
-- Name: TABLE campaign_recipients; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.campaign_recipients TO authenticated;
GRANT ALL ON TABLE public.campaign_recipients TO service_role;
GRANT ALL ON TABLE public.campaign_recipients TO postgres;
GRANT ALL ON TABLE public.campaign_recipients TO supabase_admin;


--
-- Name: TABLE campaign_replies; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.campaign_replies TO authenticated;
GRANT ALL ON TABLE public.campaign_replies TO service_role;
GRANT ALL ON TABLE public.campaign_replies TO postgres;
GRANT ALL ON TABLE public.campaign_replies TO supabase_admin;


--
-- Name: TABLE campaign_step_variants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.campaign_step_variants TO authenticated;
GRANT ALL ON TABLE public.campaign_step_variants TO service_role;
GRANT ALL ON TABLE public.campaign_step_variants TO postgres;
GRANT ALL ON TABLE public.campaign_step_variants TO supabase_admin;


--
-- Name: TABLE campaign_steps; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.campaign_steps TO authenticated;
GRANT ALL ON TABLE public.campaign_steps TO service_role;
GRANT ALL ON TABLE public.campaign_steps TO postgres;
GRANT ALL ON TABLE public.campaign_steps TO supabase_admin;


--
-- Name: TABLE campaign_test_sends; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campaign_test_sends TO anon;
GRANT ALL ON TABLE public.campaign_test_sends TO authenticated;
GRANT ALL ON TABLE public.campaign_test_sends TO service_role;


--
-- Name: TABLE campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.campaigns TO authenticated;
GRANT ALL ON TABLE public.campaigns TO service_role;
GRANT ALL ON TABLE public.campaigns TO postgres;
GRANT ALL ON TABLE public.campaigns TO supabase_admin;


--
-- Name: TABLE conversation_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.conversation_events TO authenticated;
GRANT ALL ON TABLE public.conversation_events TO service_role;
GRANT ALL ON TABLE public.conversation_events TO postgres;
GRANT ALL ON TABLE public.conversation_events TO supabase_admin;


--
-- Name: TABLE conversation_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.conversation_messages TO authenticated;
GRANT ALL ON TABLE public.conversation_messages TO service_role;
GRANT ALL ON TABLE public.conversation_messages TO postgres;
GRANT ALL ON TABLE public.conversation_messages TO supabase_admin;


--
-- Name: TABLE conversation_notes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.conversation_notes TO authenticated;
GRANT ALL ON TABLE public.conversation_notes TO service_role;
GRANT ALL ON TABLE public.conversation_notes TO postgres;
GRANT ALL ON TABLE public.conversation_notes TO supabase_admin;


--
-- Name: TABLE conversations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.conversations TO authenticated;
GRANT ALL ON TABLE public.conversations TO service_role;
GRANT ALL ON TABLE public.conversations TO postgres;
GRANT ALL ON TABLE public.conversations TO supabase_admin;


--
-- Name: TABLE crm_stages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.crm_stages TO anon;
GRANT ALL ON TABLE public.crm_stages TO authenticated;
GRANT ALL ON TABLE public.crm_stages TO service_role;


--
-- Name: TABLE domain_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.domain_alerts TO anon;
GRANT ALL ON TABLE public.domain_alerts TO authenticated;
GRANT ALL ON TABLE public.domain_alerts TO service_role;


--
-- Name: TABLE email_drafts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.email_drafts TO authenticated;
GRANT ALL ON TABLE public.email_drafts TO service_role;
GRANT ALL ON TABLE public.email_drafts TO postgres;
GRANT ALL ON TABLE public.email_drafts TO supabase_admin;


--
-- Name: TABLE email_engagement_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_engagement_events TO anon;
GRANT ALL ON TABLE public.email_engagement_events TO authenticated;
GRANT ALL ON TABLE public.email_engagement_events TO service_role;


--
-- Name: TABLE email_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.email_events TO authenticated;
GRANT ALL ON TABLE public.email_events TO service_role;
GRANT ALL ON TABLE public.email_events TO postgres;
GRANT ALL ON TABLE public.email_events TO supabase_admin;


--
-- Name: TABLE email_provider_secrets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_provider_secrets TO service_role;
GRANT ALL ON TABLE public.email_provider_secrets TO postgres;
GRANT ALL ON TABLE public.email_provider_secrets TO supabase_admin;


--
-- Name: TABLE email_providers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.email_providers TO authenticated;
GRANT ALL ON TABLE public.email_providers TO service_role;
GRANT ALL ON TABLE public.email_providers TO postgres;
GRANT ALL ON TABLE public.email_providers TO supabase_admin;


--
-- Name: TABLE email_suppressions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.email_suppressions TO authenticated;
GRANT ALL ON TABLE public.email_suppressions TO service_role;
GRANT ALL ON TABLE public.email_suppressions TO postgres;
GRANT ALL ON TABLE public.email_suppressions TO supabase_admin;


--
-- Name: TABLE email_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.email_templates TO authenticated;
GRANT ALL ON TABLE public.email_templates TO service_role;
GRANT ALL ON TABLE public.email_templates TO postgres;
GRANT ALL ON TABLE public.email_templates TO supabase_admin;


--
-- Name: TABLE guide_articles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.guide_articles TO anon;
GRANT ALL ON TABLE public.guide_articles TO authenticated;
GRANT ALL ON TABLE public.guide_articles TO service_role;


--
-- Name: TABLE inbound_event_actions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.inbound_event_actions TO authenticated;
GRANT ALL ON TABLE public.inbound_event_actions TO service_role;
GRANT ALL ON TABLE public.inbound_event_actions TO postgres;
GRANT ALL ON TABLE public.inbound_event_actions TO supabase_admin;


--
-- Name: TABLE inbound_routes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inbound_routes TO service_role;
GRANT ALL ON TABLE public.inbound_routes TO postgres;
GRANT ALL ON TABLE public.inbound_routes TO supabase_admin;


--
-- Name: TABLE inbound_tests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inbound_tests TO service_role;
GRANT ALL ON TABLE public.inbound_tests TO postgres;
GRANT ALL ON TABLE public.inbound_tests TO supabase_admin;


--
-- Name: TABLE integration_connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integration_connections TO anon;
GRANT ALL ON TABLE public.integration_connections TO authenticated;
GRANT ALL ON TABLE public.integration_connections TO service_role;


--
-- Name: TABLE integration_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integration_events TO anon;
GRANT ALL ON TABLE public.integration_events TO authenticated;
GRANT ALL ON TABLE public.integration_events TO service_role;


--
-- Name: TABLE integration_secrets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integration_secrets TO anon;
GRANT ALL ON TABLE public.integration_secrets TO authenticated;
GRANT ALL ON TABLE public.integration_secrets TO service_role;


--
-- Name: TABLE integration_sync_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integration_sync_logs TO anon;
GRANT ALL ON TABLE public.integration_sync_logs TO authenticated;
GRANT ALL ON TABLE public.integration_sync_logs TO service_role;


--
-- Name: TABLE integrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integrations TO anon;
GRANT ALL ON TABLE public.integrations TO authenticated;
GRANT ALL ON TABLE public.integrations TO service_role;


--
-- Name: TABLE lead_activities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.lead_activities TO authenticated;
GRANT ALL ON TABLE public.lead_activities TO service_role;
GRANT ALL ON TABLE public.lead_activities TO postgres;
GRANT ALL ON TABLE public.lead_activities TO supabase_admin;


--
-- Name: TABLE lead_lists; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.lead_lists TO authenticated;
GRANT ALL ON TABLE public.lead_lists TO service_role;
GRANT ALL ON TABLE public.lead_lists TO postgres;
GRANT ALL ON TABLE public.lead_lists TO supabase_admin;


--
-- Name: TABLE lead_notes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.lead_notes TO authenticated;
GRANT ALL ON TABLE public.lead_notes TO service_role;
GRANT ALL ON TABLE public.lead_notes TO postgres;
GRANT ALL ON TABLE public.lead_notes TO supabase_admin;


--
-- Name: TABLE lead_retention_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lead_retention_runs TO anon;
GRANT ALL ON TABLE public.lead_retention_runs TO authenticated;
GRANT ALL ON TABLE public.lead_retention_runs TO service_role;


--
-- Name: TABLE lead_tasks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.lead_tasks TO authenticated;
GRANT ALL ON TABLE public.lead_tasks TO service_role;
GRANT ALL ON TABLE public.lead_tasks TO postgres;
GRANT ALL ON TABLE public.lead_tasks TO supabase_admin;


--
-- Name: TABLE leads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;
GRANT ALL ON TABLE public.leads TO postgres;
GRANT ALL ON TABLE public.leads TO supabase_admin;


--
-- Name: TABLE newsletter_subscribers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.newsletter_subscribers TO service_role;


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_preferences TO anon;
GRANT ALL ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;
GRANT ALL ON TABLE public.notifications TO postgres;
GRANT ALL ON TABLE public.notifications TO supabase_admin;


--
-- Name: TABLE outbound_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.outbound_messages TO anon;
GRANT ALL ON TABLE public.outbound_messages TO authenticated;
GRANT ALL ON TABLE public.outbound_messages TO service_role;


--
-- Name: TABLE plan_features; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.plan_features TO anon;
GRANT SELECT ON TABLE public.plan_features TO authenticated;
GRANT ALL ON TABLE public.plan_features TO service_role;
GRANT ALL ON TABLE public.plan_features TO postgres;
GRANT ALL ON TABLE public.plan_features TO supabase_admin;


--
-- Name: TABLE plan_grants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plan_grants TO anon;
GRANT ALL ON TABLE public.plan_grants TO authenticated;
GRANT ALL ON TABLE public.plan_grants TO service_role;


--
-- Name: TABLE plans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.plans TO anon;
GRANT SELECT ON TABLE public.plans TO authenticated;
GRANT ALL ON TABLE public.plans TO service_role;
GRANT ALL ON TABLE public.plans TO postgres;
GRANT ALL ON TABLE public.plans TO supabase_admin;


--
-- Name: TABLE platform_announcement_dismissals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.platform_announcement_dismissals TO anon;
GRANT ALL ON TABLE public.platform_announcement_dismissals TO authenticated;
GRANT ALL ON TABLE public.platform_announcement_dismissals TO service_role;


--
-- Name: TABLE platform_announcements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.platform_announcements TO anon;
GRANT ALL ON TABLE public.platform_announcements TO authenticated;
GRANT ALL ON TABLE public.platform_announcements TO service_role;


--
-- Name: TABLE platform_feature_flags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.platform_feature_flags TO anon;
GRANT ALL ON TABLE public.platform_feature_flags TO authenticated;
GRANT ALL ON TABLE public.platform_feature_flags TO service_role;


--
-- Name: TABLE platform_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.platform_settings TO authenticated;
GRANT ALL ON TABLE public.platform_settings TO service_role;
GRANT ALL ON TABLE public.platform_settings TO postgres;
GRANT ALL ON TABLE public.platform_settings TO supabase_admin;


--
-- Name: TABLE privacy_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.privacy_requests TO anon;
GRANT ALL ON TABLE public.privacy_requests TO authenticated;
GRANT ALL ON TABLE public.privacy_requests TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.profiles TO postgres;
GRANT ALL ON TABLE public.profiles TO supabase_admin;


--
-- Name: TABLE provider_health_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.provider_health_events TO anon;
GRANT ALL ON TABLE public.provider_health_events TO authenticated;
GRANT ALL ON TABLE public.provider_health_events TO service_role;


--
-- Name: TABLE provider_routing_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.provider_routing_events TO anon;
GRANT ALL ON TABLE public.provider_routing_events TO authenticated;
GRANT ALL ON TABLE public.provider_routing_events TO service_role;


--
-- Name: TABLE referral_attributions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_attributions TO anon;
GRANT ALL ON TABLE public.referral_attributions TO authenticated;
GRANT ALL ON TABLE public.referral_attributions TO service_role;


--
-- Name: TABLE referral_audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_audit_logs TO anon;
GRANT ALL ON TABLE public.referral_audit_logs TO authenticated;
GRANT ALL ON TABLE public.referral_audit_logs TO service_role;


--
-- Name: TABLE referral_billing_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_billing_events TO anon;
GRANT ALL ON TABLE public.referral_billing_events TO authenticated;
GRANT ALL ON TABLE public.referral_billing_events TO service_role;


--
-- Name: TABLE referral_clicks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_clicks TO anon;
GRANT ALL ON TABLE public.referral_clicks TO authenticated;
GRANT ALL ON TABLE public.referral_clicks TO service_role;


--
-- Name: TABLE referral_commissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_commissions TO anon;
GRANT ALL ON TABLE public.referral_commissions TO authenticated;
GRANT ALL ON TABLE public.referral_commissions TO service_role;


--
-- Name: TABLE referral_fraud_flags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_fraud_flags TO anon;
GRANT ALL ON TABLE public.referral_fraud_flags TO authenticated;
GRANT ALL ON TABLE public.referral_fraud_flags TO service_role;


--
-- Name: TABLE referral_programs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_programs TO anon;
GRANT ALL ON TABLE public.referral_programs TO authenticated;
GRANT ALL ON TABLE public.referral_programs TO service_role;


--
-- Name: TABLE referral_webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_webhook_events TO anon;
GRANT ALL ON TABLE public.referral_webhook_events TO authenticated;
GRANT ALL ON TABLE public.referral_webhook_events TO service_role;


--
-- Name: TABLE sending_account_audit; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.sending_account_audit TO authenticated;
GRANT ALL ON TABLE public.sending_account_audit TO service_role;


--
-- Name: TABLE sending_account_checks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sending_account_checks TO anon;
GRANT ALL ON TABLE public.sending_account_checks TO authenticated;
GRANT ALL ON TABLE public.sending_account_checks TO service_role;


--
-- Name: TABLE sending_account_secrets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sending_account_secrets TO service_role;
GRANT ALL ON TABLE public.sending_account_secrets TO postgres;
GRANT ALL ON TABLE public.sending_account_secrets TO supabase_admin;


--
-- Name: TABLE sending_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sending_accounts TO authenticated;
GRANT ALL ON TABLE public.sending_accounts TO service_role;
GRANT ALL ON TABLE public.sending_accounts TO postgres;
GRANT ALL ON TABLE public.sending_accounts TO supabase_admin;


--
-- Name: TABLE sending_domains; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sending_domains TO authenticated;
GRANT ALL ON TABLE public.sending_domains TO service_role;


--
-- Name: TABLE service_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_alerts TO anon;
GRANT ALL ON TABLE public.service_alerts TO authenticated;
GRANT ALL ON TABLE public.service_alerts TO service_role;


--
-- Name: TABLE site_faqs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_faqs TO anon;
GRANT ALL ON TABLE public.site_faqs TO authenticated;
GRANT ALL ON TABLE public.site_faqs TO service_role;


--
-- Name: TABLE site_nav_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_nav_items TO anon;
GRANT ALL ON TABLE public.site_nav_items TO authenticated;
GRANT ALL ON TABLE public.site_nav_items TO service_role;


--
-- Name: TABLE site_pages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_pages TO anon;
GRANT ALL ON TABLE public.site_pages TO authenticated;
GRANT ALL ON TABLE public.site_pages TO service_role;


--
-- Name: TABLE site_redirects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_redirects TO anon;
GRANT ALL ON TABLE public.site_redirects TO authenticated;
GRANT ALL ON TABLE public.site_redirects TO service_role;


--
-- Name: TABLE site_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_settings TO anon;
GRANT ALL ON TABLE public.site_settings TO authenticated;
GRANT ALL ON TABLE public.site_settings TO service_role;


--
-- Name: TABLE subprocessors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subprocessors TO anon;
GRANT ALL ON TABLE public.subprocessors TO authenticated;
GRANT ALL ON TABLE public.subprocessors TO service_role;


--
-- Name: TABLE support_ticket_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.support_ticket_messages TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.support_ticket_messages TO authenticated;
GRANT ALL ON TABLE public.support_ticket_messages TO service_role;


--
-- Name: TABLE support_tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_tickets TO anon;
GRANT ALL ON TABLE public.support_tickets TO authenticated;
GRANT ALL ON TABLE public.support_tickets TO service_role;


--
-- Name: TABLE template_uses; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.template_uses TO authenticated;
GRANT ALL ON TABLE public.template_uses TO service_role;
GRANT ALL ON TABLE public.template_uses TO postgres;
GRANT ALL ON TABLE public.template_uses TO supabase_admin;


--
-- Name: TABLE testimonials; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testimonials TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.testimonials TO authenticated;
GRANT ALL ON TABLE public.testimonials TO service_role;
GRANT ALL ON TABLE public.testimonials TO postgres;
GRANT ALL ON TABLE public.testimonials TO supabase_admin;


--
-- Name: TABLE transactional_emails; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transactional_emails TO anon;
GRANT ALL ON TABLE public.transactional_emails TO authenticated;
GRANT ALL ON TABLE public.transactional_emails TO service_role;


--
-- Name: TABLE transactional_template_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transactional_template_versions TO anon;
GRANT ALL ON TABLE public.transactional_template_versions TO authenticated;
GRANT ALL ON TABLE public.transactional_template_versions TO service_role;


--
-- Name: TABLE transactional_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transactional_templates TO anon;
GRANT ALL ON TABLE public.transactional_templates TO authenticated;
GRANT ALL ON TABLE public.transactional_templates TO service_role;


--
-- Name: TABLE unmatched_inbound_emails; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.unmatched_inbound_emails TO anon;
GRANT ALL ON TABLE public.unmatched_inbound_emails TO authenticated;
GRANT ALL ON TABLE public.unmatched_inbound_emails TO service_role;


--
-- Name: TABLE usage_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.usage_audit_log TO anon;
GRANT ALL ON TABLE public.usage_audit_log TO authenticated;
GRANT ALL ON TABLE public.usage_audit_log TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT ALL ON TABLE public.user_roles TO postgres;
GRANT ALL ON TABLE public.user_roles TO supabase_admin;


--
-- Name: TABLE warmup_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warmup_conversations TO anon;
GRANT ALL ON TABLE public.warmup_conversations TO authenticated;
GRANT ALL ON TABLE public.warmup_conversations TO service_role;


--
-- Name: TABLE warmup_daily_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warmup_daily_stats TO anon;
GRANT ALL ON TABLE public.warmup_daily_stats TO authenticated;
GRANT ALL ON TABLE public.warmup_daily_stats TO service_role;


--
-- Name: TABLE warmup_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warmup_events TO anon;
GRANT ALL ON TABLE public.warmup_events TO authenticated;
GRANT ALL ON TABLE public.warmup_events TO service_role;


--
-- Name: TABLE warmup_health; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warmup_health TO anon;
GRANT ALL ON TABLE public.warmup_health TO authenticated;
GRANT ALL ON TABLE public.warmup_health TO service_role;


--
-- Name: TABLE warmup_recipients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warmup_recipients TO anon;
GRANT ALL ON TABLE public.warmup_recipients TO authenticated;
GRANT ALL ON TABLE public.warmup_recipients TO service_role;


--
-- Name: TABLE warmup_runner_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warmup_runner_state TO anon;
GRANT ALL ON TABLE public.warmup_runner_state TO authenticated;
GRANT ALL ON TABLE public.warmup_runner_state TO service_role;


--
-- Name: TABLE warmup_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warmup_settings TO anon;
GRANT ALL ON TABLE public.warmup_settings TO authenticated;
GRANT ALL ON TABLE public.warmup_settings TO service_role;


--
-- Name: TABLE workspace_activity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspace_activity TO anon;
GRANT ALL ON TABLE public.workspace_activity TO authenticated;
GRANT ALL ON TABLE public.workspace_activity TO service_role;


--
-- Name: TABLE workspace_ai_keys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspace_ai_keys TO anon;
GRANT ALL ON TABLE public.workspace_ai_keys TO authenticated;
GRANT ALL ON TABLE public.workspace_ai_keys TO service_role;


--
-- Name: TABLE workspace_credits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspace_credits TO anon;
GRANT ALL ON TABLE public.workspace_credits TO authenticated;
GRANT ALL ON TABLE public.workspace_credits TO service_role;


--
-- Name: TABLE workspace_invitations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.workspace_invitations TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.workspace_invitations TO authenticated;
GRANT ALL ON TABLE public.workspace_invitations TO service_role;


--
-- Name: TABLE workspace_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workspace_members TO authenticated;
GRANT ALL ON TABLE public.workspace_members TO service_role;
GRANT ALL ON TABLE public.workspace_members TO postgres;
GRANT ALL ON TABLE public.workspace_members TO supabase_admin;


--
-- Name: TABLE workspace_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspace_subscriptions TO anon;
GRANT ALL ON TABLE public.workspace_subscriptions TO authenticated;
GRANT ALL ON TABLE public.workspace_subscriptions TO service_role;


--
-- Name: TABLE workspace_usage_counters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspace_usage_counters TO anon;
GRANT ALL ON TABLE public.workspace_usage_counters TO authenticated;
GRANT ALL ON TABLE public.workspace_usage_counters TO service_role;


--
-- Name: TABLE workspaces; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workspaces TO authenticated;
GRANT ALL ON TABLE public.workspaces TO service_role;
GRANT ALL ON TABLE public.workspaces TO postgres;
GRANT ALL ON TABLE public.workspaces TO supabase_admin;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--


