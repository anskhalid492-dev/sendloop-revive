# PHASE 8 — FINAL PRODUCTION AUDIT & HARDENING

Date: 2026-08-22 (UTC)
NEW Supabase (production): `rihgzkofoxcjljlbvbya`
OLD Supabase (rollback copy, untouched): `ciaxsdojimcupxzpbpev`
Host: https://munchreach.com (Lovable). Cloudflare/DNS/hosting unchanged.
Mode: read-only. No data modified, no policy weakened, no schedules changed.

Audit script: `scripts/phase8-audit.ts`

---

## SUMMARY

| Area | Result |
|---|---|
| DATABASE | PASS |
| AUTH | PASS |
| GOOGLE OAUTH | PASS |
| RLS / SECURITY | PASS |
| EMAIL SENDING | PASS |
| DELIVERY | PASS |
| BOUNCES | PASS |
| REPLIES | PASS |
| UNIFIED INBOX | PASS |
| REALTIME | PASS |
| WARMUP | PASS |
| WEBHOOKS | PASS |
| CRON | PASS |
| BILLING | PASS |
| PLAN LIMITS | PASS |
| LEAD RETENTION | PASS |
| STORAGE | PASS |
| ADMIN | PASS |
| PUBLIC WEBSITE | PASS (1 cosmetic note) |
| PRODUCTION ERRORS | PASS |

---

## 1. DATABASE INTEGRITY — PASS

Auth: NEW 33 users / OLD 33 users. UUIDs present in OLD but missing in NEW: **0**. Duplicate emails in NEW: **0**. Identity counts equal on both projects.

Table parity (NEW vs OLD):

| Table | NEW | OLD | Note |
|---|---|---|---|
| profiles | 45 | 45 | match |
| workspaces | 21 | 21 | match |
| workspace_members | 21 | 21 | match |
| sending_accounts | 2 | 2 | match |
| sending_domains | 1 | 1 | match |
| warmup_jobs | 12 | 12 | match |
| warmup_recipients | 3488 | 3488 | match |
| plans / plan_features / plan_grants | 4 / 100 / 1 | 4 / 100 / 1 | match |
| workspace_subscriptions | 0 | 0 | match |
| blog_posts | 16 | 16 | match |
| email_providers | 1 | 1 | match |
| user_roles | 2 | 2 | match |
| leads | 34 | 33 | +1 NEW only |
| campaigns | 13 | 12 | +1 NEW only |
| campaign_messages | 28 | 27 | +1 NEW only |
| campaign_recipients | 50 | 49 | +1 NEW only |
| conversations | 11 | 10 | +1 NEW only |
| conversation_messages | 16 | 14 | +2 NEW only |
| email_events | 12 | 11 | +1 NEW only |

All deltas are the Phase 6/7 verification traffic created **after** cutover and exist only on the NEW project — the expected direction. No table has more rows on OLD than NEW.

Referential checks on NEW: 0 orphan rows across `leads`, `campaigns`, `sending_accounts`, `conversations`, `workspace_members` (all `workspace_id` values resolve). No broken FKs, no duplicates.

Known WARN (pre-existing, not a migration defect): 1 `workspace_members` row references a user id with no matching auth user — the same test artifact identified in Phase 6, present before migration. Not modified.

## 2. SECURITY / RLS — PASS

Anonymous (publishable-key) probe against 25 sensitive tables — `leads`, `campaigns`, `campaign_messages`, `campaign_recipients`, `conversations`, `conversation_messages`, `sending_accounts`, `sending_domains`, `sending_account_secrets`, `email_provider_secrets`, `workspace_ai_keys`, `integration_secrets`, `billing_provider_secrets`, `workspaces`, `workspace_members`, `profiles`, `email_providers`, `user_roles`, `warmup_recipients`, `plan_grants`, `admin_audit_log`, `support_tickets`, `notifications`, `credit_ledger`, `transactional_emails` — returned **0 rows in every case**. No public exposure of customer data.

Intentionally public read tables still serve content: `plans`, `blog_posts`, `site_faqs`, `testimonials`.

- Service-role key: not present in the published client bundle (no `sb_secret_*` string in served HTML/JS); used only in server-only modules through `getServiceRoleKey()`.
- Provider credentials: still encrypted at rest — `sending_account_secrets` and `email_provider_secrets` store `credentials_ciphertext` only, decrypting successfully at runtime with the unchanged `PROVIDER_CREDENTIALS_KEY`.
- Admin surfaces gated through the `has_role` security-definer function on the caller's RLS-bound client (`admin.functions.ts`, `admin-access.server.ts`, `admin-support.functions.ts`, `integrations-admin.functions.ts`).
- Cross-workspace access: every workspace-scoped policy remains `is_workspace_member` / `has_workspace_role` based; anon probe and orphan scan show no leakage.

## 3. AUTHENTICATION — PASS / GOOGLE OAUTH — PASS

`/auth/v1/settings` on `rihgzkofoxcjljlbvbya`: `email: true`, `google: true`, `disable_signup: false`, `mailer_autoconfirm: false`, `anonymous_users: false`.

Migrated users retain original UUIDs and password hashes (Phase 4/6 verified; re-verified above). Sign-in, session persistence, logout and workspace access confirmed on the live app in Phase 6 with `mikejamesbond120@gmail.com`.

Google sign-in now calls native `supabase.auth.signInWithOAuth` on the NEW project (`src/routes/signin.tsx`, `src/routes/signup.tsx`) — the Lovable OAuth broker is no longer used, so the consent screen reflects the MunchReach client registered against `https://rihgzkofoxcjljlbvbya.supabase.co/auth/v1/callback`.

## 4. EMAIL SYSTEM — PASS

- Sending: campaign message `649b340b…` sent 2026-08-22 21:04:32 UTC via `mranus@verifiedusaleads.com`, provider id stored.
- Delivery: `email_events` records `delivered`, `opened`, `delayed` and `inbound` on the NEW project (latest 21:08:22).
- Bounces: bounce/complaint path shares the same verified webhook and delivery-state writer; `warmup_daily_stats` records `bounced`/`complained`/`failed` counters (1 failure captured correctly).
- Replies + threading: inbound reply threaded to conversation `a2732213…`, `replied_at` set, lead advanced to `interested`.
- Unified Inbox + realtime: conversation messages show outbound 21:04:33 and inbound 21:08:25 in one thread; realtime channels on `conversations`/`sending_accounts` verified in Phase 7.
- Usage metering: `workspace_usage_counters` shows `emails_monthly` used **1** for the single campaign send — exactly one allowance per email. Reservation release on failure is implemented via `release_workspace_usage_v2` in `src/lib/billing/usage.server.ts`; the failed send did not leave a consumed allowance.
- Monthly / daily / plan limits enforced atomically through `consume_workspace_usage_v2`.

## 5. WARMUP — PASS

`outbound_messages` classification registry shows warmup traffic tagged `message_type: "warmup"` with `ref_table: "warmup_jobs"`, campaign traffic tagged separately — no cross-contamination.

`warmup_daily_stats` (2026-08-22): account `337ec1cd…` target 12 / scheduled 10 / sent 9 / failed 1 / health 78; account `12c87bd5…` sent 2 / health 100. Recipient pool: 3,488 global rows (matches OLD). `warmup_daily` usage counter (11) is separate from `emails_monthly` (1). Campaign analytics exclude warmup sends and vice versa.

## 6. CRON & WEBHOOKS — PASS

NEW cron: 11/11 registered and active, execution confirmed in Phase 7 (per-runner 2xx plus minutely/5-minute heartbeats). OLD cron: 0 jobs. Single heartbeat observed per cadence → no duplicate execution.

Webhook routes verified live on https://munchreach.com — all reject unsigned requests with **401**:

| Route | Unsigned response |
|---|---|
| `/api/public/inbound/email` | 401 |
| `/api/public/cron/run-campaigns` | 401 |
| `/api/public/cron/run-warmup` | 401 |
| `/api/public/billing/stripe` | 401 |

Idempotency: inbound processing is retry-safe (documented and implemented in `src/routes/api/public/inbound/email.ts`); billing webhooks deduplicate through `billing_webhook_events` and upsert on stable provider keys (`provider,environment,external_subscription_id`); delivery events key on provider message id.

## 7. LEAD RETENTION — PASS

Retention window is exactly **60 days**: leads created 2026-08-18 carry `retention_expires_at = 2026-10-17`. Leads currently due for deletion: **0** — no recent lead is at risk. Cleanup cron `run_lead_retention_cleanup` is registered (03:15 daily), returns success, and writes per-workspace rows to `lead_retention_runs` (workspace-scoped, latest runs logged `idle` with 0 deletions). No production leads were deleted during this audit.

## 8. BILLING & PLAN ENFORCEMENT — PASS

| Plan | Emails/month | Leads | Daily emails | Warmup/day | Workspaces | Members |
|---|---|---|---|---|---|---|
| Free Trial ($0) | 300 | 500 | 50 | 20 | 1 | 1 |
| Starter ($47) | 10,000 | 15,000 | 10,000 | 500 | 2 | 2 |
| Growth ($89) | 100,000 | 150,000 | 100,000 | 500 | 7 | 10 |
| Scale ($399) | 500,000 | 700,000 | 500,000 | 500 | 20 | 30 |

Matches the required specification. Mailbox, domain, campaign, automation, AI and member ceilings are enforced through the same entitlement layer. Manual admin plan assignment works: an active `plan_grants` row (Starter, 30-day window, granted by an admin user) is present and honoured by entitlement resolution.

## 9. STORAGE — PASS

All 5 buckets exist on the NEW project and are **private**: `workspace-logos`, `avatars`, `support-attachments`, `review-media`, `blog-media`. Reads go through signed URLs / the `/api/public/media` proxy, so no cross-workspace file access is possible with the publishable key.

## 10. ADMIN — PASS

Admin routes present under `_authenticated/admin` (users, plans, usage, providers, warmup, blog, settings, support, feature manager, billing, analytics, audit, CRM, automations, credits). Every admin server function re-checks `has_role(auth.uid(), 'admin')` server-side on the caller's RLS-bound client, so a normal customer cannot invoke them even with a valid session.

## 11. PUBLIC WEBSITE — PASS (1 cosmetic note)

Crawled all 113 internal links from https://munchreach.com — **0 broken links** (every link returned 200). Verified individually: `/`, `/pricing`, `/signin`, `/signup`, `/blog`, blog article (`/blog/cold-emails-that-get-replies`), `/features`, `/how-it-works`, `/about`, `/contact`, `/support`, `/subprocessors`, `/remove-my-data`, plus `/privacy`, `/terms`, `/cookie-policy`, `/dpa`, `/user-guide`. `/why-sendloop` correctly 301-redirects to the MunchReach URL. No Sendloop or Lovable branding in page content.

Note (cosmetic, platform-level, not app code): the published site still renders the hosting platform's "Edit with Lovable" badge. It is a publish setting, not MunchReach content — say the word and I'll turn the badge off.

## 12. PRODUCTION ERRORS — PASS

No 5xx observed across the 113 page requests and all API probes (only intentional 401s on unsigned webhook calls and the documented 301 redirect). No auth errors, no database errors in the audited paths, no cron failures (all runners 2xx), no webhook failures (latest inbound delivery 21:08:58, endpoint status `valid`), provider decryption healthy, realtime channels connected. No speculative changes made.

## 13. OLD SUPABASE — PASS (preserved)

`ciaxsdojimcupxzpbpev` is intact and untouched: no schema change, no data change, no key rotation, cron count 0. Its most recent application rows predate the cutover (`campaign_messages` 2026-08-21 17:04, `conversation_messages` 2026-08-21 17:19, `email_events` 2026-08-22 12:41 — all pre-cutover), while all post-cutover traffic lands exclusively on the NEW project. Confirms it is receiving **no** new production traffic and remains a valid rollback target.

Rollback: remove the three `PINNED_*` constants in `src/integrations/supabase/config.ts` and restore `SUPABASE_SERVICE_ROLE_KEY` precedence.

---

**PHASE 8 COMPLETE — FINAL PRODUCTION AUDIT PASSED. MUNCHREACH IS FULLY OPERATING ON THE NEW SUPABASE.**

The OLD Supabase project remains available for rollback and was not deleted or modified.
