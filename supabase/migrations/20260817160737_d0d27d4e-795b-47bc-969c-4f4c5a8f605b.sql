CREATE TYPE public.message_status AS ENUM ('pending','scheduled','processing','sent','failed','cancelled');

CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  is_official boolean NOT NULL DEFAULT false,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Cold Outreach',
  description text,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  variables text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_templates_ownership CHECK (
    (is_official AND workspace_id IS NULL) OR (NOT is_official AND workspace_id IS NOT NULL)
  )
);
CREATE INDEX email_templates_workspace_idx ON public.email_templates(workspace_id);
CREATE INDEX email_templates_official_idx ON public.email_templates(is_official, published);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read official or own workspace templates" ON public.email_templates
FOR SELECT TO authenticated
USING (
  (is_official AND published)
  OR public.has_role(auth.uid(), 'admin')
  OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
);

CREATE POLICY "Managers create workspace templates" ON public.email_templates
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (
    NOT is_official
    AND workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin','campaign_manager']::public.workspace_role[])
  )
);

CREATE POLICY "Managers update own workspace templates" ON public.email_templates
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    NOT is_official
    AND workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin','campaign_manager']::public.workspace_role[])
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (
    NOT is_official
    AND workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin','campaign_manager']::public.workspace_role[])
  )
);

CREATE POLICY "Managers delete own workspace templates" ON public.email_templates
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    NOT is_official
    AND workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin','campaign_manager']::public.workspace_role[])
  )
);

CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.template_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX template_uses_workspace_idx ON public.template_uses(workspace_id, used_at DESC);

GRANT SELECT, INSERT, DELETE ON public.template_uses TO authenticated;
GRANT ALL ON public.template_uses TO service_role;
ALTER TABLE public.template_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read template uses" ON public.template_uses
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members record template uses" ON public.template_uses
FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND user_id = auth.uid());

CREATE TABLE public.campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.campaign_steps(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.campaign_step_variants(id) ON DELETE SET NULL,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  step_order smallint NOT NULL DEFAULT 1,
  status public.message_status NOT NULL DEFAULT 'pending',
  to_email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  scheduled_at timestamptz,
  sent_at timestamptz,
  provider text,
  provider_message_id text,
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_messages_campaign_idx ON public.campaign_messages(campaign_id, status);
CREATE INDEX campaign_messages_workspace_idx ON public.campaign_messages(workspace_id, scheduled_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_messages TO authenticated;
GRANT ALL ON public.campaign_messages TO service_role;
ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read campaign messages" ON public.campaign_messages
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers create campaign messages" ON public.campaign_messages
FOR INSERT TO authenticated
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin','campaign_manager']::public.workspace_role[]));

CREATE POLICY "Managers update campaign messages" ON public.campaign_messages
FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin','campaign_manager']::public.workspace_role[]) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin','campaign_manager']::public.workspace_role[]) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers delete campaign messages" ON public.campaign_messages
FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin','campaign_manager']::public.workspace_role[]) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER campaign_messages_updated_at BEFORE UPDATE ON public.campaign_messages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.email_templates (is_official, name, category, description, subject, body, variables, featured, published, display_order) VALUES
(true, 'Problem / solution', 'Cold Outreach', 'Opens on a specific pain and offers the managed alternative.', '{Quick question|Idea} about {{company | your team}}', 'Hi {{first_name | there}},

I noticed {{company | your team}} is growing the outbound side of the business. Most teams at that stage lose replies because sending is spread across mailboxes nobody is warming.

We handle the sending infrastructure so your team only writes the copy and picks the list.

Worth a short look?

{Best|Thanks},
{{sender_name | The team}}', array['first_name','company','sender_name'], true, true, 1),
(true, 'Referral angle', 'Referral', 'Asks for the right owner when you are not sure who to reach.', 'Are you the right person at {{company | your company}}?', 'Hi {{first_name | there}},

I''m trying to reach whoever owns outbound at {{company | your company}}. If that isn''t you, could you point me the right way?

We help teams like yours land cold email in the primary inbox without managing mailboxes.

{Thanks|Appreciate it},
{{sender_name | The team}}', array['first_name','company','sender_name'], false, true, 2),
(true, 'Short bump', 'Follow-Ups', 'A one-line nudge that keeps the thread alive.', 'Re: {{company | quick question}}', 'Hi {{first_name | there}},

Floating this back to the top of your inbox — worth a quick chat?

{Best|Thanks},
{{sender_name | The team}}', array['first_name','company','sender_name'], false, true, 3),
(true, 'Value add', 'Follow-Ups', 'Follow-up that leads with a proof point instead of a nudge.', 'One number worth seeing', 'Hi {{first_name | there}},

Teams that move sending onto managed infrastructure typically see reply rates climb within the first month, mostly because inbox placement stops fluctuating.

Happy to share how that maps to {{company | your setup}}.

{Best|Cheers},
{{sender_name | The team}}', array['first_name','company','sender_name'], true, true, 4),
(true, 'Polite close', 'Breakup', 'Closes the loop and leaves the door open.', 'Closing the loop', 'Hi {{first_name | there}},

I haven''t heard back, so I''ll assume the timing isn''t right. If outbound moves up the list at {{company | your company}}, just reply here and I''ll pick it up.

{Best|Thanks},
{{sender_name | The team}}', array['first_name','company','sender_name'], false, true, 5);