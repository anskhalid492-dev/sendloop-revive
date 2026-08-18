CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.schedule('sendloop-campaign-runner', '*/5 * * * *', $$SELECT public.run_campaign_scheduler();$$);
SELECT cron.schedule('sendloop-inbound-retry', '*/10 * * * *', $$SELECT public.run_inbound_retry();$$);