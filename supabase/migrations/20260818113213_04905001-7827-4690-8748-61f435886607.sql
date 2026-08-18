CREATE TABLE public.campaign_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.campaign_messages(id) ON DELETE SET NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  from_email text NOT NULL,
  to_email text,
  subject text,
  body text,
  sentiment text NOT NULL DEFAULT 'neutral',
  received_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_replies_lead ON public.campaign_replies(lead_id, received_at DESC);
CREATE INDEX idx_campaign_replies_campaign ON public.campaign_replies(campaign_id, received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_replies TO authenticated;
GRANT ALL ON public.campaign_replies TO service_role;

ALTER TABLE public.campaign_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read replies" ON public.campaign_replies FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members can add replies" ON public.campaign_replies FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members can update replies" ON public.campaign_replies FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members can delete replies" ON public.campaign_replies FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin','campaign_manager']::public.workspace_role[]));