ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_assigned_by uuid,
  ADD COLUMN IF NOT EXISTS manual_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_note text,
  ADD COLUMN IF NOT EXISTS pending_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pending_interval public.billing_interval,
  ADD COLUMN IF NOT EXISTS pending_effective_at timestamptz;