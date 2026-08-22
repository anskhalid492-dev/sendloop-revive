# MunchReach — Supabase Migration, Phase 1 (Preparation, READ-ONLY)

Nothing in this phase changes production. No URLs, secrets, auth, RLS, schema, cron
jobs, webhooks or integrations were modified. The app remains connected to the
current Lovable-managed Supabase project.

---

## 1. Target project readiness

`src/integrations/supabase/config.ts` resolves everything from environment
variables and contains no hard-coded project id, URL or key:

| Value | Browser | Server |
| --- | --- | --- |
| URL | `VITE_SUPABASE_URL` | `SUPABASE_URL` |
| Project id | `VITE_SUPABASE_PROJECT_ID` | `SUPABASE_PROJECT_ID` |
| Publishable/anon key | `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) | `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`) |
| Service role key | never | `SUPABASE_SERVICE_ROLE_KEY` (fallback `SB_SERVICE_ROLE_KEY`) |

Consumers: `client.ts` (browser, RLS), `auth-middleware.ts` (`requireSupabaseAuth`,
acts as signed-in user), `client.server.ts` (`supabaseAdmin`, service role).

Cutover = swap env values only. **Keep this architecture; do not hard-code.**

---

## 2. Migration inventory (current production)

| Object | Count |
| --- | --- |
| Tables (public) | 123 |
| Database functions | 75 |
| Triggers | 300 |
| RLS policies | 233 |
| Foreign keys | 233 |
| Indexes | 192 |
| Enum types | 13 |
| SQL migration files (`supabase/migrations/`) | 139 |
| Active `pg_cron` jobs | 11 |
| Auth users | 33 (32 confirmed) |
| Auth identities | 33 email + 1 google |
| Storage buckets | 5 (all private) |
| Storage objects | 2 |
| Realtime-published tables | 30 |
| Server-function modules (`*.functions.ts`) | 56 |
| `/api/public/*` routes | 16 (9 cron, 6 webhook/callback, 1 media) |

Required extensions: `pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`, `vault`.

Nothing in this list is assumed unused — every item must be reproduced.

### pg_cron jobs (11)

| Job | Schedule |
| --- | --- |
| `munchreach-ai-personalization-runner` | `* * * * *` |
| `munchreach-transactional-email-runner` | `* * * * *` |
| `sendloop-automation-runner` | `* * * * *` |
| `munchreach-delivery-reconcile` | `*/5 * * * *` |
| `munchreach-domain-recheck-runner` | `*/5 * * * *` |
| `sendloop-campaign-runner` | `*/5 * * * *` |
| `sendloop-warmup-runner` | `*/5 * * * *` |
| `publish-due-blog-posts` | `*/5 * * * *` |
| `munchreach-provider-health-runner` | `*/10 * * * *` |
| `sendloop-inbound-retry` | `*/10 * * * *` |
| `lead-retention-cleanup-daily` | `15 3 * * *` |

(`publish-due-blog-posts` and `lead-retention-cleanup-daily` run in-database and
need no URL; the other 9 call HTTP runner endpoints via `pg_net`.)

---

## 3. Secrets checklist (names only — no values shown)

### CRITICAL — must be copied byte-for-byte, never rotated

- **`PROVIDER_CREDENTIALS_KEY`** — decrypts every stored mailbox / email-provider /
  billing-provider / AI (BYOK) credential in `sending_account_secrets`,
  `email_provider_secrets`, `billing_provider_secrets`, `workspace_ai_keys`,
  `integration_secrets`. Rotating, regenerating, replacing or deleting it makes all
  stored credentials permanently unreadable. **Copy it unchanged into the new project.**

### Supabase connection

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
(or `SB_SERVICE_ROLE_KEY`), `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` — all change at cutover.

### Email / infrastructure

`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SVIX_SIGNING_SECRET`,
`INBOUND_EMAIL_SECRET`, `INBOUND_WEBHOOK_SIGNING_SECRET`, `MAILGUN_API_KEY`,
`SENDGRID_API_KEY`, `BREVO_API_KEY`, `POSTMARK_API_KEY`, `ZEPTOMAIL_API_KEY`,
`EMAILIT_API_KEY`, `AWS_REGION`.

### Cron auth

`CAMPAIGN_CRON_SECRET`, `DOMAIN_CRON_SECRET`, `WARMUP_CRON_SECRET`,
`TRANSACTIONAL_CRON_SECRET`, `PROVIDER_HEALTH_CRON_SECRET` (each falls back to
`INBOUND_EMAIL_SECRET`).

### Referral / app

`REFERRAL_BILLING_SECRET`, `REFERRAL_HASH_SALT` (must be preserved — changing it
breaks existing referral click hashes), `APP_URL`, `PUBLIC_APP_URL`, `VITE_APP_URL`.

### Sending DNS defaults

`SENDING_DNS_HOST`, `SENDING_DKIM_HOST`, `SENDING_MX_HOST`, `SENDING_SPF_INCLUDE`,
`SENDING_DMARC_RUA`, `SENDING_TRACKING_HOST`.

---

## 4. Cron URL audit (9 URLs in `platform_settings`)

All rows also carry a shared token used as the `x-munchreach-signature` header.
Hosts today: `project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app` (dev
stable host) and `id-preview--1068fd05-79ee-44fc-9230-0fbdfc76d42c.lovable.app`
(preview host — should be normalised to the stable host at cutover).

| Setting key | Current host | Runner / job | Required new URL |
| --- | --- | --- | --- |
| `campaign_runner` | id-preview…lovable.app | `run_campaign_scheduler()` → `/api/public/cron/run-campaigns` | `https://<new-app-host>/api/public/cron/run-campaigns` |
| `inbound_retry_runner` | id-preview…lovable.app | `run_inbound_retry()` → `/api/public/cron/retry-inbound` | `https://<new-app-host>/api/public/cron/retry-inbound` |
| `warmup_runner` | project--…-dev.lovable.app | `run_warmup_runner()` → `/api/public/cron/run-warmup` | `https://<new-app-host>/api/public/cron/run-warmup` |
| `automation_runner` | project--…-dev.lovable.app | `run_automation_runner()` → `/api/public/cron/run-automations` | `https://<new-app-host>/api/public/cron/run-automations` |
| `ai_personalization_runner` | project--…-dev.lovable.app | `run_ai_personalization_runner()` → `/api/public/cron/run-ai-personalization` | `https://<new-app-host>/api/public/cron/run-ai-personalization` |
| `transactional_runner` | project--…-dev.lovable.app | `run_transactional_email_runner()` → `/api/public/cron/run-transactional-email` | `https://<new-app-host>/api/public/cron/run-transactional-email` |
| `delivery_reconcile_runner` | project--…-dev.lovable.app | `run_delivery_reconcile_runner()` → `/api/public/cron/reconcile-delivery` | `https://<new-app-host>/api/public/cron/reconcile-delivery` |
| `domain_runner` | project--…-dev.lovable.app | `run_domain_recheck_runner()` → `/api/public/cron/recheck-domains` | `https://<new-app-host>/api/public/cron/recheck-domains` |
| `provider_health_runner` | project--…-dev.lovable.app | `run_provider_health_runner()` → `/api/public/cron/provider-health` | `https://<new-app-host>/api/public/cron/provider-health` |

Non-URL `platform_settings` rows (state/config, copy as data): `auth_providers`,
`inbound_health`, `inbound_last_alert`, `inbound_reconciliation`,
`inbound_retry_sweep`, `inbound_webhook_status`, `transactional_email`,
`system.auth`, `system.branding`, `system.legal`.

**Unchanged in this phase.** Update these 9 rows only at final cutover, after the
new deployment host answers; the current URLs must keep working until then.

---

## 5. Auth migration requirements

- 33 users, 32 confirmed, 1 unconfirmed. Identities: 33 email, 1 Google.
- **User UUIDs must be preserved.** Every business table references
  `auth.users.id` (`profiles.id`, `workspaces.owner_id`, `workspace_members.user_id`,
  `user_roles.user_id`, `referral_profiles.user_id`, audit/actor columns, …).
  Do not create replacement users; migrate `auth.users` rows with their original
  `id`, `email`, `encrypted_password`, `email_confirmed_at`, `created_at`, and the
  matching `auth.identities` rows (same `user_id`, `provider`, `provider_id`).
- Recreate the `on_auth_user_created` trigger on `auth.users` calling
  `public.handle_new_user()` **after** the user import, so importing does not
  double-insert profiles.
- Re-grant the admin role by inserting the owner's UUID into `public.user_roles`
  with role `admin` (only if it does not come across with the data copy).
- **New JWT secret:** the new project signs tokens with a different key, so all
  existing sessions/refresh tokens are invalidated. Every user must sign in again
  after cutover. Password hashes carry over, so passwords still work.
- Re-configure Site URL + redirect URLs (`/`, `/auth`, `/auth/callback`, `/signin`,
  `/reset-password`) and keep email confirmation behaviour identical.

---

## 6. Google login

Current state: Google sign-in is brokered through Lovable's OAuth broker
(`src/integrations/lovable/index.ts` → `lovable.auth.signInWithOAuth("google")`),
so no MunchReach-owned Google client id/secret exists today. One user has a Google
identity. Visibility of the button is controlled by `public_auth_settings()` /
`platform_settings.system.auth`, with admins exempt from the restriction.

Checklist for the new project (do nothing yet):

1. Google Cloud Console → create project "MunchReach" → OAuth consent screen
   (External, app name, logo, support + developer email, privacy/terms URLs).
2. Add scopes `email`, `profile`, `openid`; publish the consent screen.
3. Create an OAuth 2.0 Web client; authorised JS origin = new app origin;
   authorised redirect URI = `https://<new-project-ref>.supabase.co/auth/v1/callback`.
4. In the new Supabase project: Auth → Providers → Google → enable, paste client id
   and secret.
5. Add app redirect URLs to Auth settings; keep `redirect_uri` a public same-origin
   URL (never a protected route).
6. If the broker helper is dropped, switch the sign-in button to
   `supabase.auth.signInWithOAuth({ provider: "google" })`.
7. Verify the existing Google-identity user still resolves to the same UUID
   (match on `provider_id`/`sub`, not email).

---

## 7. Storage

| Bucket | Public | Notes |
| --- | --- | --- |
| `avatars` | private | user avatars, signed URLs |
| `workspace-logos` | private | workspace branding |
| `blog-media` | private | CMS media, served via `/api/public/media.$` with signed URLs |
| `review-media` | private | testimonial media |
| `support-attachments` | private | ticket attachments |

2 objects exist. No public buckets; all reads go through signed URLs.

Checklist:
1. Create the 5 buckets in the new project with **private** visibility and the same ids.
2. Recreate `storage.objects` RLS policies (per-bucket owner/workspace scoping and
   admin access) — they are not covered by a `public`-schema dump.
3. Copy file bytes separately from the SQL migration: download each object from the
   old project (service role) and upload to the same bucket + object path in the new
   project. Do not delete or modify the originals.
4. Verify the 2 object rows and their metadata/paths match after copy.
5. Re-test avatar upload, workspace logo upload, blog media serving, support attachment download.

---

## 8. Realtime — 30 published tables

Reproduce with `ALTER PUBLICATION supabase_realtime ADD TABLE public.<t>;` (and
`REPLICA IDENTITY FULL` where update payloads are needed) for:

- **Unified Inbox / messages:** `conversations`, `conversation_messages`,
  `conversation_events`, `conversation_notes`, `campaign_replies`
- **Campaign live stats:** `campaign_messages`, `campaign_recipients`,
  `email_engagement_events`
- **Warmup:** `warmup_jobs`, `warmup_daily_stats`, `warmup_health`,
  `warmup_settings`, `sending_accounts`
- **CRM / leads:** `leads`, `lead_activities`, `lead_notes`, `lead_tasks`, `crm_stages`
- **Automations:** `automations`, `automation_runs`, `automation_run_steps`
- **Referrals:** `referral_profiles`, `referral_attributions`, `referral_clicks`,
  `referral_commissions`, `referral_fraud_flags`, `referral_payouts`,
  `referral_webhook_events`
- **Notifications / support:** `notifications`, `support_ticket_messages`

Note: `support_ticket_messages` is realtime-enabled but internal notes are filtered
by RLS — keep that policy intact in the new project. Usage counters
(`workspace_usage_counters`) are **not** published today; the usage dashboard polls.

Verification after cutover: open Unified Inbox, warmup dashboard, campaign
analytics and the notification bell, and confirm live updates without refresh.

---

## 9. Backend surface

- **56 server-function modules** (`src/lib/*.functions.ts`) — all reach Supabase via
  `requireSupabaseAuth` (user context) or `await import("@/integrations/supabase/client.server")`.
- **16 `/api/public/*` routes**:
  - 9 cron: `run-campaigns`, `retry-inbound`, `run-warmup`, `run-automations`,
    `run-ai-personalization`, `run-transactional-email`, `reconcile-delivery`,
    `recheck-domains`, `provider-health`
  - 6 webhook/callback: `inbound/email`, `billing/stripe`, `billing/paddle`,
    `billing/lemonsqueezy`, `referral/billing`, `integrations/$slug`,
    plus `automations/$token` (public automation trigger)
  - 1 media: `media.$`
- Repo-wide check: no hard-coded Lovable Supabase project ref, URL or key in
  application code. All Supabase access flows through `config.ts` env resolution.
  Only `platform_settings` rows carry hostnames (section 4).

---

## 10. Migration status report

| Area | Status | Note |
| --- | --- | --- |
| `PROVIDER_CREDENTIALS_KEY` | **CRITICAL RISK** | Copy exact value. Rotation = permanent loss of all stored mailbox/provider/billing/AI credentials. |
| Auth UUID preservation | **CRITICAL RISK** | Every FK depends on it; a re-created user orphans all workspace data. |
| Storage objects (file bytes) | **NEEDS MANUAL MIGRATION** | Not covered by SQL dump; copy 5 buckets + 2 objects + storage policies by hand. |
| Google OAuth | **NEEDS MANUAL MIGRATION** | Own Google Cloud client + provider config required in the new project. |
| Cron URLs (`platform_settings`) | **NEEDS MANUAL MIGRATION** | 9 rows repointed at cutover only. |
| Webhooks (inbound email, billing, referral) | **NEEDS MANUAL MIGRATION** | Re-point provider dashboards to the new host and re-verify signing secrets. |
| Environment variables / secrets | **NEEDS MANUAL MIGRATION** | ~35 names in section 3, re-added in the new environment. |
| Realtime configuration | **NEEDS TESTING** | Publication is not part of a schema dump; re-add 30 tables, then verify live UI. |
| Schema (tables, functions, triggers, RLS, FKs, indexes, enums) | **READY** | 139 ordered migrations reproduce it deterministically. |
| Extensions (`pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`, `vault`) | **READY** | Enable before applying migrations. |
| Application code / connection layer | **READY** | Fully env-driven; cutover is an env swap. |
| Sessions after cutover | **NEEDS TESTING** | New JWT secret → all users re-authenticate once. |

---

## Phase 2 preview (not started)

Create project → enable extensions → apply 139 migrations in filename order →
import `auth.users` + identities with original UUIDs → recreate `on_auth_user_created`
→ copy public data → buckets + object bytes + storage policies → realtime publication →
secrets (with `PROVIDER_CREDENTIALS_KEY` unchanged) → swap env → update the 9
`platform_settings` URLs → re-point webhooks → recreate cron jobs → verify.

**PHASE 1 COMPLETE — CURRENT PRODUCTION UNCHANGED**
