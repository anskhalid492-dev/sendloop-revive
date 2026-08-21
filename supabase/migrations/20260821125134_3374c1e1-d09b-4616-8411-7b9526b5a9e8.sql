-- Transactional email system: templates, versions, queue/log
CREATE TABLE public.transactional_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  is_default boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'published',
  version integer NOT NULL DEFAULT 1,
  subject text NOT NULL,
  preheader text,
  from_name text,
  from_email text,
  reply_to text,
  html text NOT NULL,
  text_body text,
  variables text[] NOT NULL DEFAULT '{}',
  draft jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transactional_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.transactional_templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  subject text NOT NULL,
  preheader text,
  from_name text,
  from_email text,
  reply_to text,
  html text NOT NULL,
  text_body text,
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE TABLE public.transactional_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  template_id uuid REFERENCES public.transactional_templates(id) ON DELETE SET NULL,
  template_version integer,
  to_email text NOT NULL,
  from_email text,
  reply_to text,
  subject text NOT NULL,
  html text,
  text_body text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider text,
  provider_message_id text,
  provider_status_code integer,
  error text,
  bounce_reason text,
  idempotency_key text UNIQUE,
  test_mode boolean NOT NULL DEFAULT false,
  workspace_id uuid,
  user_id uuid,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transactional_emails_status_idx ON public.transactional_emails (status, next_attempt_at);
CREATE INDEX transactional_emails_recipient_idx ON public.transactional_emails (to_email);
CREATE INDEX transactional_emails_created_idx ON public.transactional_emails (created_at DESC);
CREATE INDEX transactional_emails_provider_msg_idx ON public.transactional_emails (provider_message_id);

GRANT ALL ON public.transactional_templates TO service_role;
GRANT ALL ON public.transactional_template_versions TO service_role;
GRANT ALL ON public.transactional_emails TO service_role;
GRANT SELECT ON public.transactional_templates TO authenticated;
GRANT SELECT ON public.transactional_template_versions TO authenticated;
GRANT SELECT ON public.transactional_emails TO authenticated;

ALTER TABLE public.transactional_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactional_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactional_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform admins read transactional templates"
  ON public.transactional_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "platform admins read transactional versions"
  ON public.transactional_template_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "platform admins read transactional emails"
  ON public.transactional_emails FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER transactional_templates_updated_at
  BEFORE UPDATE ON public.transactional_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER transactional_emails_updated_at
  BEFORE UPDATE ON public.transactional_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_settings (key, value)
VALUES ('transactional_email', jsonb_build_object(
  'enabled', true,
  'paused', false,
  'test_mode', false,
  'from_name', 'MunchReach',
  'from_email', 'support@munchreach.com',
  'reply_to', 'support@munchreach.com',
  'retry_count', 3,
  'retry_delay_seconds', 300,
  'batch_size', 25
))
ON CONFLICT (key) DO NOTHING;