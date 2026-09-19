-- Security fixes — 2026-09-19 (batch B). Run against production (rihgzkofoxcjljlbvbya).
-- Additive, re-runnable, no data is deleted. Run one section at a time.
--
-- Covers:
--   1. billing_plan_prices: provider price IDs readable by every signed-in user.
--   2. mailboxes: SMTP/IMAP usernames + credential references readable by all
--      workspace members (column-level hardening; row policies unchanged).
--   3. support_ticket_messages: internal notes must never be returned to a
--      non-staff caller, regardless of how ticket ownership changes.
--   4. workspace_members: re-assert that membership rows cannot be self-created
--      in arbitrary workspaces (root of trust for all Realtime-exposed tables).

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. billing_plan_prices is internal billing configuration. Every app read
--    goes through service-role billing code, so no customer feature depends on
--    direct authenticated reads.
-- ---------------------------------------------------------------------------
drop policy if exists "billing_plan_prices readable" on public.billing_plan_prices;
drop policy if exists "billing_plan_prices admin read" on public.billing_plan_prices;
create policy "billing_plan_prices admin read"
  on public.billing_plan_prices for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

revoke all on table public.billing_plan_prices from anon;

-- ---------------------------------------------------------------------------
-- 2. Mailbox login identifiers and credential references are server-only.
--    Members keep read access to everything they actually need (address,
--    host, status, limits, warmup, health); the credential columns are removed
--    from the authenticated role entirely and read only by service-role code.
-- ---------------------------------------------------------------------------
do $$
declare
  cols text;
  secret_cols text[] := array['smtp_username','smtp_password','imap_username','imap_password'];
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'mailboxes'
    and not (column_name = any (secret_cols));

  if cols is null then
    raise notice 'mailboxes table not found — nothing to do';
    return;
  end if;

  execute 'revoke select on table public.mailboxes from authenticated';
  execute format('grant select (%s) on table public.mailboxes to authenticated', cols);
  -- Writes are unchanged: connecting/updating a mailbox runs through
  -- service-role code, which is unaffected by column grants.
  execute 'grant insert, update, delete on table public.mailboxes to authenticated';
  execute 'grant all on table public.mailboxes to service_role';
  execute 'revoke all on table public.mailboxes from anon';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Internal support notes: make the is_internal guard explicit and
--    independent of ticket ownership. Staff (admin/support) see everything;
--    everyone else can only ever see is_internal = false messages.
-- ---------------------------------------------------------------------------
drop policy if exists support_messages_select on public.support_ticket_messages;
create policy support_messages_select on public.support_ticket_messages
  for select to authenticated
  using (
    (
      public.has_role(auth.uid(), 'admin'::app_role)
      or public.has_role(auth.uid(), 'support'::app_role)
    )
    or (
      is_internal = false
      and exists (
        select 1 from public.support_tickets t
        where t.id = support_ticket_messages.ticket_id
          and t.created_by = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. workspace_members inserts: only a workspace owner bootstrapping their own
--    membership. All other membership creation goes through
--    accept_workspace_invitation() / service-role code, which validate the
--    invitation and bypass RLS. This is also what keeps Realtime-published
--    tables (leads, conversations, conversation_messages, campaign_messages)
--    scoped to real members.
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

revoke all on table public.workspace_members from anon;

-- ---------------------------------------------------------------------------
-- 5. SECURITY DEFINER functions must not be callable by the anon role.
--    (Same block as security-fixes-2026-09-19.sql — safe to re-run.)
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
  trigger_fns text[] := array[
    'admin_audit_log_append_only','admin_security_events_append_only','credit_ledger_immutable',
    'enforce_managed_sending','ensure_workspace_owner_member','handle_new_user',
    'log_workspace_invitation_activity','log_workspace_member_activity',
    'mark_conversation_direction','mark_conversation_outbound','notify_support_reply',
    'notify_support_ticket_status','record_blog_slug_change','set_updated_at',
    'update_updated_at_column','validate_testimonial','set_lead_retention'
  ];
begin
  for fn in
    select p.oid::regprocedure::text as sig, p.proname, p.prorettype = 'trigger'::regtype as is_trigger
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
        execute format('revoke execute on function %s from public', fn.sig);
        execute format('revoke execute on function %s from anon', fn.sig);
        if not (fn.is_trigger or fn.proname = any (trigger_fns)) then
          execute format('grant execute on function %s to authenticated, service_role', fn.sig);
        end if;
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

grant execute on function public.public_auth_settings() to anon, authenticated, service_role;
grant execute on function public.public_platform_config() to anon, authenticated, service_role;
grant execute on function public.public_platform_flags() to anon, authenticated, service_role;
grant execute on function public.public_review_stats() to anon, authenticated, service_role;
grant execute on function public.referral_program_public() to anon, authenticated, service_role;
