-- Run manually against the LIVE production project.
-- Lets a workspace keep one AI key PER PROVIDER (OpenAI and Claude side by side)
-- instead of a single key overall, so each campaign can choose its provider.
-- Idempotent. No credentials or rows are deleted or modified.

ALTER TABLE public.workspace_ai_keys DROP CONSTRAINT IF EXISTS workspace_ai_keys_pkey;
ALTER TABLE public.workspace_ai_keys
  ADD CONSTRAINT workspace_ai_keys_pkey PRIMARY KEY (workspace_id, provider);

NOTIFY pgrst, 'reload schema';
