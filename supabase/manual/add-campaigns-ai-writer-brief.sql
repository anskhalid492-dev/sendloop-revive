-- AI Campaign Writer: additive column only. Rerunnable, nothing dropped or modified.
-- Run once against production.
alter table public.campaigns
  add column if not exists ai_writer_brief jsonb not null default '{}'::jsonb;

-- Confirm (expect one row):
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'campaigns' and column_name = 'ai_writer_brief';
