create or replace function public.public_auth_settings()
returns table(google_enabled boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value->>'google')::boolean from public.platform_settings where key = 'auth_providers'),
    true
  ) as google_enabled;
$$;

revoke all on function public.public_auth_settings() from public;
grant execute on function public.public_auth_settings() to anon, authenticated, service_role;