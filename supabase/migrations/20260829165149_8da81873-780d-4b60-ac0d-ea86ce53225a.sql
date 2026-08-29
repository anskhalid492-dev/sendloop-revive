-- ============================================================
-- MunchReach Marketing Engine (admin-only, separate from cold email)
-- ============================================================

CREATE TABLE public.marketing_subscribers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  user_id UUID,
  source TEXT NOT NULL DEFAULT 'manual',
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','unsubscribed','bounced','complained','suppressed')),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  subscribed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_subscribers_email_key UNIQUE (email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_subscribers TO authenticated;
GRANT ALL ON public.marketing_subscribers TO service_role;
ALTER TABLE public.marketing_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing subscribers" ON public.marketing_subscribers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_marketing_subscribers_status ON public.marketing_subscribers (status);
CREATE INDEX idx_marketing_subscribers_user ON public.marketing_subscribers (user_id);

CREATE TABLE public.marketing_segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'rule' CHECK (kind IN ('rule','manual')),
  conditions JSONB NOT NULL DEFAULT '{"match":"all","rules":[]}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_segments_key_key UNIQUE (key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_segments TO authenticated;
GRANT ALL ON public.marketing_segments TO service_role;
ALTER TABLE public.marketing_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing segments" ON public.marketing_segments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_segment_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  segment_id UUID NOT NULL REFERENCES public.marketing_segments(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES public.marketing_subscribers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_segment_members_unique UNIQUE (segment_id, subscriber_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_segment_members TO authenticated;
GRANT ALL ON public.marketing_segment_members TO service_role;
ALTER TABLE public.marketing_segment_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing segment members" ON public.marketing_segment_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'newsletter',
  subject TEXT NOT NULL DEFAULT '',
  preview_text TEXT NOT NULL DEFAULT '',
  from_name TEXT,
  reply_to TEXT,
  body TEXT NOT NULL DEFAULT '',
  duplicated_from TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_templates TO authenticated;
GRANT ALL ON public.marketing_templates TO service_role;
ALTER TABLE public.marketing_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing templates" ON public.marketing_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_email_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('ses','resend','sendgrid','mailgun','smtp')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active','inactive')),
  connection_status TEXT NOT NULL DEFAULT 'untested'
    CHECK (connection_status IN ('untested','connected','failed')),
  health TEXT NOT NULL DEFAULT 'unknown' CHECK (health IN ('unknown','healthy','degraded','down')),
  last_tested_at TIMESTAMPTZ,
  last_test_message TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_send_limit INTEGER,
  rate_per_second INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_email_providers TO authenticated;
GRANT ALL ON public.marketing_email_providers TO service_role;
ALTER TABLE public.marketing_email_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing providers" ON public.marketing_email_providers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Encrypted credentials: backend services only. No browser session may read this.
CREATE TABLE public.marketing_provider_secrets (
  provider_id UUID NOT NULL PRIMARY KEY
    REFERENCES public.marketing_email_providers(id) ON DELETE CASCADE,
  encrypted_credentials TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_provider_secrets TO service_role;
ALTER TABLE public.marketing_provider_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_sending_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL,
  provider_id UUID REFERENCES public.marketing_email_providers(id) ON DELETE SET NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','failed')),
  spf_status TEXT NOT NULL DEFAULT 'pending' CHECK (spf_status IN ('pending','pass','fail')),
  dkim_status TEXT NOT NULL DEFAULT 'pending' CHECK (dkim_status IN ('pending','pass','fail')),
  dmarc_status TEXT NOT NULL DEFAULT 'pending' CHECK (dmarc_status IN ('pending','pass','fail')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  dns_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_provider_ids UUID[] NOT NULL DEFAULT '{}',
  last_checked_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_sending_domains_domain_key UNIQUE (domain)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_sending_domains TO authenticated;
GRANT ALL ON public.marketing_sending_domains TO service_role;
ALTER TABLE public.marketing_sending_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing sending domains" ON public.marketing_sending_domains
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'newsletter',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','sending','sent','paused','cancelled','failed')),
  segment_id UUID REFERENCES public.marketing_segments(id) ON DELETE SET NULL,
  segment_key TEXT,
  template_id UUID REFERENCES public.marketing_templates(id) ON DELETE SET NULL,
  builtin_template_key TEXT,
  sending_domain_id UUID REFERENCES public.marketing_sending_domains(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.marketing_email_providers(id) ON DELETE SET NULL,
  from_name TEXT NOT NULL DEFAULT 'MunchReach',
  from_email TEXT NOT NULL DEFAULT '',
  reply_to TEXT,
  subject_override TEXT,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing campaigns" ON public.marketing_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES public.marketing_subscribers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  skip_reason TEXT,
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_campaign_recipients_unique UNIQUE (campaign_id, subscriber_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaign_recipients TO authenticated;
GRANT ALL ON public.marketing_campaign_recipients TO service_role;
ALTER TABLE public.marketing_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing campaign recipients" ON public.marketing_campaign_recipients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trigger_event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  blueprint_key TEXT,
  segment_id UUID REFERENCES public.marketing_segments(id) ON DELETE SET NULL,
  segment_key TEXT,
  sending_domain_id UUID REFERENCES public.marketing_sending_domains(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.marketing_email_providers(id) ON DELETE SET NULL,
  from_name TEXT NOT NULL DEFAULT 'MunchReach',
  from_email TEXT NOT NULL DEFAULT '',
  reply_to TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_automations TO authenticated;
GRANT ALL ON public.marketing_automations TO service_role;
ALTER TABLE public.marketing_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing automations" ON public.marketing_automations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_automation_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES public.marketing_automations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  step_type TEXT NOT NULL
    CHECK (step_type IN ('send_email','wait','condition','add_tag','remove_tag','add_to_segment','remove_from_segment')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_automation_steps TO authenticated;
GRANT ALL ON public.marketing_automation_steps TO service_role;
ALTER TABLE public.marketing_automation_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing automation steps" ON public.marketing_automation_steps
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_automation_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES public.marketing_automations(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES public.marketing_subscribers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','cancelled','failed')),
  current_step INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_event TEXT NOT NULL DEFAULT '',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_enrollment_unique UNIQUE (automation_id, subscriber_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_automation_enrollments TO authenticated;
GRANT ALL ON public.marketing_automation_enrollments TO service_role;
ALTER TABLE public.marketing_automation_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing enrollments" ON public.marketing_automation_enrollments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_suppression (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe','bounce','complaint','manual','import')),
  source TEXT NOT NULL DEFAULT 'system',
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_suppression_email_key UNIQUE (email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_suppression TO authenticated;
GRANT ALL ON public.marketing_suppression TO service_role;
ALTER TABLE public.marketing_suppression ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing suppression" ON public.marketing_suppression
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_email_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'marketing_email_sent','marketing_email_delivered','marketing_email_opened',
    'marketing_email_clicked','marketing_email_bounced','marketing_email_complained',
    'marketing_email_unsubscribed','marketing_email_failed','marketing_email_suppressed'
  )),
  subscriber_id UUID REFERENCES public.marketing_subscribers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  automation_id UUID REFERENCES public.marketing_automations(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.marketing_email_providers(id) ON DELETE SET NULL,
  sending_domain_id UUID REFERENCES public.marketing_sending_domains(id) ON DELETE SET NULL,
  provider_message_id TEXT,
  detail TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_email_events TO authenticated;
GRANT ALL ON public.marketing_email_events TO service_role;
ALTER TABLE public.marketing_email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read marketing events" ON public.marketing_email_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_marketing_events_campaign ON public.marketing_email_events (campaign_id);
CREATE INDEX idx_marketing_events_email_created ON public.marketing_email_events (email, created_at DESC);

CREATE TABLE public.marketing_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  form_type TEXT NOT NULL DEFAULT 'newsletter_signup'
    CHECK (form_type IN ('newsletter_signup','product_updates','educational_content','resource_signup')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  collect_first_name BOOLEAN NOT NULL DEFAULT true,
  consent_text TEXT NOT NULL DEFAULT 'I agree to receive marketing emails from MunchReach.',
  success_message TEXT NOT NULL DEFAULT 'Thanks — please check your inbox.',
  source TEXT NOT NULL DEFAULT 'form',
  tags TEXT[] NOT NULL DEFAULT '{}',
  segment_id UUID REFERENCES public.marketing_segments(id) ON DELETE SET NULL,
  submissions_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_forms_slug_key UNIQUE (slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_forms TO authenticated;
GRANT ALL ON public.marketing_forms TO service_role;
ALTER TABLE public.marketing_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing forms" ON public.marketing_forms
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_form_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.marketing_forms(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  consent BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_form_submissions TO authenticated;
GRANT ALL ON public.marketing_form_submissions TO service_role;
ALTER TABLE public.marketing_form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read marketing form submissions" ON public.marketing_form_submissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.marketing_settings (
  id BOOLEAN NOT NULL PRIMARY KEY DEFAULT true CHECK (id),
  default_provider_id UUID REFERENCES public.marketing_email_providers(id) ON DELETE SET NULL,
  default_sending_domain_id UUID REFERENCES public.marketing_sending_domains(id) ON DELETE SET NULL,
  max_emails_per_day INTEGER NOT NULL DEFAULT 1,
  max_emails_per_week INTEGER NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.marketing_settings TO authenticated;
GRANT ALL ON public.marketing_settings TO service_role;
ALTER TABLE public.marketing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage marketing settings" ON public.marketing_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.marketing_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- updated_at maintenance
CREATE TRIGGER trg_marketing_subscribers_updated BEFORE UPDATE ON public.marketing_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketing_segments_updated BEFORE UPDATE ON public.marketing_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketing_templates_updated BEFORE UPDATE ON public.marketing_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketing_providers_updated BEFORE UPDATE ON public.marketing_email_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketing_domains_updated BEFORE UPDATE ON public.marketing_sending_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketing_campaigns_updated BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketing_recipients_updated BEFORE UPDATE ON public.marketing_campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketing_automations_updated BEFORE UPDATE ON public.marketing_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketing_automation_steps_updated BEFORE UPDATE ON public.marketing_automation_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketing_enrollments_updated BEFORE UPDATE ON public.marketing_automation_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketing_forms_updated BEFORE UPDATE ON public.marketing_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
