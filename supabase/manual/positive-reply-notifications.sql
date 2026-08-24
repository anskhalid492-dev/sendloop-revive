-- MunchReach — Positive reply notifications
-- Run once against the production project (rihgzkofoxcjljlbvbya), SQL editor.
-- Safety: additive only, idempotent and re-runnable. Nothing is dropped or
-- rewritten. Default ON matches the product default.

BEGIN;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS positive_reply_notifications boolean NOT NULL DEFAULT true;

COMMIT;
