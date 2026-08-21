CREATE TABLE IF NOT EXISTS public.workspace_usage_counters (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  resource text NOT NULL,
  period_start date NOT NULL,
  used bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, resource, period_start)
);

GRANT SELECT ON public.workspace_usage_counters TO authenticated;
GRANT ALL ON public.workspace_usage_counters TO service_role;

ALTER TABLE public.workspace_usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read workspace usage" ON public.workspace_usage_counters;
CREATE POLICY "Members read workspace usage"
ON public.workspace_usage_counters
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.consume_workspace_usage(
  _workspace_id uuid,
  _resource text,
  _period_start date,
  _amount bigint,
  _limit bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.release_workspace_usage(
  _workspace_id uuid,
  _resource text,
  _period_start date,
  _amount bigint
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.workspace_usage_counters
     SET used = GREATEST(used - GREATEST(COALESCE(_amount, 0), 0), 0), updated_at = now()
   WHERE workspace_id = _workspace_id AND resource = _resource AND period_start = _period_start;
$$;

REVOKE ALL ON FUNCTION public.consume_workspace_usage(uuid, text, date, bigint, bigint) FROM public;
REVOKE ALL ON FUNCTION public.release_workspace_usage(uuid, text, date, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_workspace_usage(uuid, text, date, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_workspace_usage(uuid, text, date, bigint) TO service_role;