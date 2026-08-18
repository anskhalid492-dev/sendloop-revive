CREATE TABLE public.inbound_event_actions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.email_events(id) on delete cascade,
  actor_id uuid,
  actor_email text,
  action text not null,
  previous_status text,
  result_status text not null,
  outcome text not null,
  conversation_id uuid,
  detail text,
  created_at timestamptz not null default now()
);

CREATE INDEX inbound_event_actions_event_idx ON public.inbound_event_actions(event_id, created_at DESC);

GRANT SELECT ON public.inbound_event_actions TO authenticated;
GRANT ALL ON public.inbound_event_actions TO service_role;

ALTER TABLE public.inbound_event_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read inbound event actions"
ON public.inbound_event_actions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));