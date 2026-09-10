ALTER TABLE public.workspace_ai_keys DROP CONSTRAINT IF EXISTS workspace_ai_keys_pkey;
ALTER TABLE public.workspace_ai_keys ADD CONSTRAINT workspace_ai_keys_pkey PRIMARY KEY (workspace_id, provider);