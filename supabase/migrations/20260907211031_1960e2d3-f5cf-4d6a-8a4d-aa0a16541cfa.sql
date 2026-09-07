UPDATE public.ai_personalizations
SET attempts = 0,
    locked_by = NULL,
    locked_until = NULL
WHERE status = 'queued'
  AND attempts >= 4;