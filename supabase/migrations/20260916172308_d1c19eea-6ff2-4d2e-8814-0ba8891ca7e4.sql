-- Additive only: stores the AI Campaign Writer brief/strategy per campaign so a
-- customer can return to it later. Nothing existing is modified or dropped.
alter table public.campaigns
  add column if not exists ai_writer_brief jsonb not null default '{}'::jsonb;