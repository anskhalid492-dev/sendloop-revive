-- Security fixes — run once against the production database (rihgzkofoxcjljlbvbya).
-- Re-runnable: every statement is guarded. Nothing here deletes application data.
--
-- Covers:
--   1. storage.objects had no access policies at all (error-level finding).
--   2. email_open_events had two identical SELECT policies (duplicate, confusing).
--   3. SECURITY DEFINER helpers were EXECUTE-able by the anon (not-signed-in) role.
--
-- IMPORTANT: run this WITHOUT wrapping it in a transaction (no begin/commit).
-- The live app calls these same functions constantly; one long transaction that
-- locks every function at once deadlocks against in-flight requests
-- (40P01 deadlock detected). Each statement below commits on its own, and the
-- revoke loop commits after every function, so no lock is held for long.
-- lock_timeout makes a blocked statement give up quickly instead of deadlocking;
-- the loop retries those functions.

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Storage: workspace-scoped access for the private mail-attachments bucket.
--    Objects are keyed "<workspace_id>/<file>", so the first path segment is the
--    owning workspace. Service-role code (server functions) bypasses RLS and is
--    unaffected. The bucket is currently empty, so no existing file changes hands.
-- ---------------------------------------------------------------------------
drop policy if exists "Workspace members read own mail attachments" on storage.objects;
create policy "Workspace members read own mail attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'mail-attachments'
    and public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

drop policy if exists "Workspace members upload own mail attachments" on storage.objects;
create policy "Workspace members upload own mail attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mail-attachments'
    and public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

drop policy if exists "Workspace members update own mail attachments" on storage.objects;
create policy "Workspace members update own mail attachments"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'mail-attachments'
    and public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid())
  )
  with check (
    bucket_id = 'mail-attachments'
    and public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

drop policy if exists "Workspace members delete own mail attachments" on storage.objects;
create policy "Workspace members delete own mail attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'mail-attachments'
    and public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. Remove the duplicate SELECT policy on email_open_events.
--    "Workspace members read their open events" stays and keeps identical access.
-- ---------------------------------------------------------------------------
drop policy if exists "Workspace members can view open events" on public.email_open_events;

-- ---------------------------------------------------------------------------
-- 3. Revoke EXECUTE from anon on SECURITY DEFINER functions that are not part of
--    the intentionally public API (public_auth_settings, public_platform_config,
--    public_platform_flags, public_review_stats, referral_program_public keep it).
--    Trigger functions are also revoked from authenticated — triggers fire as the
--    table owner and never need a direct grant.
--
--    One function per commit, with retries: a function that is busy serving a
--    live request is retried instead of dragging the whole run into a deadlock.
-- ---------------------------------------------------------------------------
do $$
declare
  fn record;
  attempt int;
  done boolean;
  skipped text[] := '{}';
  trigger_fns text[] := array[
    'admin_audit_log_append_only','admin_security_events_append_only','credit_ledger_immutable',
    'enforce_managed_sending','ensure_workspace_owner_member','handle_new_user',
    'log_workspace_invitation_activity','log_workspace_member_activity',
    'mark_conversation_direction','mark_conversation_outbound','notify_support_reply',
    'notify_support_ticket_status','record_blog_slug_change','set_updated_at'
  ];
  keep_public text[] := array[
    'public_auth_settings','public_platform_config','public_platform_flags',
    'public_review_stats','referral_program_public'
  ];
begin
  for fn in
    select p.oid::regprocedure::text as sig, p.proname
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
        if fn.proname = any (trigger_fns) then
          execute format('revoke execute on function %s from authenticated', fn.sig);
          execute format('revoke execute on function %s from public', fn.sig);
        end if;
        done := true;
      exception
        when lock_not_available or deadlock_detected then
          -- Busy serving a live request; back off and try this one again.
          perform pg_sleep(0.5 * attempt);
      end;
    end loop;

    if done then
      -- Release the locks taken for this function before moving to the next one.
      commit;
    else
      skipped := skipped || fn.sig;
      rollback;
    end if;
  end loop;

  if array_length(skipped, 1) is not null then
    raise notice 'Still locked, re-run to finish: %', array_to_string(skipped, ', ');
  end if;
end $$;
