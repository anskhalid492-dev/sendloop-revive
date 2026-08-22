# MunchReach — Phase 4: Data migration plan (PREPARATION ONLY)

Source (production, unchanged): `ciaxsdojimcupxzpbpev`
Target (schema applied, verified in Phase 3, zero drift): `rihgzkofoxcjljlbvbya`

**No data was copied. No production row, secret, env var, cron job or webhook was
changed while producing this document. All queries were read-only `SELECT`s.**

---

## 0. Headline facts

| Item | Value |
| --- | --- |
| Public tables | 123 (89 with data, 34 empty) |
| Total public rows | 4,961 |
| Foreign keys | 192 (all intra-`public` except 7 pointing at `auth.users`) |
| Self-referencing FKs | `site_nav_items`, `referral_commissions` |
| Sequences / serial / identity columns | **0** — every PK is a `uuid` or natural key |
| Auth users | 33 (32 confirmed, 33 with password hashes) |
| Auth identities | 34 (33 email + 1 google) |
| Auth sessions / refresh tokens | 30 / 39 — intentionally **not** migrated |
| Storage buckets | 5, all private |
| Storage objects | 2 (`avatars` ×1 ≈ 596 KB, `support-attachments` ×1 ≈ 81 KB) |
| Realtime-published tables | 30 |
| `pg_cron` jobs | 11 |

**Because there are zero sequences, no sequence resetting is required anywhere in
this migration.** Every id is generated client-side or by `gen_random_uuid()`.

**Every UUID in every table must be preserved verbatim.** 192 foreign keys and all
auth linkage depend on it; a single regenerated id silently orphans data.

---

## 1. Auth (`auth.users`, `auth.identities`) — step 1, before all else

- Copy `auth.users` (33 rows) with **`id`, `encrypted_password`, `email`,
  `email_confirmed_at`, `raw_user_meta_data`, `raw_app_meta_data`, `created_at`,
  `confirmation_token`, `recovery_token` preserved exactly**. Preserved hashes mean
  every customer keeps their existing password; no reset emails are needed.
- Copy `auth.identities` (34 rows) with `id`, `user_id`, `provider`, `provider_id`,
  `identity_data` preserved. The single `google` identity keeps working only if the
  same Google OAuth client id/secret is configured in the new project.
- **Do NOT copy** `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_*`,
  `auth.flow_state`. Users will simply sign in again; stale tokens signed by the old
  project's JWT secret are invalid in the new project anyway.
- **Special handling:** the new project has the `on_auth_user_created` trigger
  (`handle_new_user`) on `auth.users`. It must be `ALTER TABLE auth.users DISABLE
  TRIGGER on_auth_user_created` for the load, otherwise it inserts partial
  `profiles` rows that then collide with the real `profiles` copy. Re-enable after.
- Verification gate: `count(*)` matches 33/34, and
  `select count(*) from auth.users u join public.profiles p on p.id=u.id` matches
  the source before anything else is loaded.

## 2. UUID preservation rules

- Load with explicit column lists including the PK — never rely on defaults.
- Use `COPY … FROM STDIN` (or `pg_dump --data-only --column-inserts`) rather than
  application-level inserts, which regenerate ids.
- Load with `session_replication_role = replica` so FK checks and user triggers do
  not fire mid-load, then set it back and run a full FK re-validation pass.
- Never `TRUNCATE … RESTART IDENTITY` (nothing to restart) and never
  `ON CONFLICT DO NOTHING` — a conflict means the load is wrong, it must fail loudly.

## 3. Triggers to disable during the load

These 12 non-timestamp triggers have side effects that would corrupt a bulk load
(duplicate activity rows, notifications to customers, immutability blocks):

`workspaces_seed_crm_stages`, `workspaces_ensure_owner_member`,
`workspace_members_activity`, `workspace_invitations_activity`,
`sending_accounts_managed_provider`, `support_messages_notify`,
`support_tickets_status_notify`, `testimonials_validate`,
`credit_ledger_no_update`, `conversation_messages_direction`,
`leads_set_retention`, `blog_posts_slug_history`, plus `on_auth_user_created`.

`set_updated_at` / `update_updated_at_column` triggers must also be suppressed so
original `updated_at` values survive. `session_replication_role = replica` covers
all of them in one switch.

## 4. Encrypted columns — hard dependency

`email_provider_secrets` (1), `sending_account_secrets` (1), `integration_secrets`
(0), `billing_provider_secrets` (0), `workspace_ai_keys` (0) hold ciphertext
encrypted with **`PROVIDER_CREDENTIALS_KEY`**. The ciphertext copies verbatim, but
it is unreadable unless the *same* `PROVIDER_CREDENTIALS_KEY` value is set in the
new project. If that key is rotated or lost, sending stops and the rows must be
re-entered by hand. This is the single highest-risk item of Phase 5.

## 5. Storage, realtime, cron, webhooks, secrets

- **Storage (19):** 5 buckets already exist? No — buckets are *not* created by the
  schema bundle. Create `avatars`, `workspace-logos`, `blog-media`, `review-media`,
  `support-attachments`, all **private**, then copy the 2 objects (download via
  signed URL from source, upload to target with the identical object path), then
  copy the matching `storage.objects` metadata rows. Bucket policies must be
  re-applied; `/api/public/media.$.ts` serves everything through signed URLs, so a
  bucket accidentally created public is a security regression.
- **Realtime (20):** publication membership is schema-level and was already
  reproduced in Phase 3 (30 tables). No data. Re-verify after the load and confirm
  Realtime is enabled in the new project's settings; replica identity must remain
  as-is for `conversations`, `conversation_messages`, `sending_accounts`,
  `warmup_*` — those drive live dashboards.
- **pg_cron (21):** 11 jobs must be re-created *after* the data load, never before —
  a runner firing against half-loaded data would send real email. Recreate:
  `munchreach-ai-personalization-runner` `* * * * *`,
  `munchreach-transactional-email-runner` `* * * * *`,
  `sendloop-automation-runner` `* * * * *`,
  `munchreach-delivery-reconcile` `*/5 * * * *`,
  `munchreach-domain-recheck-runner` `*/5 * * * *`,
  `sendloop-campaign-runner` `*/5 * * * *`,
  `sendloop-warmup-runner` `*/5 * * * *`,
  `publish-due-blog-posts` `*/5 * * * *`,
  `munchreach-provider-health-runner` `*/10 * * * *`,
  `sendloop-inbound-retry` `*/10 * * * *`,
  `lead-retention-cleanup-daily` `15 3 * * *`.
  Requires `pg_cron` + `pg_net` enabled first.
- **Webhooks (22):** the 9 runner rows in `platform_settings` carry the target URL
  and shared token; they copy as data but **must be rewritten** to the new
  deployment host during cutover. External endpoints to re-point afterwards:
  inbound email (Resend), delivery/event webhook, Stripe / Paddle / Lemon Squeezy
  billing webhooks, `/api/public/integrations/$slug`, `/api/public/automations/$token`.
- **Secrets/env (23):** `SUPABASE_URL`, `SUPABASE_PROJECT_ID`,
  `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (or `SB_SERVICE_ROLE_KEY`),
  and their `VITE_` twins, plus `PROVIDER_CREDENTIALS_KEY`, `RESEND_API_KEY`,
  `RESEND_WEBHOOK_SECRET` / `SVIX_SIGNING_SECRET`, `INBOUND_EMAIL_SECRET`,
  `INBOUND_WEBHOOK_SIGNING_SECRET`, `CAMPAIGN_CRON_SECRET`, `REFERRAL_HASH_SALT`,
  billing provider keys, `LOVABLE_API_KEY`. Nothing in this list may be regenerated
  except the Supabase keys themselves.

---

## 6. DATA MIGRATION MAP — exact order

Derived from a topological sort of all 192 foreign keys. Load each level fully and
verify counts before starting the next. Row counts are source-of-truth targets.

**LEVEL 0 — auth (before any public table)**
`auth.users` (33) → `auth.identities` (34)

**LEVEL 1 — no dependencies on other public tables (38 tables)**
`profiles` (45), `workspaces` (20), `plans` (4), `user_roles` (2),
`platform_settings` (19), `warmup_recipients` (3488), `transactional_templates` (61),
`site_nav_items` (73, self-FK → load parents first or defer),
`site_faqs` (48), `site_pages` (33), `site_redirects` (7), `site_settings` (3),
`admin_notifications` (22), `admin_audit_log` (10), `outbound_messages` (11),
`blog_categories` (11), `blog_authors` (2), `testimonials` (10), `integrations` (8),
`billing_providers` (6), `billing_webhook_events` (6), `email_providers` (1),
`referral_programs` (1), `referral_webhook_events` (1), `platform_announcements` (1),
`unmatched_inbound_emails` (1), `ai_runner_state` (1), `warmup_runner_state` (1),
`newsletter_subscribers`, `notification_preferences`, `privacy_requests`,
`service_alerts`, `subprocessors`, `guide_articles`, `blog_media`,
`platform_feature_flags`, `billing_provider_secrets`, `referral_billing_events` (all 0)

**LEVEL 2 — depend on level 1 (32 tables)**
`workspace_members` (20), `workspace_activity` (20), `workspace_invitations` (2),
`workspace_credits` (1), `workspace_usage_counters` (6), `credit_ledger` (1),
`crm_stages` (120), `plan_features` (100), `plan_grants` (1),
`billing_subscriptions` (1), `billing_audit_log` (8), `usage_audit_log` (18),
`provider_health_events` (151), `email_provider_secrets` (1), `email_templates` (5),
`email_suppressions` (1), `lead_lists` (10), `sending_domains` (1), `automations` (3),
`blog_posts` (16), `notifications` (7), `support_tickets` (1),
`transactional_emails` (7), `referral_profiles` (1), `lead_retention_runs` (1),
`billing_customers`, `billing_plan_prices`, `integration_connections`,
`platform_announcement_dismissals`, `transactional_template_versions`,
`workspace_ai_keys`, `workspace_subscriptions` (0)

**LEVEL 3 (18 tables)**
`leads` (33), `campaigns` (12), `sending_accounts` (2), `provider_routing_events` (147),
`automation_steps` (6), `domain_alerts` (2),
`support_ticket_messages` (1), `template_uses` (2), `referral_audit_logs` (2),
`billing_invoices`, `billing_transactions`, `blog_post_slugs`, `integration_events`,
`integration_secrets`, `integration_sync_logs`, `referral_attributions`,
`referral_clicks`, `referral_payouts` (0)

**LEVEL 4 (17 tables)**
`campaign_recipients` (49), `campaign_steps` (5), `campaign_launch_events` (1),
`conversations` (10), `lead_activities` (13), `warmup_health` (75),
`warmup_conversations` (9), `warmup_daily_stats` (2), `warmup_settings` (2),
`sending_account_checks` (17), `sending_account_secrets` (1),
`ai_personalizations`, `lead_notes`, `lead_tasks`, `sending_account_audit`,
`referral_commissions` (self-FK), `referral_fraud_flags` (0)

**LEVEL 5 (9 tables)**
`inbound_routes` (31), `conversation_events` (20), `warmup_jobs` (12),
`automation_events` (11), `campaign_step_variants` (1), `conversation_notes` (1),
`email_events` (11), `inbound_tests` (1), `email_drafts` (0)

**LEVEL 6 (5 tables)**
`campaign_messages` (27), `warmup_events` (25), `automation_runs` (5),
`campaign_test_sends` (2), `inbound_event_actions` (1)

**LEVEL 7 (4 tables)**
`conversation_messages` (14), `automation_run_steps` (5),
`email_engagement_events` (4), `campaign_replies` (0)

**LEVEL 8 — non-table assets**
storage buckets → storage objects → `storage.objects` metadata → realtime verify →
`pg_cron` jobs → `platform_settings` runner URLs rewritten → webhook endpoints
re-pointed → env/secrets set → application cutover.

---

## 7. Per-table facts that apply universally

- **Primary key:** `uuid` on 121 of 123 tables; the exceptions are composite/natural
  keys (`workspace_usage_counters` by workspace+resource+period,
  `platform_announcement_dismissals` by announcement+user). None auto-increment.
- **Sequences:** none. No adjustment needed on any table.
- **UUID preservation:** required on **every** table without exception.
- **Direct copy:** possible for all 123 tables — no type changes, no schema drift,
  no column renames (Phase 3 verified 4,878 identical object signatures).
- **Special handling** is limited to: the 5 ciphertext tables (§4), the 12 triggered
  tables (§3), `auth.*` (§1), `site_nav_items` / `referral_commissions` self-FKs
  (load in a single statement or defer constraints), and storage (§5).

---

## 8. Risk register for Phase 5

| Risk | Severity | Mitigation |
| --- | --- | --- |
| `PROVIDER_CREDENTIALS_KEY` not carried over | CRITICAL | Set the identical value in the new project *before* the first send |
| Auth UUID regenerated | CRITICAL | Copy `auth.users.id` explicitly; abort if any id differs |
| Cron enabled before data load completes | HIGH | Create jobs only at Level 8 |
| Runner URLs still pointing at the old host | HIGH | Rewrite the 9 `platform_settings` rows at cutover |
| Storage buckets recreated as public | HIGH | Create private, verify `public=false` on all 5 |
| Google OAuth client not reconfigured | MEDIUM | Same client id/secret, new redirect URLs |
| Users must sign in again | LOW / accepted | Sessions deliberately not migrated |

---

PHASE 4 PREPARATION ONLY — NO DATA COPIED. PRODUCTION UNCHANGED.
