# MunchReach — Pre-Migration Backend Audit (READ-ONLY)

Generated: 2026-08-22 (UTC). **Nothing was changed.** No data modified, no keys rotated, no
connection altered. This document is the inventory + risk register for moving the backend to a
Supabase project you own.

Legend for risk classes:

- **SAFE** — reproduced exactly by SQL migrations / file copy.
- **RECONFIG** — must be re-entered or re-pointed by hand in the new project.
- **TEST** — copies over, but must be re-verified end-to-end after cutover.
- **NO-COPY** — cannot be copied at all; must be recreated/re-issued.

---

## 1. Database

| Component | Count / detail | Risk |
|---|---|---|
| Tables (public) | 123 base tables | SAFE (schema via migrations) |
| Views | none | — |
| Functions (public) | 75, nearly all `SECURITY DEFINER` with `SET search_path = public` | SAFE |
| Triggers (non-internal) | 300 (incl. `on_auth_user_created` on `auth.users`) | SAFE except auth trigger (see §2) |
| Indexes (public) | 192 | SAFE |
| Foreign keys | 233 | SAFE |
| Enums | 13 (below) | SAFE |
| RLS policies | 123 tables with RLS, 233 policies + 15 storage policies | TEST |
| Extensions | `plpgsql`, `uuid-ossp`, `pgcrypto`, `pg_stat_statements`, `pg_net`, `pg_cron`, `supabase_vault` | RECONFIG (enable before running migrations) |
| Migrations in repo | 139 files under `supabase/migrations/` | SAFE |
| Cron jobs | 11 `pg_cron` jobs | RECONFIG |

**Enums:** `app_role`, `billing_environment`, `billing_interval`, `billing_provider`,
`billing_sub_status`, `blog_content_type`, `blog_post_status`, `campaign_status`,
`connection_status`, `message_status`, `recipient_status`, `sending_provider`, `workspace_role`.

**Tables intentionally with NO policies (service-role only — must stay that way):**
`sending_account_secrets`, `email_provider_secrets`, `integration_secrets`,
`billing_provider_secrets`, `workspace_ai_keys`, `inbound_routes`, `inbound_tests`.
If RLS/GRANTs are re-applied loosely in the new project, these become credential leaks.

**Data volumes (small — a straight dump/restore is feasible):** workspaces 20, auth users 33,
leads 33, campaign_messages 27, conversations 10, blog_posts 16.

### Cron jobs (all active)

| Job | Schedule | Calls |
|---|---|---|
| sendloop-campaign-runner | */5 * * * * | `run_campaign_scheduler()` |
| sendloop-inbound-retry | */10 * * * * | `run_inbound_retry()` |
| sendloop-warmup-runner | */5 * * * * | `run_warmup_runner()` |
| sendloop-automation-runner | * * * * * | `run_automation_runner()` |
| munchreach-transactional-email-runner | * * * * * | `run_transactional_email_runner()` |
| munchreach-ai-personalization-runner | * * * * * | `run_ai_personalization_runner()` |
| munchreach-domain-recheck-runner | */5 * * * * | `run_domain_recheck_runner()` |
| munchreach-provider-health-runner | */10 * * * * | `run_provider_health_runner()` |
| munchreach-delivery-reconcile | */5 * * * * | `run_delivery_reconcile_runner()` |
| lead-retention-cleanup-daily | 15 3 * * * | `run_lead_retention_cleanup(500, 40)` |
| publish-due-blog-posts | */5 * * * * | `publish_due_blog_posts()` |

Each `run_*_runner()` reads a row from `platform_settings` and fires `net.http_post` at the app.
**These URLs are environment-specific (see §9) — they are the #1 thing that silently breaks.**

**Database roles:** standard Supabase roles only (`anon`, `authenticated`, `service_role`,
`postgres`). No custom roles. GRANTs are inside the migrations — RECONFIG only if you restore
schema by hand instead of running migrations.

---

## 2. Auth

| Item | Current state | Risk |
|---|---|---|
| Users | 33 (32 email-confirmed) | NO-COPY of passwords unless you migrate `auth.users` with hashes; otherwise every user must reset |
| Identities | 33 email, 1 google | RECONFIG |
| Providers | Email/password + Google OAuth | RECONFIG |
| Google OAuth | Currently uses the Lovable-managed broker (`lovable.auth.signInWithOAuth`) | NO-COPY — you must register your own Google OAuth client ID/secret in the new project |
| Redirect / site URLs | Point at the Lovable preview/published domains | RECONFIG |
| Email auth config | `auto_confirm_email` enabled; registration gated by `platform_settings.system.general.registration_enabled`; provider toggle in `platform_settings.auth_providers` | RECONFIG (Supabase-side) + SAFE (row data) |
| JWT | Project-specific signing key | NO-COPY — new project = new JWT secret = **all existing sessions invalidated (global logout)** |
| Auth trigger | `on_auth_user_created` → `public.handle_new_user()` creates `profiles` | SAFE, but must be re-created after users are imported |
| Admin/roles | `user_roles` + `has_role()`; admin account `anskhalid492@gmail.com` | TEST — verify admin role rows survive the user-id mapping |

**Critical:** every `public` table keys off `auth.users.id`. If users are re-created with **new
UUIDs**, `profiles`, `workspaces.owner_id`, `workspace_members`, `user_roles`, `leads.owner`,
referral profiles, billing subscriptions etc. all orphan. Users must be migrated **preserving
their UUIDs** (Supabase-to-Supabase `auth.users` copy), not re-invited.

---

## 3. Storage

| Bucket | Public | Objects |
|---|---|---|
| workspace-logos | private | 0 |
| avatars | private | 1 (595 kB) |
| support-attachments | private | 1 (81 kB) |
| review-media | private | 0 |
| blog-media | private | 0 |

- All buckets are **private**; the app serves them through signed URLs and the
  `/api/public/media.$` route. → TEST after migration.
- 15 storage RLS policies → SAFE via migration, TEST after.
- Object bytes → RECONFIG (must be copied bucket-by-bucket; a SQL dump does NOT move files).
- Total payload is tiny (<1 MB), so file loss risk is low but non-zero.

---

## 4. Realtime

Publication `supabase_realtime` includes **30 tables**:
`sending_accounts, leads, campaign_recipients, notifications, lead_notes, lead_tasks,
lead_activities, campaign_messages, campaign_replies, conversations, conversation_messages,
conversation_notes, conversation_events, warmup_settings, warmup_jobs, warmup_daily_stats,
warmup_health, crm_stages, email_engagement_events, support_ticket_messages, automations,
automation_runs, automation_run_steps, referral_profiles, referral_clicks, referral_attributions,
referral_payouts, referral_commissions, referral_fraud_flags, referral_webhook_events`.

Risk: **RECONFIG** — publication membership and `REPLICA IDENTITY FULL` are easy to miss in a
restore. If missed, the Unified Inbox, warmup health, live campaign stats and admin dashboards
silently stop updating (no error shown). Channels/subscriptions themselves are client-side
(`useWarmupRealtime`, inbox and dashboard hooks) and need no migration.

---

## 5. Edge / backend

- **Supabase Edge Functions: none.** All backend logic runs in the app (TanStack Start).
- **Server functions:** 56 modules using `createServerFn` (`src/lib/*.functions.ts` +
  `*.server.ts` helpers). SAFE — they follow whatever env vars are configured.
- **HTTP endpoints (`src/routes/api/public/*`)** — 16 routes:
  - Cron: `run-campaigns`, `run-warmup`, `run-automations`, `run-ai-personalization`,
    `run-transactional-email`, `recheck-domains`, `provider-health`, `reconcile-delivery`,
    `retry-inbound`
  - Webhooks: `inbound/email`, `billing/stripe`, `billing/paddle`, `billing/lemonsqueezy`,
    `integrations/$slug`, `automations/$token`, `referral/billing`
  - Media: `media.$`
  All are RECONFIG: external callers and the DB runner rows must be re-pointed at the new host.
- **Background workers:** DB-side claim functions (`claim_warmup_jobs`, `claim_automation_runs`,
  `claim_ai_personalization_jobs`) + `*_runner_state` tables. SAFE.

---

## 6. Secrets / environment (names only — no values shown)

| Variable | Used by | Req. | Env |
|---|---|---|---|
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | `src/integrations/supabase/config.ts` (browser + server) | Required | both |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | same | Required | both |
| `VITE_SUPABASE_PROJECT_ID` / `SUPABASE_PROJECT_ID` | same | Optional | both |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SB_SERVICE_ROLE_KEY`) | `client.server.ts`, all admin/server logic | Required | prod |
| `PROVIDER_CREDENTIALS_KEY` | `provider-credentials.server.ts` — encrypts `email_provider_secrets`, `sending_account_secrets`, `billing_provider_secrets`, `integration_secrets`, `workspace_ai_keys` | **Required** | prod |
| `RESEND_API_KEY` | provider pool / transactional | Required (currently the live provider) | prod |
| `SENDGRID_API_KEY`, `MAILGUN_API_KEY`, `BREVO_API_KEY`, `POSTMARK_API_KEY`, `ZEPTOMAIL_API_KEY`, `EMAILIT_API_KEY`, `AWS_REGION` (SES) | provider adapters | Optional (unset today) | prod |
| `RESEND_WEBHOOK_SECRET`, `SVIX_SIGNING_SECRET`, `INBOUND_EMAIL_SECRET`, `INBOUND_WEBHOOK_SIGNING_SECRET` | `webhook-verify.server.ts`, `inbound/email` | Required for inbound/delivery events | prod |
| `CAMPAIGN_CRON_SECRET`, `WARMUP_CRON_SECRET`, `DOMAIN_CRON_SECRET`, `PROVIDER_HEALTH_CRON_SECRET`, `TRANSACTIONAL_CRON_SECRET` | cron routes | Optional (runner token in `platform_settings` is the active mechanism) | prod |
| `REFERRAL_BILLING_SECRET`, `REFERRAL_HASH_SALT` | referral webhook + click hashing | Optional/Required if referrals are live | prod |
| `SENDING_DNS_HOST`, `SENDING_SPF_INCLUDE`, `SENDING_DKIM_HOST`, `SENDING_MX_HOST`, `SENDING_DMARC_RUA`, `SENDING_TRACKING_HOST` | DNS instruction generator + verification | Optional (defaults in code) | prod |
| `APP_URL` / `PUBLIC_APP_URL` / `VITE_APP_URL` | links in emails, tracking, invite URLs | Required | both |
| `LOVABLE_API_KEY` | AI Gateway (AI personalization fallback) | Required if platform AI is used | prod |

Sandbox check shows currently set: Supabase vars, `RESEND_API_KEY`, `PROVIDER_CREDENTIALS_KEY`,
`INBOUND_EMAIL_SECRET`, `RESEND_WEBHOOK_SECRET`, `LOVABLE_API_KEY`.

> **`PROVIDER_CREDENTIALS_KEY` is the single most dangerous secret in this migration.** Every
> stored provider/mailbox/billing/AI credential is encrypted with it. Move the *same* value, or
> every customer mailbox and provider key must be re-entered by hand.

---

## 7. Integrations

| Integration | State | Risk |
|---|---|---|
| Resend | Active sending provider (1 row in `email_provider_secrets`) | TEST |
| Amazon SES / Mailgun / Brevo / SendGrid / Postmark / ZeptoMail / Emailit | Adapters implemented, credentials not configured | SAFE |
| OpenAI (customer BYOK) | `workspace_ai_keys` (0 rows today), encrypted | SAFE |
| Lovable AI Gateway | Platform AI personalization fallback | RECONFIG (`LOVABLE_API_KEY`) |
| Google OAuth | 1 identity, Lovable-managed broker | NO-COPY |
| Stripe / Paddle / Lemon Squeezy | 6 rows in `billing_providers` (live+test), **all disabled**, 0 stored secrets, 0 transactions | SAFE |
| Catalog integrations (Slack, Zapier, Make, Calendly, Google Sheets, HubSpot, GoHighLevel) | Definitions only, no live connections | SAFE |

---

## 8. Domain / email infrastructure

- **Sending domains:** 1 — `verifiedusaleads.com`, stage `ready`, DKIM verified. Domain and DNS
  live at the registrar, not in Supabase → SAFE, but the *verification records* are provider-
  scoped and must be re-verified (TEST).
- **Sending accounts:** 2 mailboxes, credentials encrypted with `PROVIDER_CREDENTIALS_KEY`.
- **DNS verification:** `src/lib/dns.server.ts` (multi-resolver, sticky verification) +
  `domain-verification.server.ts`. SAFE.
- **Provider routing / failover:** `provider-pool.server.ts`, `provider-health.server.ts`,
  `email_providers` health counters. TEST.
- **Inbound replies:** `POST /api/public/inbound/email`, signature-verified, with fallback
  threading and the Unmatched inbox. RECONFIG — the provider's inbound webhook URL must be
  re-pointed at the new host.
- **Delivery/engagement webhooks:** Resend/Svix → delivery-state reconciliation. RECONFIG.
- **Open/click tracking:** tracking host + pixel/redirect endpoints, gated by the open-tracking
  toggle. RECONFIG (host).
- **Warmup:** global `warmup_recipients` pool, `warmup_jobs/daily_stats/health/events`, cron
  runner. SAFE (data) + RECONFIG (runner URL) + TEST (first live send).

---

## 9. Where the app references backend endpoints

| Reference | Location | Notes |
|---|---|---|
| Supabase URL / project id / anon key | `src/integrations/supabase/config.ts` only | Fully env-driven — **no hard-coded project anywhere**. Good news for migration. |
| Service role key | `client.server.ts` via `getServiceRoleKey()` (`SUPABASE_SERVICE_ROLE_KEY` or `SB_SERVICE_ROLE_KEY`) | Server-only |
| Auth URL | Derived from Supabase URL | — |
| Storage URL | Derived; files served via signed URLs + `/api/public/media.$` | — |
| DB connection | Managed `PG*` env only (tooling), app never uses a raw connection string | — |
| **Cron runner URLs (in the database)** | `platform_settings` rows: `campaign_runner`, `warmup_runner`, `automation_runner`, `ai_personalization_runner`, `transactional_runner`, `domain_runner`, `provider_health_runner`, `delivery_reconcile_runner`, `inbound_retry_runner` | Currently point at `*.lovable.app` preview/dev hosts. **Must be updated to the production host or every background job stops.** |
| Webhook URLs | Configured provider-side (Resend inbound + events, billing providers, integrations) | Must be re-pointed |

---

## 10. Risk register — what breaks if a step is missed

| Failure | Cause | Prevention |
|---|---|---|
| **All users logged out** | New project = new JWT secret | Expected & unavoidable. Announce it; sessions re-establish on next sign-in |
| **Users can't sign in at all** | `auth.users` not migrated, or migrated with new UUIDs | Migrate auth users preserving UUIDs; verify `profiles`/`workspace_members` join |
| **Google login broken** | Broker-managed OAuth client not present in your project | Register your own Google client, set redirect URLs, enable provider |
| **Lost files** | SQL dump does not move storage objects | Copy the 2 objects across all 5 buckets, verify signed URLs |
| **Broken RLS** | Policies restored without GRANTs, or secret tables get policies/GRANTs | Re-run migrations verbatim; confirm the 7 secret tables stay service-role-only |
| **Broken Realtime** | Publication membership not restored | Re-add all 30 tables to `supabase_realtime`; verify inbox + warmup live updates |
| **Broken webhooks** | Provider webhook URLs still point at old host; signing secrets missing | Re-point Resend/billing/integration webhooks, copy signing secrets |
| **Broken email sending** | `PROVIDER_CREDENTIALS_KEY` changed → stored provider/mailbox keys undecryptable | Carry the same key value; otherwise re-enter credentials |
| **Broken warmup** | `warmup_runner` URL row still points at old host | Update `platform_settings`; run one live warmup send |
| **Broken billing** | Provider secrets/webhooks absent | Providers are disabled today, so low risk — reconfigure before enabling |
| **Broken background jobs** | `pg_cron`/`pg_net` extensions not enabled, or runner URLs stale | Enable extensions first, recreate all 11 jobs, update the 9 runner rows |
| **Broken admin functions** | `user_roles` rows lost or `has_role()` grants missing | Verify admin role row after user import before cutover |

---

## 11. Migration checklist (execute in order)

**Phase A — prepare the new project**
1. Create the Supabase project; record URL, project ref, publishable key, service role key.
2. Enable extensions: `uuid-ossp`, `pgcrypto`, `pg_net`, `pg_cron`, `pg_stat_statements`, vault.
3. Run all 139 migrations from `supabase/migrations/` **in order, unmodified**.
4. Verify object counts match: 123 tables, 75 functions, 233 policies, 233 FKs, 192 indexes, 13 enums.

**Phase B — auth**
5. Migrate `auth.users` + `auth.identities` **preserving UUIDs and password hashes**.
6. Re-create the `on_auth_user_created` trigger; confirm 33 `profiles` rows.
7. Register your own Google OAuth client; set Site URL + redirect URLs; enable Email + Google.
8. Match auth settings: auto-confirm email, disable anonymous sign-ups.
9. Verify the admin role row exists in `user_roles` for the admin account.

**Phase C — data**
10. Freeze writes (maintenance mode) → dump `public` data → restore into the new project.
11. Re-check FK integrity and row counts on the high-value tables.

**Phase D — storage**
12. Create the 5 buckets (all private, same names); confirm 15 storage policies.
13. Copy all objects; verify signed-URL download through `/api/public/media.$`.

**Phase E — realtime**
14. Add all 30 tables to `supabase_realtime`; set `REPLICA IDENTITY` as required.

**Phase F — environment**
15. Set Supabase URL/keys for the new project (browser + server names).
16. Carry `PROVIDER_CREDENTIALS_KEY` **unchanged**.
17. Set email provider keys, webhook signing secrets, app URLs, `LOVABLE_API_KEY`.

**Phase G — jobs & webhooks**
18. Recreate the 11 `pg_cron` jobs.
19. Update the 9 `platform_settings` runner rows to the new production host + tokens.
20. Re-point provider webhooks: Resend inbound, Resend/Svix delivery events, billing, integrations.
21. Re-point tracking host (open/click) and DNS instruction hosts if they change.

**Phase H — verification (do not declare done before all pass)**
22. Sign up + sign in (email) and Google sign-in.
23. Admin console loads; roles enforced; cross-workspace isolation still zero-leak.
24. Send one real campaign email → delivered event lands → analytics updates.
25. Reply to it → appears in the Unified Inbox in real time.
26. One live warmup send from the global pool → warmup dashboard + health update.
27. Domain re-verification passes; DNS statuses stable (no flapping).
28. Upload a logo/avatar/attachment → renders via signed URL.
29. Confirm each of the 11 cron jobs executed at least once (`*_runner_state` / job logs).
30. Confirm billing pages render and revenue metrics compute.

**Phase I — cutover**
31. Keep the current project running read-only for a rollback window (do not delete).
32. Switch DNS/host, lift maintenance mode, monitor errors and provider health for 24h.

---

### Bottom line

The application layer is clean for migration: **no hard-coded Supabase project anywhere**, no
Supabase Edge Functions, all backend logic in server functions and API routes. The real risk is
concentrated in five places: auth user UUIDs + JWT, `PROVIDER_CREDENTIALS_KEY`, storage object
bytes, the realtime publication, and the nine cron runner URLs stored **inside the database**.
