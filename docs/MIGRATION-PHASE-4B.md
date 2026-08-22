# MunchReach — Phase 4B: infrastructure migration (PARTIAL — BLOCKED)

Production (unchanged): `ciaxsdojimcupxzpbpev`
Target: `rihgzkofoxcjljlbvbya`

Phase 4A data migration is verified. This document records what Phase 4B could
complete, and the two inputs that block the rest. **No production object was
changed. The application was not switched.**

---

## Status board

| Item | Status |
| --- | --- |
| Storage buckets + policies | PASS |
| Storage object bytes (2 files) | **BLOCKED** — needs new project's service role key |
| Provider credentials (decryptable with unchanged key) | PASS |
| Provider routing / pool config | PASS |
| Realtime publication + replica identity | PASS |
| Realtime live event test (4 channels) | **BLOCKED** — needs new project's publishable/anon key |
| Secrets checklist | PASS (checklist produced; values must be set by you at cutover) |
| Cron (11 jobs) | **BLOCKED** — no production application host exists yet |
| Webhooks | **BLOCKED** — same host dependency |

Per your instruction ("if anything fails, STOP"), nothing was forced. Phase 4B is
**not** complete.

---

## 1. Storage

Already done in 4A and re-verified now:

- 5 buckets exist on the target with the original ids/names and `public = false`.
- All 15 `storage.objects` RLS policies were recreated and are **text-identical**
  to production (verified by a full `pg_policies` diff — zero differences).

Outstanding — the 2 object files:

| Bucket | Path | Size |
| --- | --- | --- |
| `avatars` | `56355c2f-…/avatar-1787259654723.jpg` | ~596 KB |
| `support-attachments` | `56355c2f-…/2ae588fc-…-Screenshot_2026-08-20_at_5.29.35_AM.png` | ~81 KB |

Their bytes live in the storage service, not in Postgres, so a database
connection cannot move them. Uploading requires the **new project's service role
key**, which does not exist in this environment (only the production one does).
The `storage.objects` metadata rows were intentionally left uninserted so no row
points at a missing file; they will be inserted together with the upload.

Both files stay private — the upload will use the service role key directly, not
a public bucket.

## 2. Secrets / environment checklist

`PROVIDER_CREDENTIALS_KEY` **must be copied verbatim**. It was not rotated, not
regenerated, and is not printed anywhere in this document. Proof it still works
against the migrated ciphertext is in §6.

Set on the new deployment before cutover:

**Backend / connection (new values from the new project)**
- `SUPABASE_URL` → `https://rihgzkofoxcjljlbvbya.supabase.co`
- `SUPABASE_PROJECT_ID` → `rihgzkofoxcjljlbvbya`
- `SUPABASE_PUBLISHABLE_KEY`
- `SB_SERVICE_ROLE_KEY` (also accepted as `SUPABASE_SERVICE_ROLE_KEY`)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`

**Carry over UNCHANGED (regenerating any of these breaks stored data or live integrations)**
- `PROVIDER_CREDENTIALS_KEY` — CRITICAL, decrypts all provider/mailbox/integration/billing secrets
- `REFERRAL_HASH_SALT` — changing it breaks referral click de-duplication
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET` / `SVIX_SIGNING_SECRET`
- `INBOUND_EMAIL_SECRET`
- `INBOUND_WEBHOOK_SIGNING_SECRET`
- `CAMPAIGN_CRON_SECRET`
- Billing provider keys: Stripe, Paddle, Lemon Squeezy (secret key + webhook signing secret each)
- `LOVABLE_API_KEY` (AI gateway, used by AI personalization when a workspace has no own key)

**Cron runner tokens** are stored as data in `platform_settings`, not as env vars;
they migrated with the rows and stay valid. Only their `url` fields need rewriting
(§4).

**Do not** copy `SUPABASE_DB_URL` from production, and do not leave any variable
pointing at `ciaxsdojimcupxzpbpev` after cutover.

## 3. Realtime

Verified on the new project:

| Check | Production | New | Status |
| --- | --- | --- | --- |
| Tables in `supabase_realtime` | 30 | 30 | PASS (name-for-name diff empty) |
| `REPLICA IDENTITY FULL` tables | 28 | 28 | PASS |

The four channels you named are all published: inbox (`conversations`,
`conversation_messages`), replies (`conversation_messages`,
`email_engagement_events`), warmup (`warmup_jobs`, `warmup_daily_stats`,
`sending_accounts`), campaign/delivery (`campaign_messages`).

A live websocket event test still needs the new project's publishable key to
subscribe as a client; the write half of each test is ready to run the moment
that key exists.

## 4. Cron — blocked on the production host

The 11 jobs are **not** created on the new project (target `cron.job` count = 0),
which is correct: creating them now would double-fire against the same providers
while production still runs.

`pg_cron` and `pg_net` are both installed on the target, so creation is a
one-step operation once the host is known.

The blocker: **there is no production application host yet.** All 9 runner URLs in
`platform_settings` currently point at `*.lovable.app` preview/dev hosts, and
`munchreach.com` today serves a parked LiteSpeed/PHP placeholder, not this
application — `/pricing` and `/api/public/cron/*` both return 404 there. Pointing
cron at either would violate your instruction or simply fail.

Tell me the final production host (publish the app to `munchreach.com`, or name
the host you want) and I will rewrite all 9 `platform_settings` URLs and create
the 11 jobs with their existing schedules in one pass, then confirm each fires.

## 5. Webhooks — same blocker

Endpoints to re-point once the host exists: inbound email (Resend), delivery /
bounce / complaint events, `/api/public/billing/{stripe,paddle,lemonsqueezy}`,
`/api/public/integrations/$slug`, `/api/public/automations/$token`. Warmup
engagement rides the same delivery-event webhook. Signing secrets stay unchanged
(§2), so only the URLs move.

## 6. Provider infrastructure — PASS

- `email_providers` on the target holds the Resend pool provider, `is_enabled =
  true`, `health_status = healthy`, priority preserved, with its rolling success
  and failure counters intact — so pool routing and failover behave exactly as
  before, with no manual per-workspace assignment.
- No workspace was pinned to a provider by this migration.
- **Decryption test against the migrated rows, using the unchanged
  `PROVIDER_CREDENTIALS_KEY`:**

```
DECRYPT OK  email_provider_secrets:resend                      fields: api_key
DECRYPT OK  sending_account_secrets:anus@verifiedusaleads.com  fields: api_key
```

Ciphertext md5 across `email_provider_secrets`, `sending_account_secrets` and
`integration_secrets` is identical between production and target. Nothing was
re-encrypted.

---

## What I need to finish Phase 4B

1. **New project's service role key** — unlocks the 2 storage uploads.
2. **New project's publishable key** — unlocks the live realtime event tests.
3. **The production application host** — unlocks the 11 cron jobs and all webhook
   re-pointing.

PHASE 4B PARTIAL — PRODUCTION UNCHANGED; APPLICATION NOT SWITCHED.
