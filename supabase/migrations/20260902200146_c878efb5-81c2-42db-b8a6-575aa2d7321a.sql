ALTER TABLE public.campaign_messages
  ADD COLUMN IF NOT EXISTS final_subject text,
  ADD COLUMN IF NOT EXISTS final_body text,
  ADD COLUMN IF NOT EXISTS final_html text,
  ADD COLUMN IF NOT EXISTS final_from_email text,
  ADD COLUMN IF NOT EXISTS final_from_name text,
  ADD COLUMN IF NOT EXISTS final_to_email text,
  ADD COLUMN IF NOT EXISTS rendered_at timestamptz;