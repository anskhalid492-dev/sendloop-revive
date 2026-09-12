CREATE TABLE public.lifecycle_enrollments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  email text,
  track text NOT NULL CHECK (track IN ('free_trial','inactive')),
  state text NOT NULL DEFAULT 'eligible'
    CHECK (state IN ('eligible','email_1_sent','email_2_sent','email_3_sent','final_warning_sent','reactivated','terminated','cancelled')),
  entered_at timestamptz NOT NULL DEFAULT now(),
  baseline_at timestamptz NOT NULL DEFAULT now(),
  next_action_at timestamptz,
  last_step_at timestamptz,
  reactivated_at timestamptz,
  terminated_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX lifecycle_enrollments_open_idx
  ON public.lifecycle_enrollments (user_id, track)
  WHERE state IN ('eligible','email_1_sent','email_2_sent','email_3_sent','final_warning_sent');

CREATE INDEX lifecycle_enrollments_due_idx
  ON public.lifecycle_enrollments (next_action_at)
  WHERE state IN ('eligible','email_1_sent','email_2_sent','email_3_sent','final_warning_sent');

CREATE INDEX lifecycle_enrollments_user_idx ON public.lifecycle_enrollments (user_id);

CREATE TABLE public.lifecycle_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id uuid NOT NULL REFERENCES public.lifecycle_enrollments(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  kind text NOT NULL DEFAULT 'email' CHECK (kind IN ('email','termination')),
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','sent','done','failed','skipped')),
  event_key text,
  coupon_code text,
  coupon_percent integer,
  coupon_expires_at timestamptz,
  email_id uuid,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (enrollment_id, step_key)
);

CREATE INDEX lifecycle_actions_enrollment_idx ON public.lifecycle_actions (enrollment_id);

GRANT SELECT ON public.lifecycle_enrollments TO authenticated;
GRANT ALL ON public.lifecycle_enrollments TO service_role;
GRANT SELECT ON public.lifecycle_actions TO authenticated;
GRANT ALL ON public.lifecycle_actions TO service_role;

ALTER TABLE public.lifecycle_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view lifecycle enrollments"
  ON public.lifecycle_enrollments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view lifecycle actions"
  ON public.lifecycle_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER lifecycle_enrollments_set_updated_at
  BEFORE UPDATE ON public.lifecycle_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER lifecycle_actions_set_updated_at
  BEFORE UPDATE ON public.lifecycle_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();