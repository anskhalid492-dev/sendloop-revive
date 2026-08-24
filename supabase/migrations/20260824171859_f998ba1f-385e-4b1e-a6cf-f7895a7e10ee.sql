ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS positive_reply_notifications boolean NOT NULL DEFAULT true;