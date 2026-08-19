-- Notification preferences (per user)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY,
  new_replies boolean NOT NULL DEFAULT true,
  campaign_completed boolean NOT NULL DEFAULT true,
  bounce_alerts boolean NOT NULL DEFAULT true,
  deliverability_alerts boolean NOT NULL DEFAULT true,
  warmup_alerts boolean NOT NULL DEFAULT true,
  team_activity boolean NOT NULL DEFAULT true,
  support_updates boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_preferences_own ON public.notification_preferences;
CREATE POLICY notification_preferences_own ON public.notification_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP TRIGGER IF EXISTS notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Support ticket enhancements
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_last_read_at timestamptz;

ALTER TABLE public.support_ticket_messages
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_size integer;

DROP POLICY IF EXISTS support_messages_select ON public.support_ticket_messages;
CREATE POLICY support_messages_select ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND (
          (t.created_by = auth.uid() AND support_ticket_messages.is_internal = false)
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'support'::app_role)
        )
    )
  );

DROP POLICY IF EXISTS support_messages_insert ON public.support_ticket_messages;
CREATE POLICY support_messages_insert ON public.support_ticket_messages
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND (
      is_internal = false
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'support'::app_role)
    )
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND (
          t.created_by = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'support'::app_role)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.notify_support_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

DROP TRIGGER IF EXISTS support_messages_notify ON public.support_ticket_messages;
CREATE TRIGGER support_messages_notify AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_support_reply();

-- Workspace subscriptions (real billing state)
CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'trialing',
  billing_interval text NOT NULL DEFAULT 'monthly',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  payment_status text NOT NULL DEFAULT 'none',
  external_customer_id text,
  external_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_subscriptions TO authenticated;
GRANT ALL ON public.workspace_subscriptions TO service_role;
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_subscriptions_select ON public.workspace_subscriptions;
CREATE POLICY workspace_subscriptions_select ON public.workspace_subscriptions
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS workspace_subscriptions_admin ON public.workspace_subscriptions;
CREATE POLICY workspace_subscriptions_admin ON public.workspace_subscriptions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP TRIGGER IF EXISTS workspace_subscriptions_updated_at ON public.workspace_subscriptions;
CREATE TRIGGER workspace_subscriptions_updated_at BEFORE UPDATE ON public.workspace_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Support attachment storage policies
DROP POLICY IF EXISTS "support attachments read" ON storage.objects;
CREATE POLICY "support attachments read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'support-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'support'::app_role)
    )
  );
DROP POLICY IF EXISTS "support attachments write" ON storage.objects;
CREATE POLICY "support attachments write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'support-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'support'::app_role)
    )
  );