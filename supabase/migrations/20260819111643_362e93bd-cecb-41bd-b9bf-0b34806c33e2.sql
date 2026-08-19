DELETE FROM public.leads a USING public.leads b
WHERE a.workspace_id = b.workspace_id
  AND lower(a.email) = lower(b.email)
  AND a.ctid > b.ctid;

UPDATE public.leads SET email = lower(email) WHERE email <> lower(email);

CREATE UNIQUE INDEX IF NOT EXISTS leads_workspace_email_key
  ON public.leads (workspace_id, email);