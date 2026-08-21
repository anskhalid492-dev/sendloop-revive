DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['warmup_jobs','warmup_daily_stats','warmup_health','warmup_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS warmup_jobs_account_processed_idx
  ON public.warmup_jobs (sending_account_id, processed_at DESC);