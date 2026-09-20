-- Campaign lifecycle live updates (additive, safe to re-run).
--
-- The open campaign page follows its own campaign row so a launch, pause,
-- resume, automatic pause or completion performed elsewhere (campaigns list,
-- public API, scheduler) is reflected without a manual browser refresh.
-- RLS still applies to realtime, so subscribers only receive campaigns in a
-- workspace they belong to.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campaigns'
  ) then
    alter publication supabase_realtime add table public.campaigns;
  end if;
end $$;

-- Full row images so status transitions are delivered with their new value.
alter table public.campaigns replica identity full;
