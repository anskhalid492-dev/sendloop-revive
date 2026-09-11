# MunchReach — Phase 4A: production data migration (EXECUTED)

Source (production, unchanged): `<OLD_PROJECT_ID>`
Target (loaded): `rihgzkofoxcjljlbvbya`

Method: `pg_dump --data-only` (COPY format, explicit column lists, original UUIDs)
loaded inside sessions running `set session_replication_role = replica`, which
suppresses every user trigger (including the 13 side-effect triggers and
`on_auth_user_created`) for the duration of the load only. No trigger was
dropped or permanently disabled — `pg_trigger` shows 0 disabled triggers after
the load.

Load order: `auth.users` -> `auth.identities` -> all 123 public tables.
`auth.sessions`, `auth.refresh_tokens`, `auth.mfa_*`, `auth.flow_state` were NOT
copied, by design.

---

## Headline results

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| Public tables | 123 | 123 | PASS |
| Total public rows | 4,969 (live count at snapshot) | 4,969 | PASS |
| Primary-key/UUID sets (all 123 tables) | identical | identical (md5 per table) | PASS |
| Foreign keys | 192 | 192 | PASS |
| Orphaned foreign-key rows | 0 | 0 | PASS |
| Duplicate UUIDs | 0 | 0 (PK constraints intact) | PASS |
| Indexes | 300 | 300 | PASS |
| RLS-enabled tables | 123 | 123 | PASS |
| RLS policies | 233 | 233 | PASS |
| Functions (public) | 69 | 69 (identity md5 identical) | PASS |
| Triggers — user-defined | 68 | 68 (definition md5 identical) | PASS |
| Triggers — total | 822 | 822 | PASS |
| Triggers currently disabled | 0 | 0 | PASS |
| Realtime published tables | 30 | 30 | PASS |
| Auth users | 33 | 33 | PASS |
| Auth identities | 34 | 34 | PASS |
| Auth UUIDs match one-for-one | yes | yes (sorted list diff empty) | PASS |
| Password hashes + confirm state + app metadata | identical | identical (md5 match) | PASS |
| Encrypted credential ciphertext | byte-identical | identical (md5 match) | PASS |
| Storage buckets | 5, all private | 5, all private | PASS |
| Storage policies on `storage.objects` | 15 | 15 (text-identical) | PASS |
| Storage objects (bytes) | 2 | 0 | **BLOCKED — see below** |

Note on 4,969 vs the 4,961 in the Phase 4 plan: production is still live, so
eight rows (runner/health/event rows) were written between the Phase 4 audit and
this snapshot. Production and target were compared against each other at load
time, not against the older figure, and they agree exactly.

## Auth detail

- 33 users copied with `id`, `email`, `encrypted_password`, `email_confirmed_at`,
  `confirmation_token`, `recovery_token`, `raw_user_meta_data`,
  `raw_app_meta_data`, `created_at` preserved verbatim.
- 34 identities copied with `id`, `user_id`, `provider`, `provider_id`,
  `identity_data` preserved (33 email + 1 google).
- No replacement users were created; no UUID was regenerated.
- `on_auth_user_created` was suppressed during the load, so no partial
  `profiles` rows were produced; `profiles` (45) came across as real data.

## Credentials

`PROVIDER_CREDENTIALS_KEY` is present in this environment and was NOT used —
ciphertext was copied byte-for-byte, never decrypted or re-encrypted. The same
key value must be set in the new deployment's environment before the first send.

## Storage — open item

The 5 buckets (`avatars`, `workspace-logos`, `blog-media`, `review-media`,
`support-attachments`) were recreated with `public = false` and their original
ids, names and timestamps, and all 15 `storage.objects` policies were recreated
with identical expressions.

The 2 object **files** were not transferred: their bytes live in the storage
service, not in Postgres, and uploading them requires the new project's service
role key, which is not available in this environment. The corresponding
`storage.objects` metadata rows were deliberately NOT inserted, so no row points
at a missing file. Objects pending:

- `support-attachments/56355c2f-.../2ae588fc-...-Screenshot_2026-08-20_at_5.29.35_AM.png` (~81 KB)
- `avatars/56355c2f-.../avatar-1787259654723.jpg` (~596 KB)

Provide the new project's service role key and both objects will be uploaded to
identical paths and their metadata rows inserted.

## Not done, by instruction

- 11 `pg_cron` jobs: NOT created.
- Webhooks / runner URLs: NOT re-pointed.
- Application environment variables: unchanged; the live app still runs against
  `<OLD_PROJECT_ID>`.

---

## Per-table comparison

| Table | Production | New | Diff |
| --- | ---: | ---: | ---: |
| `admin_audit_log` | 10 | 10 | 0 |
| `admin_notifications` | 22 | 22 | 0 |
| `ai_personalizations` | 0 | 0 | 0 |
| `ai_runner_state` | 1 | 1 | 0 |
| `automation_events` | 11 | 11 | 0 |
| `automation_run_steps` | 5 | 5 | 0 |
| `automation_runs` | 5 | 5 | 0 |
| `automation_steps` | 6 | 6 | 0 |
| `automations` | 3 | 3 | 0 |
| `billing_audit_log` | 8 | 8 | 0 |
| `billing_customers` | 0 | 0 | 0 |
| `billing_invoices` | 0 | 0 | 0 |
| `billing_plan_prices` | 0 | 0 | 0 |
| `billing_provider_secrets` | 0 | 0 | 0 |
| `billing_providers` | 6 | 6 | 0 |
| `billing_subscriptions` | 1 | 1 | 0 |
| `billing_transactions` | 0 | 0 | 0 |
| `billing_webhook_events` | 6 | 6 | 0 |
| `blog_authors` | 2 | 2 | 0 |
| `blog_categories` | 11 | 11 | 0 |
| `blog_media` | 0 | 0 | 0 |
| `blog_post_slugs` | 0 | 0 | 0 |
| `blog_posts` | 16 | 16 | 0 |
| `campaign_launch_events` | 1 | 1 | 0 |
| `campaign_messages` | 27 | 27 | 0 |
| `campaign_recipients` | 49 | 49 | 0 |
| `campaign_replies` | 0 | 0 | 0 |
| `campaign_step_variants` | 1 | 1 | 0 |
| `campaign_steps` | 5 | 5 | 0 |
| `campaign_test_sends` | 2 | 2 | 0 |
| `campaigns` | 12 | 12 | 0 |
| `conversation_events` | 20 | 20 | 0 |
| `conversation_messages` | 14 | 14 | 0 |
| `conversation_notes` | 1 | 1 | 0 |
| `conversations` | 10 | 10 | 0 |
| `credit_ledger` | 1 | 1 | 0 |
| `crm_stages` | 120 | 120 | 0 |
| `domain_alerts` | 2 | 2 | 0 |
| `email_drafts` | 0 | 0 | 0 |
| `email_engagement_events` | 4 | 4 | 0 |
| `email_events` | 11 | 11 | 0 |
| `email_provider_secrets` | 1 | 1 | 0 |
| `email_providers` | 1 | 1 | 0 |
| `email_suppressions` | 1 | 1 | 0 |
| `email_templates` | 5 | 5 | 0 |
| `guide_articles` | 0 | 0 | 0 |
| `inbound_event_actions` | 1 | 1 | 0 |
| `inbound_routes` | 31 | 31 | 0 |
| `inbound_tests` | 1 | 1 | 0 |
| `integration_connections` | 0 | 0 | 0 |
| `integration_events` | 0 | 0 | 0 |
| `integration_secrets` | 0 | 0 | 0 |
| `integration_sync_logs` | 0 | 0 | 0 |
| `integrations` | 8 | 8 | 0 |
| `lead_activities` | 13 | 13 | 0 |
| `lead_lists` | 10 | 10 | 0 |
| `lead_notes` | 0 | 0 | 0 |
| `lead_retention_runs` | 1 | 1 | 0 |
| `lead_tasks` | 0 | 0 | 0 |
| `leads` | 33 | 33 | 0 |
| `newsletter_subscribers` | 0 | 0 | 0 |
| `notification_preferences` | 0 | 0 | 0 |
| `notifications` | 7 | 7 | 0 |
| `outbound_messages` | 11 | 11 | 0 |
| `plan_features` | 100 | 100 | 0 |
| `plan_grants` | 1 | 1 | 0 |
| `plans` | 4 | 4 | 0 |
| `platform_announcement_dismissals` | 0 | 0 | 0 |
| `platform_announcements` | 1 | 1 | 0 |
| `platform_feature_flags` | 0 | 0 | 0 |
| `platform_settings` | 19 | 19 | 0 |
| `privacy_requests` | 0 | 0 | 0 |
| `profiles` | 45 | 45 | 0 |
| `provider_health_events` | 152 | 152 | 0 |
| `provider_routing_events` | 148 | 148 | 0 |
| `referral_attributions` | 0 | 0 | 0 |
| `referral_audit_logs` | 2 | 2 | 0 |
| `referral_billing_events` | 0 | 0 | 0 |
| `referral_clicks` | 0 | 0 | 0 |
| `referral_commissions` | 0 | 0 | 0 |
| `referral_fraud_flags` | 0 | 0 | 0 |
| `referral_payouts` | 0 | 0 | 0 |
| `referral_profiles` | 1 | 1 | 0 |
| `referral_programs` | 1 | 1 | 0 |
| `referral_webhook_events` | 1 | 1 | 0 |
| `sending_account_audit` | 0 | 0 | 0 |
| `sending_account_checks` | 17 | 17 | 0 |
| `sending_account_secrets` | 1 | 1 | 0 |
| `sending_accounts` | 2 | 2 | 0 |
| `sending_domains` | 1 | 1 | 0 |
| `service_alerts` | 0 | 0 | 0 |
| `site_faqs` | 48 | 48 | 0 |
| `site_nav_items` | 73 | 73 | 0 |
| `site_pages` | 33 | 33 | 0 |
| `site_redirects` | 7 | 7 | 0 |
| `site_settings` | 3 | 3 | 0 |
| `subprocessors` | 0 | 0 | 0 |
| `support_ticket_messages` | 1 | 1 | 0 |
| `support_tickets` | 1 | 1 | 0 |
| `template_uses` | 2 | 2 | 0 |
| `testimonials` | 10 | 10 | 0 |
| `transactional_emails` | 7 | 7 | 0 |
| `transactional_template_versions` | 0 | 0 | 0 |
| `transactional_templates` | 61 | 61 | 0 |
| `unmatched_inbound_emails` | 1 | 1 | 0 |
| `usage_audit_log` | 18 | 18 | 0 |
| `user_roles` | 2 | 2 | 0 |
| `warmup_conversations` | 9 | 9 | 0 |
| `warmup_daily_stats` | 2 | 2 | 0 |
| `warmup_events` | 25 | 25 | 0 |
| `warmup_health` | 81 | 81 | 0 |
| `warmup_jobs` | 12 | 12 | 0 |
| `warmup_recipients` | 3488 | 3488 | 0 |
| `warmup_runner_state` | 1 | 1 | 0 |
| `warmup_settings` | 2 | 2 | 0 |
| `workspace_activity` | 20 | 20 | 0 |
| `workspace_ai_keys` | 0 | 0 | 0 |
| `workspace_credits` | 1 | 1 | 0 |
| `workspace_invitations` | 2 | 2 | 0 |
| `workspace_members` | 20 | 20 | 0 |
| `workspace_subscriptions` | 0 | 0 | 0 |
| `workspace_usage_counters` | 6 | 6 | 0 |
| `workspaces` | 20 | 20 | 0 |
| **TOTAL (123 tables)** | **4969** | **4969** | **0** |

---

PHASE 4A — DATA MIGRATED AND VERIFIED; PRODUCTION UNCHANGED; APPLICATION NOT SWITCHED.
Storage object bytes remain outstanding pending the new project's service role key.
