# PHASE 4C — Production Host Preparation (munchreach.com)

Status: **Application verified production-buildable. Nothing switched over.**

Not done in this phase (as instructed): no cron jobs, no webhooks, no DB
connection change, no change to the current production Supabase project.

---

## 0. What was verified

- `bun run build` completes successfully (exit 0). Output: `dist/client` (static
  assets) + `dist/server/index.mjs` (SSR/API worker) + `dist/nitro.json`.
- Nitro preset in this build: **`cloudflare-module`** with `nodeCompat: true`.
- Routes present in the compiled server bundle:

| Path | Status |
| --- | --- |
| `/` | present |
| `/pricing` | present |
| `/blog`, `/blog/$slug`, `/blog/category/$slug`, `/blog/author/$slug` | present |
| `/api/public/media/$` | present |
| `/api/public/cron/*` (9 endpoints) | present |
| `/api/public/inbound/email` | present |
| `/api/public/integrations/$slug` | present |
| `/api/public/automations/$token` | present |
| `/api/public/referral/billing` | present |
| `/api/public/billing/{stripe,paddle,lemonsqueezy}` | present |
| `/api/public/webhooks/*` | **does not exist** — payment webhooks live under `/api/public/billing/*`. Do not configure a `/webhooks/` prefix. |

Also fixed in this phase: every hard-coded fallback host in the code
(`*.lovable.app`, `sendloop.io`) now falls back to `https://munchreach.com`
for canonical tags, email links, and billing return URLs. These are fallbacks
only — `APP_URL` / `PUBLIC_APP_URL` still override them.

---

## 1. Required hosting / runtime

The app is a **TanStack Start v1 (SSR) app bundled by Nitro**. It needs a host
that runs a JS server, not static hosting.

Two supported options:

- **Cloudflare Workers** (matches the current build preset, `nodeCompat`
  enabled). Deploy artifact: `dist/server/wrangler.json` + `dist/client`.
- **Any Node 22 server host** (Fly.io, Render, Railway, a VPS with Docker).
  Requires switching the Nitro preset to `node-server`, after which the entry is
  `dist/server/index.mjs`.

Not viable: the current LiteSpeed/PHP shared host on munchreach.com. It cannot
execute the SSR/API worker, which is why every MunchReach route 404s today.
It must be replaced (or the domain repointed) before Phase 4B can finish.

## 2. Build command

```
bun install
bun run build
```

(`npm ci && npm run build` is equivalent if the host has no bun.)

## 3. Start command

- Cloudflare: `npx wrangler deploy` (from repo root; reads `dist/server/wrangler.json`).
- Node preset: `node dist/server/index.mjs`, listening on `$PORT`.

## 4. Required environment variables

Server runtime (never exposed to the browser):

| Variable | Purpose | Required |
| --- | --- | --- |
| `SUPABASE_URL` | new project API URL | yes |
| `SUPABASE_PUBLISHABLE_KEY` | anon/publishable key | yes |
| `SUPABASE_PROJECT_ID` | project ref (`rihgzkofoxcjljlbvbya`) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SB_SERVICE_ROLE_KEY`) | privileged server work | yes |
| `PROVIDER_CREDENTIALS_KEY` | **must be byte-identical to production** or all stored provider/AI keys fail to decrypt | yes |
| `APP_URL` / `PUBLIC_APP_URL` | `https://munchreach.com` — used in emails, billing return URLs, tracking links | yes |
| `CAMPAIGN_CRON_SECRET` | auth for `/api/public/cron/run-campaigns` etc. | yes |
| `WARMUP_CRON_SECRET` | auth for warmup cron | yes |
| `DOMAIN_CRON_SECRET` | auth for domain recheck cron | yes |
| `PROVIDER_HEALTH_CRON_SECRET` | auth for provider-health cron | yes |
| `TRANSACTIONAL_CRON_SECRET` | auth for transactional email cron | yes |
| `INBOUND_EMAIL_SECRET`, `INBOUND_WEBHOOK_SIGNING_SECRET`, `SVIX_SIGNING_SECRET`, `RESEND_WEBHOOK_SECRET` | inbound/webhook signature verification | yes |
| `REFERRAL_BILLING_SECRET`, `REFERRAL_HASH_SALT` | referral endpoints | yes |
| `LOVABLE_API_KEY` | platform AI features (admin) | optional |
| `RESEND_API_KEY`, `MAILGUN_API_KEY`, `SENDGRID_API_KEY`, `BREVO_API_KEY`, `POSTMARK_API_KEY`, `ZEPTOMAIL_API_KEY`, `EMAILIT_API_KEY`, `AWS_REGION` (+ SES creds) | provider pool — only those actually in use | as used |
| `SENDING_DNS_HOST`, `SENDING_MX_HOST`, `SENDING_SPF_INCLUDE`, `SENDING_DKIM_HOST`, `SENDING_DMARC_RUA`, `SENDING_TRACKING_HOST` | customer domain-verification instructions | yes |
| `NODE_ENV=production` | | yes |

Build-time (baked into the client bundle, must be set **before** `bun run build`):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`,
`VITE_APP_URL=https://munchreach.com`.

## 5. Runtime version

- Node **22.x** (build toolchain: Vite 8, bun 1.3, TypeScript 5.8).
- On Cloudflare: `compatibility_date` ≥ 2024-09-23 with `nodejs_compat`.

## 6. Required DNS records (apex + www)

| Type | Name | Value | Note |
| --- | --- | --- | --- |
| A / ALIAS / CNAME-flattened | `munchreach.com` | host-provided target | replaces the current LiteSpeed A record |
| CNAME | `www` | `munchreach.com` | redirect www → apex |
| CNAME | `track` (optional) | app host | only if `SENDING_TRACKING_HOST` is used |

Email-sending DNS (SPF/DKIM/DMARC/MX for inbound) stays with the sending
provider and is unchanged by this phase.

## 7. SSL

- TLS certificate for `munchreach.com` **and** `www.munchreach.com`
  (Cloudflare Universal SSL or host-managed Let's Encrypt).
- Full (strict) mode, HTTPS redirect on, HSTS after verification.
- Certificate must cover the apex, because all webhook/cron callers will use it.

## 8. Webhook endpoint URLs (to configure **later**, in Phase 4B)

```
https://munchreach.com/api/public/billing/stripe
https://munchreach.com/api/public/billing/paddle
https://munchreach.com/api/public/billing/lemonsqueezy
https://munchreach.com/api/public/inbound/email
https://munchreach.com/api/public/integrations/{slug}
https://munchreach.com/api/public/automations/{token}
https://munchreach.com/api/public/referral/billing
```

There is no `/api/public/webhooks/*` route — do not register that prefix.

## 9. Cron endpoint URLs (to schedule **later**, in Phase 4B)

```
https://munchreach.com/api/public/cron/run-campaigns
https://munchreach.com/api/public/cron/run-warmup
https://munchreach.com/api/public/cron/run-automations
https://munchreach.com/api/public/cron/run-ai-personalization
https://munchreach.com/api/public/cron/run-transactional-email
https://munchreach.com/api/public/cron/reconcile-delivery
https://munchreach.com/api/public/cron/provider-health
https://munchreach.com/api/public/cron/recheck-domains
https://munchreach.com/api/public/cron/retry-inbound
```

Each requires its matching `*_CRON_SECRET` in the request (header/query as the
handler expects). Schedule these only after the host is live and the DB cutover
is done, otherwise jobs double-fire against the old project.

---

## Deployment checklist

1. Choose the production host (Cloudflare Workers recommended — matches the current build).
2. Decommission or repoint the LiteSpeed/PHP placeholder on munchreach.com.
3. Set all build-time `VITE_*` vars, then run `bun install && bun run build`.
4. Set all server env vars from §4, copying `PROVIDER_CREDENTIALS_KEY` verbatim from production.
5. Deploy; smoke test `/`, `/pricing`, `/blog`, and one `/api/public/*` route over HTTPS.
6. Point DNS (§6), issue SSL (§7), verify apex + www.
7. **Stop.** Return to Phase 4B: storage byte transfer, realtime live test, then cron + webhook registration against `https://munchreach.com`.

### Things you must configure outside Lovable

- Host account + project (Cloudflare/Fly/Render) and its deploy credentials.
- DNS at the registrar for munchreach.com (removing the parked host records).
- SSL/CDN settings on that host.
- New Supabase project's **service role key** and **publishable key** (still blocking Phase 4B).
- Provider dashboards (Stripe/Paddle/Lemon Squeezy/Resend/etc.) — webhook URLs, later.
