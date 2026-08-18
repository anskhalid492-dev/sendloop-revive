CREATE TABLE public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  channel text not null,
  destination text not null,
  status text not null default 'pending',
  error text,
  response_code integer,
  duration_ms integer,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins can read notification audit"
ON public.admin_notifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX admin_notifications_created_idx ON public.admin_notifications (created_at DESC);