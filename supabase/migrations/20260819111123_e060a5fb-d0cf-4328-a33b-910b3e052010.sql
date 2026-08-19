CREATE TABLE IF NOT EXISTS public.integrations (
  slug text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  tagline text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  requires_paid_plan boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integrations TO anon;
GRANT SELECT ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integrations_public_read ON public.integrations;
CREATE POLICY integrations_public_read ON public.integrations
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS integrations_admin_all ON public.integrations;
CREATE POLICY integrations_admin_all ON public.integrations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP TRIGGER IF EXISTS integrations_updated_at ON public.integrations;
CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL REFERENCES public.integrations(slug) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'connected',
  account_label text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  last_synced_at timestamptz,
  last_event_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);
GRANT SELECT ON public.integration_connections TO authenticated;
GRANT ALL ON public.integration_connections TO service_role;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_connections_select ON public.integration_connections;
CREATE POLICY integration_connections_select ON public.integration_connections
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS integration_connections_admin ON public.integration_connections;
CREATE POLICY integration_connections_admin ON public.integration_connections
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP TRIGGER IF EXISTS integration_connections_updated_at ON public.integration_connections;
CREATE TRIGGER integration_connections_updated_at BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.integration_secrets (
  connection_id uuid PRIMARY KEY REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  credentials_ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.integration_secrets TO service_role;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  slug text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_events_ws_idx
  ON public.integration_events (workspace_id, created_at DESC);
GRANT SELECT ON public.integration_events TO authenticated;
GRANT ALL ON public.integration_events TO service_role;
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_events_select ON public.integration_events;
CREATE POLICY integration_events_select ON public.integration_events
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS integration_events_admin ON public.integration_events;
CREATE POLICY integration_events_admin ON public.integration_events
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.integration_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  slug text NOT NULL,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  records integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS integration_sync_logs_ws_idx
  ON public.integration_sync_logs (workspace_id, started_at DESC);
GRANT SELECT ON public.integration_sync_logs TO authenticated;
GRANT ALL ON public.integration_sync_logs TO service_role;
ALTER TABLE public.integration_sync_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_sync_logs_select ON public.integration_sync_logs;
CREATE POLICY integration_sync_logs_select ON public.integration_sync_logs
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS integration_sync_logs_admin ON public.integration_sync_logs;
CREATE POLICY integration_sync_logs_admin ON public.integration_sync_logs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.integrations (slug, name, category, tagline, requires_paid_plan, sort_order) VALUES
  ('openai', 'OpenAI', 'ai', 'Generate and rewrite cold email copy with your own OpenAI key.', false, 10),
  ('slack', 'Slack', 'notifications', 'Get positive replies and campaign alerts in a Slack channel.', false, 20),
  ('zapier', 'Zapier', 'automation', 'Trigger thousands of apps whenever something happens in Sendloop.', false, 30),
  ('make', 'Make', 'automation', 'Build visual scenarios on top of Sendloop events.', false, 40),
  ('hubspot', 'HubSpot', 'crm', 'Sync replies, contacts and deals with your HubSpot pipeline.', true, 50),
  ('gohighlevel', 'GoHighLevel', 'crm', 'Push interested prospects straight into GoHighLevel.', true, 60),
  ('calendly', 'Calendly', 'calendar', 'Track booked meetings from your outreach automatically.', false, 70),
  ('google-sheets', 'Google Sheets', 'data', 'Export leads and campaign results into a live spreadsheet.', false, 80)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category,
      tagline = EXCLUDED.tagline,
      sort_order = EXCLUDED.sort_order;