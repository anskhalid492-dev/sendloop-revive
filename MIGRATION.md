# Sendloop — migration to a Cloud-free Lovable project + external Supabase

This codebase is prepared to be copied into a **new Lovable project created without Lovable Cloud**, then connected to **your own Supabase project**. No application code, UI or feature was changed for this; only configuration was made environment-driven.

---

## 1. Supabase configuration is fully environment-driven

`src/integrations/supabase/config.ts` contains **no** hard-coded project id, URL or key. Everything resolves from env:

| Value | Browser | Server |
| --- | --- | --- |
| URL | `VITE_SUPABASE_URL` | `SUPABASE_URL` |
| Project id | `VITE_SUPABASE_PROJECT_ID` | `SUPABASE_PROJECT_ID` |
| Publishable/anon key | `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) | `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`) |
| Service role key | never | `SUPABASE_SERVICE_ROLE_KEY` (falls back to `SB_SERVICE_ROLE_KEY`) |

Consumers:
- `src/integrations/supabase/client.ts` — browser client (anon key, RLS applies).
- `src/integrations/supabase/auth-middleware.ts` — `requireSupabaseAuth`, SSR acting as the signed-in user.
- `src/integrations/supabase/client.server.ts` — `supabaseAdmin`, service role. Only imported from `*.server.ts` / inside handlers; never reaches the browser bundle.

Repo-wide grep for any previous project ref or key: **0 matches**.

---

## 2. Database migration checklist (`supabase/migrations/`, 36 files, none deleted)

**Tables (39)** — `admin_notifications, campaign_messages, campaign_recipients, campaign_replies, campaign_step_variants, campaign_steps, campaigns, conversation_events, conversation_messages, conversation_notes, conversations, email_drafts, email_events, email_suppressions, email_templates, inbound_event_actions, inbound_routes, inbound_tests, lead_activities, lead_lists, lead_notes, lead_tasks, leads, notifications, plan_features, plans, platform_settings, profiles, sending_account_secrets, sending_accounts, template_uses, testimonials, user_roles, workspace_members, workspaces` (+ supporting tables created in later migrations).

**Enums** — `app_role`, `workspace_role`, plus campaign/conversation status enums defined in the migrations.

**Functions** — `handle_new_user`, `has_role`, `has_workspace_role`, `is_workspace_member`, `mark_conversation_outbound`, `set_updated_at`, `set_sending_account_enabled`, `run_campaign_scheduler`, `run_inbound_retry`.

**Triggers** — `on_auth_user_created` on `auth.users` (must be created manually if the migration runner cannot touch the `auth` schema), `*_updated_at` on 20 tables, `conversation_messages_outbound` on `conversation_messages`.

**RLS** — enabled on every public table; workspace-scoped policies via `is_workspace_member` / `has_workspace_role`, admin policies via `has_role(auth.uid(),'admin')`, plus `GRANT`s to `authenticated` / `service_role` (and `anon` only on public marketing tables `plans`, `plan_features`, `testimonials`). Never disable RLS.

**Indexes** — created inside the same migrations (workspace_id, campaign_id, conversation_id, lead email uniqueness).

**Realtime** — `ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;` and `... public.conversation_messages;` (migration `20260818144921_*`). Add the same for any other table you want live.

**Storage buckets** — none are created by the migrations and no code calls `storage.from(...)`; avatars/attachments are currently URL/metadata based. If you want buckets later they must be created explicitly; nothing breaks without them.

**Cron** — see section 6. Requires `pg_cron` + `pg_net` extensions.

If a table/function above is absent in the new project, apply the migrations in filename order rather than authoring new schema — do not create a parallel/incompatible schema.

---

## 3. Auth configuration required in the new Supabase project

- **Site URL**: the new deployment URL.
- **Redirect URLs**: `https://<new-app>/`, `https://<new-app>/auth`, `https://<new-app>/auth/callback`, plus the Lovable preview URL.
- **Email confirmation**: on (the app's sign-up flow expects confirmation; do not auto-confirm unless you want that).
- **Password reset**: default Supabase recovery email; the app's reset flow posts back to `/auth`.
- **OAuth**: Google is referenced in the sign-in UI — enable the Google provider in the new project, or the button errors with "Unsupported provider".
- **Roles**: `public.user_roles` + `has_role()`; grant your own account `admin` there for the admin dashboard.
- Session persistence uses `localStorage`; protected routes live under `src/routes/_authenticated/`.

---

## 4. Required production secrets (values not shown)

| Secret | Used in | Purpose |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SB_SERVICE_ROLE_KEY`) | `client.server.ts` | Server-side privileged DB access |
| `PROVIDER_CREDENTIALS_KEY` | `src/lib/provider-credentials.server.ts` | Encrypt/decrypt stored email-provider credentials — **not yet set** |
| `RESEND_API_KEY` | `ops.server.ts`, `dispatch.server.ts`, `inbox-send.server.ts`, `inbox-compose.server.ts`, `inbound-ops.server.ts`, `campaigns.functions.ts`, `admin.functions.ts`, `provider-credentials.server.ts` | Sending campaign + inbox email |
| `RESEND_WEBHOOK_SECRET` | `webhook-verify.server.ts`, `ops.server.ts` | Svix signature verification of Resend webhooks |
| `SVIX_SIGNING_SECRET` | `webhook-verify.server.ts`, `ops.server.ts` | Alternate name accepted for the same signature check |
| `INBOUND_EMAIL_SECRET` | `webhook-verify.server.ts`, `ops.server.ts`, `admin.functions.ts`, both cron routes | Shared token guarding the inbound endpoint and cron routes |
| `INBOUND_WEBHOOK_SIGNING_SECRET` | `webhook-verify.server.ts` | Optional HMAC for non-Resend inbound providers |
| `CAMPAIGN_CRON_SECRET` | `src/routes/api/public/cron/run-campaigns.ts`, `retry-inbound.ts` | Cron caller auth (falls back to `INBOUND_EMAIL_SECRET`) |

All of these go through Lovable's secure secrets store — none belong in `.env` or code.

---

## 5. Webhooks to re-point after deploying the new project

| Endpoint | Old URL | New URL required |
| --- | --- | --- |
| Resend inbound email | `https://project--43344b3a-…-dev.lovable.app/api/public/inbound/email?token=…` | `https://<new-project-url>/api/public/inbound/email?token=<INBOUND_EMAIL_SECRET>` |
| Resend delivery/event webhook (opens, clicks, bounces) | same old host `/api/public/inbound/email` | `https://<new-project-url>/api/public/inbound/email` with the Svix signing secret configured |
| Billing webhook | not implemented in this codebase | n/a until billing provider is added |

There is a single inbound processing pipeline (`ops.server.ts`) — do not add a second one.

---

## 6. Cron jobs (exactly two, already defined in migration `20260818145023_*`)

| Name | Schedule | Calls | Endpoint hit | Secret |
| --- | --- | --- | --- | --- |
| `sendloop-campaign-runner` | `*/5 * * * *` | `public.run_campaign_scheduler()` → `pg_net` POST | `/api/public/cron/run-campaigns` | `x-sendloop-signature` = `CAMPAIGN_CRON_SECRET` / `INBOUND_EMAIL_SECRET` |
| `sendloop-inbound-retry` | `*/10 * * * *` | `public.run_inbound_retry()` → `pg_net` POST | `/api/public/cron/retry-inbound` | same |

Both read their target URL + token from `public.platform_settings` (`campaign_runner`, `inbound_retry_runner` rows) — update those two rows with the new deployment URL instead of creating new jobs.

---

## 7. Checklist for the new Lovable project

1. Create a new Lovable project **without** Lovable Cloud.
2. Connect your external Supabase project (Project Settings → Integrations → Supabase).
3. Import this codebase as-is.
4. Apply all migrations in `supabase/migrations/` in filename order.
5. Configure Auth (section 3).
6. Create storage buckets only if you add file features (none required today).
7. Confirm the realtime publication includes `conversations` and `conversation_messages`.
8. Verify server functions resolve `SUPABASE_URL` / keys from env (no code change needed).
9. Add the secrets from section 4 via the secure secrets store.
10. Enable `pg_cron` + `pg_net`, apply the cron migration, update the two `platform_settings` rows.
11. Update the Resend inbound webhook URL + token.
12. Test sign up / sign in / sign out / password reset / protected routes.
13. Test campaign creation, scheduling and sending.
14. Test an inbound reply end-to-end.
15. Test Unified Inbox threading and replying.
16. Test admin dashboard and admin tools with an `admin` row in `user_roles`.

Migration is **not** complete until steps 12–16 pass against your own project.
