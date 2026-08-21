-- 1. Plan-level daily caps
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_emails_daily integer,
  ADD COLUMN IF NOT EXISTS max_warmup_daily integer;

-- 2. Trial exhaustion marker (audit only; metering uses the lifetime anchor)
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS trial_consumed_at timestamptz;

-- 3. Usage audit trail
CREATE TABLE IF NOT EXISTS public.usage_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  resource text NOT NULL,
  action text NOT NULL,
  amount bigint NOT NULL DEFAULT 0,
  allowed boolean NOT NULL DEFAULT true,
  used_after bigint,
  limit_value bigint,
  period_start date,
  plan_id uuid,
  plan_name text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_audit_log_ws_idx ON public.usage_audit_log (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_audit_log_resource_idx ON public.usage_audit_log (resource, created_at DESC);

GRANT SELECT ON public.usage_audit_log TO authenticated;
GRANT ALL ON public.usage_audit_log TO service_role;
ALTER TABLE public.usage_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_audit_read" ON public.usage_audit_log;
CREATE POLICY "usage_audit_read" ON public.usage_audit_log
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- 4. Derived resources must never be tracked in counters (live rows are the truth)
DELETE FROM public.workspace_usage_counters
 WHERE resource IN ('leads','campaigns','active_campaigns','sending_accounts','domains','team_members','automations');

-- 5. Database-authoritative metering
CREATE OR REPLACE FUNCTION public.consume_workspace_usage_v2(
  _workspace_id uuid,
  _resource text,
  _amount bigint DEFAULT 1,
  _environment text DEFAULT 'live',
  _dry_run boolean DEFAULT false,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF _sub.plan_id IS NOT NULL THEN
    SELECT * INTO _plan FROM public.plans WHERE id = _sub.plan_id;
  END IF;
  IF _plan.id IS NULL THEN
    SELECT * INTO _plan FROM public.plans WHERE COALESCE(is_active, true) ORDER BY sort_order ASC LIMIT 1;
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
    -- Free trial / no subscription: one lifetime bucket that never resets.
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
    -- Warmup traffic is metered separately and never touches the email allowance.
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
$function$;

CREATE OR REPLACE FUNCTION public.release_workspace_usage_v2(
  _workspace_id uuid,
  _resource text,
  _amount bigint DEFAULT 1,
  _environment text DEFAULT 'live',
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.consume_workspace_usage_v2(uuid, text, bigint, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_workspace_usage_v2(uuid, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_workspace_usage_v2(uuid, text, bigint, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_workspace_usage_v2(uuid, text, bigint, text, text) TO service_role;

-- 6. Sensible plan-level daily caps derived from the monthly allowance
UPDATE public.plans SET max_emails_daily = CASE
    WHEN max_emails_monthly IS NULL THEN NULL
    ELSE GREATEST(CEIL(max_emails_monthly / 20.0)::int, 50)
  END
 WHERE max_emails_daily IS NULL;
UPDATE public.plans SET max_warmup_daily = CASE WHEN COALESCE(warmup_enabled, false) THEN 500 ELSE 0 END
 WHERE max_warmup_daily IS NULL;