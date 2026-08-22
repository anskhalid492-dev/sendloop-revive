# Phase 6 — Controlled backend cutover (munchreach.com)

OLD (rollback, untouched): `ciaxsdojimcupxzpbpev`
NEW (target): `rihgzkofoxcjljlbvbya` — `https://rihgzkofoxcjljlbvbya.supabase.co`
Publishable key (NEW): `sb_publishable_gTF0GOqvRfQ7f_ED446AVg_DV0rNQ8o`

Domain and DNS are unchanged: `https://munchreach.com`.

## Status of this phase

The Lovable-managed build of this app is bound to the OLD project by the
platform-generated `.env`; that binding cannot be repointed from inside the
editor. The cutover therefore happens on the **self-hosted Cloudflare Worker**
(the runtime prepared in Phase 5/5A), by building with the NEW values and
deploying. Everything below is scripted; the remaining inputs are:

1. `NEW_SERVICE_ROLE_KEY` for `rihgzkofoxcjljlbvbya`
2. `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`

Until those are supplied, the live site keeps running against the OLD project —
which is the correct, safe state.

## 1. Pre-cutover verification (read-only, run first)

```bash
NEW_SUPABASE_URL=https://rihgzkofoxcjljlbvbya.supabase.co \
NEW_SERVICE_ROLE_KEY=... \
OLD_SUPABASE_URL=https://ciaxsdojimcupxzpbpev.supabase.co \
OLD_SERVICE_ROLE_KEY=... \
PROVIDER_CREDENTIALS_KEY=<byte-identical production value> \
bun scripts/phase6-verify.ts
```

Checks: connectivity, auth user count + UUID preservation + duplicate-email
detection, decryption of every stored provider credential with the unchanged
`PROVIDER_CREDENTIALS_KEY`, core table row counts (new vs old), storage buckets,
and whether any cron job still references the old project. Non-zero exit = STOP.

## 2. Build + deploy the cutover

```bash
export VITE_SUPABASE_URL=https://rihgzkofoxcjljlbvbya.supabase.co
export VITE_SUPABASE_PROJECT_ID=rihgzkofoxcjljlbvbya
export VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_gTF0GOqvRfQ7f_ED446AVg_DV0rNQ8o
# server-side secrets go through `wrangler secret put NAME`:
#   SUPABASE_URL, SUPABASE_PROJECT_ID, SUPABASE_PUBLISHABLE_KEY,
#   SB_SERVICE_ROLE_KEY (new project), PROVIDER_CREDENTIALS_KEY (UNCHANGED),
#   plus every other name in .env.production.example
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./scripts/deploy-production.sh
```

The script aborts unless the configured project is `rihgzkofoxcjljlbvbya`, and
after deploy it asserts the shipped client bundle actually references the new
project, then runs the SSR + API smoke tests over HTTPS.

`PROVIDER_CREDENTIALS_KEY` must be re-used byte-for-byte. A new value silently
breaks decryption of every stored provider/AI credential.

## 3. Post-cutover manual test pass (live site)

Homepage · signup · email+password login of an existing account · customer
dashboard · admin dashboard · workspaces · leads + import · campaigns + builder
+ scheduling · templates · mailboxes · domain/DNS verification · sending
provider · one real test email · unified inbox · replies · warmup · AI
personalization · usage limits · plans · billing · admin plan assignment · blog
· file uploads · notifications · realtime (inbox, replies, delivery, warmup must
update without refresh).

All users must sign in again: the new project issues different JWTs. Password
hashes were migrated, so passwords are unchanged. Do not create new accounts for
existing users.

**Google login:** `/auth/v1/settings` on the new project currently reports
`google: false`. Google OAuth must be enabled and its client id/secret
re-entered on the new project before Google sign-in works.

## 4. Cron / webhooks

Not migrated in this phase. Existing cron jobs and provider webhooks still point
at the OLD project's environment; after cutover they would write to the OLD
database. Migrate them in Phase 7, in this order: create new-project cron jobs
against `https://munchreach.com/api/public/cron/*` with the same secrets, then
repoint provider webhooks, then disable the old jobs.

## 5. Rollback

Re-deploy with the OLD values:

```bash
EXPECTED_SUPABASE_PROJECT=ciaxsdojimcupxzpbpev \
VITE_SUPABASE_URL=https://ciaxsdojimcupxzpbpev.supabase.co \
VITE_SUPABASE_PROJECT_ID=ciaxsdojimcupxzpbpev \
VITE_SUPABASE_PUBLISHABLE_KEY=<old publishable key> \
./scripts/deploy-production.sh
```

The OLD project is never modified by any step in this phase.
