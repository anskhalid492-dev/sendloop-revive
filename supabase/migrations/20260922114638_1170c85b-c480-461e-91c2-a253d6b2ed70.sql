ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS conversations_workspace_starred_idx
  ON public.conversations (workspace_id, last_message_at DESC)
  WHERE starred;