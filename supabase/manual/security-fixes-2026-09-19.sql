-- Security fixes — 2026-09-19. Run against production (rihgzkofoxcjljlbvbya).
-- Additive and re-runnable. Nothing here deletes application data.
--
-- Covers:
--   1. referral_programs: commission/payout terms readable by ANY signed-in user.
--   2. workspace_members: RLS allowed owners/admins to add arbitrary users
--      without an accepted invitation.
--   3. SECURITY DEFINER functions executable by the anon (not-signed-in) role.
--
-- Run each section separately (see notes in security-fixes-2026-09-16.sql).

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. referral_programs is internal financial configuration.
--    App reads go through service-role code and referral_program_public(),
--    so no customer feature depends on direct table reads.
-- ---------------------------------------------------------------------------
drop policy if exists "Signed-in users read program settings" on public.referral_programs;
drop policy if exists "Admins read program settings" on public.referral_programs;
create policy "Admins read program settings"
  on public.referral_programs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- 2. Membership rows may only be created by:
--      a) the workspace owner bootstrapping their own membership, or
--      b) accept_workspace_invitation() / server-side service-role code,
--         which validate the invitation token and bypass RLS.
--    Direct "owner/admin adds any user" inserts are no longer allowed.
-- ---------------------------------------------------------------------------
drop policy if exists "members_insert_admin" on public.workspace_members;
create policy "members_insert_admin" on public.workspace_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Revoke EXECUTE from anon on every SECURITY DEFINER function that is not
--    part of the intentionally public API. Retries per function so a busy
--    function does not deadlock the whole run. Safe to re-run.
-- ---------------------------------------------------------------------------
do $$
declare
  fn record;
  attempt int;
  done boolean;
  skipped text[] := '{}';
  keep_public text[] := array[
    'public_auth_settings','public_platform_config','public_platform_flags',
    'public_review_stats','referral_program_public'
  ];
begin
  for fn in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not (p.proname = any (keep_public))
    order by p.proname
  loop
    done := false;
    attempt := 0;
    while not done and attempt < 5 loop
      attempt := attempt + 1;
      begin
        execute format('revoke execute on function %s from anon', fn.sig);
        execute format('revoke execute on function %s from public', fn.sig);
        done := true;
      exception
        when lock_not_available or deadlock_detected then
          perform pg_sleep(0.5 * attempt);
      end;
    end loop;
    if not done then skipped := skipped || fn.sig; end if;
  end loop;

  if array_length(skipped, 1) is not null then
    raise notice 'Still locked, re-run to finish: %', array_to_string(skipped, ', ');
  end if;
end $$;

-- Re-assert grants for the intentionally public helpers (idempotent).
grant execute on function public.public_auth_settings() to anon, authenticated, service_role;
grant execute on function public.public_platform_config() to anon, authenticated, service_role;
grant execute on function public.public_platform_flags() to anon, authenticated, service_role;
grant execute on function public.public_review_stats() to anon, authenticated, service_role;
grant execute on function public.referral_program_public() to anon, authenticated, service_role;
