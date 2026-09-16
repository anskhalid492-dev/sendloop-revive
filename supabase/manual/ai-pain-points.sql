-- AI Campaign Writer: per-lead pain points
--
-- Additive only. Adds one column that stores the pain points the AI wrote for
-- each individual lead, so {{pain_point}} / {{pain_point_2}} … can be filled in
-- per lead at send time. Nothing is dropped, renamed or deleted, and existing
-- rows keep working (they simply start with an empty list).
--
-- Safe to run more than once.

ALTER TABLE public.ai_personalizations
  ADD COLUMN IF NOT EXISTS pain_points jsonb NOT NULL DEFAULT '[]'::jsonb;
