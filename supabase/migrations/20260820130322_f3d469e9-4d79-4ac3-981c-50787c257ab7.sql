-- Extend existing plan tables (no duplicate billing systems)
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS monthly_credits integer NOT NULL DEFAULT 0;

ALTER TABLE public.plan_features
  ADD COLUMN IF NOT EXISTS feature_key text;

CREATE UNIQUE INDEX IF NOT EXISTS plan_features_plan_key_uidx
  ON public.plan_features (plan_id, feature_key) WHERE feature_key IS NOT NULL;

-- Credit balances (single source of truth, one row per workspace)
CREATE TABLE IF NOT EXISTS public.workspace_credits (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0,
  allocated_total bigint NOT NULL DEFAULT 0,
  consumed_total bigint NOT NULL DEFAULT 0,
  last_allocated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.workspace_credits TO authenticated;
GRANT ALL ON public.workspace_credits TO service_role;
ALTER TABLE public.workspace_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credits_member_read" ON public.workspace_credits;
CREATE POLICY "credits_member_read" ON public.workspace_credits
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Immutable credit ledger
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid,
  entry_type text NOT NULL CHECK (entry_type IN (
    'plan_allocation','usage','purchase','admin_adjustment','refund','bonus','expiration','correction'
  )),
  amount bigint NOT NULL,
  balance_before bigint NOT NULL,
  balance_after bigint NOT NULL,
  reason text,
  reference text,
  actor text NOT NULL DEFAULT 'system',
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_ledger_workspace_idx ON public.credit_ledger (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_ledger_created_idx ON public.credit_ledger (created_at DESC);

GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_ledger_member_read" ON public.credit_ledger;
CREATE POLICY "credit_ledger_member_read" ON public.credit_ledger
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Ledger rows can never be edited or deleted, by anyone (including service role)
CREATE OR REPLACE FUNCTION public.credit_ledger_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'credit_ledger rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS credit_ledger_no_update ON public.credit_ledger;
CREATE TRIGGER credit_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.credit_ledger_immutable();

-- Atomic balance change + ledger write
CREATE OR REPLACE FUNCTION public.apply_credit_change(
  _workspace_id uuid,
  _amount bigint,
  _entry_type text,
  _reason text DEFAULT NULL,
  _reference text DEFAULT NULL,
  _actor text DEFAULT 'system',
  _actor_user_id uuid DEFAULT NULL,
  _user_id uuid DEFAULT NULL
)
RETURNS public.credit_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.apply_credit_change(uuid,bigint,text,text,text,text,uuid,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_change(uuid,bigint,text,text,text,text,uuid,uuid) TO service_role;