# Phase 6 — Supabase Cutover (Lovable hosting, no Cloudflare)

## Step 1 — Pre-cutover safety check (scripts/phase6-verify.ts)

Result: **16/17 PASS**. Only failure is `cron`, intentionally deferred to Phase 7.

- connection: new project reachable (https://rihgzkofoxcjljlbvbya.supabase.co)
- auth.users: 33 present
- auth UUID preservation: old=33 new=33, missing=0, duplicate emails=0
- provider credentials: 1/1 decrypted with unchanged `PROVIDER_CREDENTIALS_KEY`
- table parity: workspaces 21, profiles 45, leads 33, campaigns 12,
  campaign_messages 27, sending_accounts 2, conversations 10, warmup_jobs 12,
  plans 4, billing_subscriptions 1, blog_posts 16 — all equal to old project
- storage buckets: workspace-logos, avatars, support-attachments, review-media, blog-media

No writes were made to either database during this check.

## Step 2 — Rollback record (OLD project, keep untouched)

| Item | Value |
| --- | --- |
| Old project ref | `ciaxsdojimcupxzpbpev` |
| Old URL | `https://ciaxsdojimcupxzpbpev.supabase.co` |
| Old publishable key | managed env `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` |
| Old service-role key | secret `SUPABASE_SERVICE_ROLE_KEY` |
| Encryption key | `PROVIDER_CREDENTIALS_KEY` — **unchanged, never rotated** |

Rollback = remove the pinned override in `src/integrations/supabase/config.ts`
so the app falls back to the Lovable-managed env vars (old project), and unset
`SB_SERVICE_ROLE_KEY` preference. Nothing in the old project is deleted or modified.

## Step 3/4 — Cutover switch

- Client: pinned `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` override for
  `rihgzkofoxcjljlbvbya` in `src/integrations/supabase/config.ts`.
- Server: `getServiceRoleKey()` prefers the `SB_SERVICE_ROLE_KEY` secret, which
  holds the NEW project's `sb_secret_*` key. Never exposed to the browser.
- `PROVIDER_CREDENTIALS_KEY` untouched.
- Domain `https://munchreach.com` unchanged; hosting stays on Lovable.

## Blocking input

The NEW project's **publishable key** (`sb_publishable_...`) is required to point
the browser client at `rihgzkofoxcjljlbvbya`. It is not present in this
environment and cannot be derived from the service-role key.
