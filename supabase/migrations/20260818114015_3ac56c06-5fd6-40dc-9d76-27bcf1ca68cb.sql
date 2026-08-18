-- Platform settings (admin only)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage platform settings" ON public.platform_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER platform_settings_updated_at BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_providers ADD COLUMN IF NOT EXISTS reply_to_email text;

-- Conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  thread_key text NOT NULL,
  subject text NOT NULL DEFAULT '',
  prospect_email text NOT NULL,
  status text NOT NULL DEFAULT 'lead',
  assigned_to uuid,
  tags text[] NOT NULL DEFAULT '{}',
  unread boolean NOT NULL DEFAULT true,
  archived boolean NOT NULL DEFAULT false,
  snoozed_until timestamptz,
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_direction text NOT NULL DEFAULT 'outbound',
  last_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_status_check CHECK (status IN ('lead','interested','meeting_booked','meeting_completed','won','not_interested','ooo','unsubscribed','bounced')),
  CONSTRAINT conversations_thread_unique UNIQUE (workspace_id, thread_key)
);
CREATE INDEX IF NOT EXISTS conversations_ws_last_idx ON public.conversations (workspace_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_lead_idx ON public.conversations (lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read conversations" ON public.conversations FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members write conversations" ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members update conversations" ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Managers delete conversations" ON public.conversations FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin']::public.workspace_role[]));
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Conversation messages
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  direction text NOT NULL,
  from_email text NOT NULL,
  from_name text,
  to_email text NOT NULL,
  cc_emails text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  html text,
  message_id text,
  in_reply_to text,
  reference_ids text[] NOT NULL DEFAULT '{}',
  campaign_message_id uuid REFERENCES public.campaign_messages(id) ON DELETE SET NULL,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  provider_message_id text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  opened_at timestamptz,
  clicked_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_messages_direction_check CHECK (direction IN ('outbound','inbound'))
);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_msgid_unique
  ON public.conversation_messages (workspace_id, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversation_messages_conv_idx ON public.conversation_messages (conversation_id, occurred_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_messages TO authenticated;
GRANT ALL ON public.conversation_messages TO service_role;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read conversation messages" ON public.conversation_messages FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members insert conversation messages" ON public.conversation_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Notes
CREATE TABLE IF NOT EXISTS public.conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_notes TO authenticated;
GRANT ALL ON public.conversation_notes TO service_role;
ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read notes" ON public.conversation_notes FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members create notes" ON public.conversation_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND author_id = auth.uid());
CREATE POLICY "Authors update notes" ON public.conversation_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "Authors or managers delete notes" ON public.conversation_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_workspace_role(workspace_id, auth.uid(), array['owner','admin']::public.workspace_role[]));
CREATE TRIGGER conversation_notes_updated_at BEFORE UPDATE ON public.conversation_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Events (audit trail)
CREATE TABLE IF NOT EXISTS public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  detail text,
  actor_id uuid,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_events_dedupe
  ON public.conversation_events (workspace_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
GRANT SELECT, INSERT ON public.conversation_events TO authenticated;
GRANT ALL ON public.conversation_events TO service_role;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read conversation events" ON public.conversation_events FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members insert conversation events" ON public.conversation_events FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;