ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.lead_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.lead_notes REPLICA IDENTITY FULL;
ALTER TABLE public.lead_activities REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_recipients REPLICA IDENTITY FULL;
ALTER TABLE public.crm_stages REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_stages;