CREATE TYPE public.campaign_status AS ENUM ('draft','scheduled','active','paused','completed','archived');
CREATE TYPE public.recipient_status AS ENUM ('pending','in_progress','completed','replied','bounced','unsubscribed','failed','stopped');

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  list_id uuid REFERENCES public.lead_lists(id) ON DELETE SET NULL,
  sending_account_ids uuid[] NOT NULL DEFAULT '{}',
  timezone text NOT NULL DEFAULT 'UTC',
  send_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  send_start_hour smallint NOT NULL DEFAULT 9,
  send_end_hour smallint NOT NULL DEFAULT 17,
  daily_cap integer NOT NULL DEFAULT 100,
  stop_on_reply boolean NOT NULL DEFAULT true,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  launched_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  step_order smallint NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  wait_days smallint NOT NULL DEFAULT 0,
  wait_hours smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_order)
);

CREATE TABLE public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  current_step smallint NOT NULL DEFAULT 0,
  status public.recipient_status NOT NULL DEFAULT 'pending',
  next_send_at timestamptz,
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);

CREATE INDEX campaign_recipients_due_idx ON public.campaign_recipients (status, next_send_at);
CREATE INDEX campaign_steps_campaign_idx ON public.campaign_steps (campaign_id, step_order);
CREATE INDEX campaigns_workspace_idx ON public.campaigns (workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_steps TO authenticated;
GRANT ALL ON public.campaign_steps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_select ON public.campaigns FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY campaigns_insert ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));
CREATE POLICY campaigns_update ON public.campaigns FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));
CREATE POLICY campaigns_delete ON public.campaigns FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

CREATE POLICY campaign_steps_select ON public.campaign_steps FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY campaign_steps_insert ON public.campaign_steps FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));
CREATE POLICY campaign_steps_update ON public.campaign_steps FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));
CREATE POLICY campaign_steps_delete ON public.campaign_steps FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));

CREATE POLICY campaign_recipients_select ON public.campaign_recipients FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY campaign_recipients_insert ON public.campaign_recipients FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));
CREATE POLICY campaign_recipients_update ON public.campaign_recipients FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));
CREATE POLICY campaign_recipients_delete ON public.campaign_recipients FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','campaign_manager']::workspace_role[]));

CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER campaign_steps_updated_at BEFORE UPDATE ON public.campaign_steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER campaign_recipients_updated_at BEFORE UPDATE ON public.campaign_recipients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();