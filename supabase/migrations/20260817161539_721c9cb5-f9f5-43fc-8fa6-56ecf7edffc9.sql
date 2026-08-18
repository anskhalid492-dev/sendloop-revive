GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_uses TO authenticated;
GRANT ALL ON public.template_uses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_messages TO authenticated;
GRANT ALL ON public.campaign_messages TO service_role;