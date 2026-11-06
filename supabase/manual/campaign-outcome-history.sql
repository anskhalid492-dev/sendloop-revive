-- PROPOSAL ONLY. Owner approval/manual execution required. No message backfill.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_message_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  old_status text,
  new_status text NOT NULL,
  old_delivery_status text,
  new_delivery_status text,
  old_error text,
  new_error text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  failed_at timestamptz
);
GRANT SELECT ON public.campaign_message_status_history TO authenticated;
GRANT ALL ON public.campaign_message_status_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.campaign_message_status_history_id_seq TO service_role;
ALTER TABLE public.campaign_message_status_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='campaign_message_status_history' AND policyname='Workspace reads campaign status history') THEN
    CREATE POLICY "Workspace reads campaign status history" ON public.campaign_message_status_history
      FOR SELECT TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS campaign_status_history_message_time
  ON public.campaign_message_status_history(message_id, occurred_at);

CREATE OR REPLACE FUNCTION public.append_campaign_message_status_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.campaign_message_status_history(message_id,workspace_id,campaign_id,new_status,new_delivery_status,new_error,accepted_at,delivered_at,bounced_at,failed_at)
      VALUES(NEW.id,NEW.workspace_id,NEW.campaign_id,NEW.status::text,NEW.delivery_status,NEW.last_error,NEW.sent_at,NEW.delivered_at,NEW.bounced_at,NEW.failed_at);
  ELSIF (OLD.status,OLD.delivery_status,OLD.last_error,OLD.sent_at,OLD.delivered_at,OLD.bounced_at,OLD.failed_at)
    IS DISTINCT FROM (NEW.status,NEW.delivery_status,NEW.last_error,NEW.sent_at,NEW.delivered_at,NEW.bounced_at,NEW.failed_at) THEN
    INSERT INTO public.campaign_message_status_history(message_id,workspace_id,campaign_id,old_status,new_status,old_delivery_status,new_delivery_status,old_error,new_error,accepted_at,delivered_at,bounced_at,failed_at)
      VALUES(NEW.id,NEW.workspace_id,NEW.campaign_id,OLD.status::text,NEW.status::text,OLD.delivery_status,NEW.delivery_status,OLD.last_error,NEW.last_error,NEW.sent_at,NEW.delivered_at,NEW.bounced_at,NEW.failed_at);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.append_campaign_message_status_history() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='campaign_message_status_history_append' AND tgrelid='public.campaign_messages'::regclass) THEN
    CREATE TRIGGER campaign_message_status_history_append AFTER INSERT OR UPDATE ON public.campaign_messages
      FOR EACH ROW EXECUTE FUNCTION public.append_campaign_message_status_history();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_campaign_status_history_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Campaign status history is append-only'; END $$;
REVOKE ALL ON FUNCTION public.prevent_campaign_status_history_rewrite() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='campaign_status_history_immutable' AND tgrelid='public.campaign_message_status_history'::regclass) THEN
    CREATE TRIGGER campaign_status_history_immutable BEFORE UPDATE OR DELETE ON public.campaign_message_status_history
      FOR EACH ROW EXECUTE FUNCTION public.prevent_campaign_status_history_rewrite();
  END IF;
END $$;
COMMIT;

-- Verify after approved execution: no historical states are invented.
SELECT count(*) AS logged_future_transitions FROM public.campaign_message_status_history;
-- Recovery/rollback of application code never deletes this ledger.
-- To pause future recording only (owner approval required):
-- ALTER TABLE public.campaign_messages DISABLE TRIGGER campaign_message_status_history_append;