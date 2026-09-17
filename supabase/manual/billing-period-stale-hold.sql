-- Billing period hardening: expired subscription cycles hold their usage
-- bucket instead of rolling into a fresh calendar month. Re-runnable.

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
    -- A late provider webhook must never hand out a second allowance: hold the
    -- stored cycle until the subscription itself moves to a new period.
    _period := _sub.current_period_start::date;
    _reset_at := _sub.current_period_end;
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
$function$;