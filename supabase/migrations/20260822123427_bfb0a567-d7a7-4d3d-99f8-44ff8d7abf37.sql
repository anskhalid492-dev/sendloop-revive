alter table public.warmup_settings
  add column if not exists last_run_reason text,
  add column if not exists last_run_at timestamptz,
  add column if not exists solo_mode boolean not null default true;

create or replace function public.claim_warmup_jobs_for_account(_worker text, _limit integer, _account uuid)
returns setof public.warmup_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.warmup_jobs
  set status = 'queued', locked_by = null, locked_at = null
  where status = 'processing'
    and sending_account_id = _account
    and locked_at < now() - interval '10 minutes';

  return query
  with due as (
    select j.id
    from public.warmup_jobs j
    where j.status = 'queued'
      and j.sending_account_id = _account
      and (j.next_attempt_at is null or j.next_attempt_at <= now())
    order by j.scheduled_at
    limit greatest(1, least(_limit, 50))
    for update skip locked
  )
  update public.warmup_jobs j
  set status = 'processing',
      locked_by = _worker,
      locked_at = now(),
      attempts = j.attempts + 1
  from due
  where j.id = due.id
  returning j.*;
end;
$$;

revoke all on function public.claim_warmup_jobs_for_account(text, integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_warmup_jobs_for_account(text, integer, uuid) to service_role;