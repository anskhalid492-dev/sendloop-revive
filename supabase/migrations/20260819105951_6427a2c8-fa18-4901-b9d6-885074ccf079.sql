CREATE OR REPLACE FUNCTION public.notify_support_ticket_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

DROP TRIGGER IF EXISTS support_tickets_status_notify ON public.support_tickets;
CREATE TRIGGER support_tickets_status_notify
AFTER UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_support_ticket_status();

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;