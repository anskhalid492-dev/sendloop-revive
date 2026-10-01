-- Speeds up deleting campaigns (additive only; safe to re-run).
-- Deleting a campaign cascades to recipients/messages and clears links in
-- other tables; without these indexes each step scans whole tables.
CREATE INDEX IF NOT EXISTS campaign_messages_recipient_id_idx ON public.campaign_messages (recipient_id);
CREATE INDEX IF NOT EXISTS campaign_messages_step_id_idx ON public.campaign_messages (step_id);
CREATE INDEX IF NOT EXISTS campaign_replies_message_id_idx ON public.campaign_replies (message_id);
CREATE INDEX IF NOT EXISTS campaign_step_variants_campaign_id_idx ON public.campaign_step_variants (campaign_id);
CREATE INDEX IF NOT EXISTS conversation_messages_campaign_message_id_idx ON public.conversation_messages (campaign_message_id);
CREATE INDEX IF NOT EXISTS conversations_campaign_id_idx ON public.conversations (campaign_id);
CREATE INDEX IF NOT EXISTS email_engagement_events_message_id_idx ON public.email_engagement_events (message_id);
CREATE INDEX IF NOT EXISTS lead_activities_campaign_id_idx ON public.lead_activities (campaign_id);
CREATE INDEX IF NOT EXISTS automation_runs_campaign_id_idx ON public.automation_runs (campaign_id);
CREATE INDEX IF NOT EXISTS automation_events_campaign_id_idx ON public.automation_events (campaign_id);
CREATE INDEX IF NOT EXISTS inbound_routes_campaign_id_idx ON public.inbound_routes (campaign_id);
