alter table public.warmup_jobs
  add column if not exists warmup_token text,
  add column if not exists placement text not null default 'pending',
  add column if not exists placement_checked_at timestamptz,
  add column if not exists received_at timestamptz;

create unique index if not exists warmup_jobs_warmup_token_key
  on public.warmup_jobs (warmup_token)
  where warmup_token is not null;

create index if not exists warmup_jobs_placement_idx
  on public.warmup_jobs (placement, processed_at);

alter table public.warmup_daily_stats
  add column if not exists inbox integer not null default 0,
  add column if not exists spam integer not null default 0,
  add column if not exists deferred integer not null default 0,
  add column if not exists rejected integer not null default 0,
  add column if not exists not_received integer not null default 0;