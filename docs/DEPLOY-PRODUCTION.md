# MunchReach — Production Deployment (Phase 5)

Target host: **Cloudflare Workers** (matches the existing Nitro
`cloudflare-module` build). Domain: **https://munchreach.com**.

Nothing in this phase touches Supabase, data, cron jobs, webhooks, or DNS.

---

## 1. Verified locally (production artifacts, no Lovable dev server)

The built worker was started standalone with `wrangler dev` from `dist/server`
(the exact artifact that gets deployed) and exercised over HTTP:

| Route | Result |
| --- | --- |
| `/` | 200, SSR HTML, `<title>MunchReach — Turn Cold Emails Into Real Conversations</title>` |
| `/pricing` | 200, SSR HTML, `<title>Pricing — MunchReach</title>` |
| `/blog` | 200, SSR HTML, `<title>MunchReach Blog — Cold Email, Deliverability & Outbound Growth</title>` |
| `/api/public/inbound/email` (POST) | 401 — signature verification active and working |
| `/api/public/billing/{stripe,paddle,lemonsqueezy}` | routed, handler executes |
| `/api/public/integrations/{slug}`, `/api/public/automations/{token}`, `/api/public/referral/billing` | routed, handler executes |
| `/api/public/cron/*`, `/api/public/media/*` | routed; returned 500 **only** because the service-role key was intentionally not supplied to the local test |
| `/api/public/webhooks/*` | 404 — correct, this prefix does not and must not exist |

Conclusion: SSR and all server/API routes run from the built bundle with no
Lovable development environment. The remaining 500s are missing-secret errors,
not routing or runtime errors — they resolve once §3 secrets are set.

Current munchreach.com for comparison: `HTTP/2 200`, `server: LiteSpeed`,
`x-powered-by: PHP/8.3.30`, and `/pricing` → 404. That stack must be removed.

## 2. Build & deploy

```bash
bun install --frozen-lockfile
bun run build           # -> dist/client + dist/server/index.mjs + dist/server/wrangler.json
./scripts/deploy-production.sh    # names the worker, attaches munchreach.com, deploys, smoke-tests
```

`scripts/deploy-production.sh` needs `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`. It sets `nodejs_compat`, worker name `munchreach`, and
custom domains `munchreach.com` + `www.munchreach.com`.

Node 22 alternative (if you prefer a VM/container instead of Workers): set
`nitro: { preset: "node-server" }` in `vite.config.ts`, rebuild, then run
`node dist/server/index.mjs` behind your reverse proxy. No application code
changes are required either way.

Runtime version: **Node 22.x** toolchain; on Workers, `compatibility_date`
2026-08-22 with `nodejs_compat`.

## 3. Environment variables

Full list in `.env.production.example` (names only, no values). Critical ones:

- `PROVIDER_CREDENTIALS_KEY` — must be byte-identical to the existing
  production value.
- `APP_URL` = `PUBLIC_APP_URL` = `https://munchreach.com`, and
  `VITE_APP_URL=https://munchreach.com` **at build time**.
- Supabase vars stay pointed at the **current** production project for this phase.

Push each one with `wrangler secret put NAME --name munchreach` (or your Node
host's secret manager). Build-time `VITE_*` vars must exist in the CI shell
before `bun run build`.

## 4. DNS (you perform this, outside Lovable)

At the munchreach.com registrar/DNS provider:

1. Remove the A/AAAA records pointing at the LiteSpeed/WordPress host.
2. Add the zone to Cloudflare and attach the worker via custom domain — Cloudflare
   then manages the apex and `www` records automatically.
3. Keep all mail records (MX, SPF, DKIM, DMARC) exactly as they are.

If instead you connect the domain through Lovable's own hosting, use the
Lovable custom-domain flow (A record `@` and `www` → `185.158.133.1`, plus the
`_lovable` TXT record) — but the final API/cron/webhook host must still be
`https://munchreach.com`, never a `*.lovable.app` URL.

## 5. SSL

- Certificate covering `munchreach.com` and `www.munchreach.com`
  (Cloudflare Universal SSL, auto-issued on custom-domain attach).
- SSL mode Full (strict), Always Use HTTPS on, HSTS after verification.

## 6. Post-deploy verification (run these before calling it live)

```bash
curl -sI https://munchreach.com/ | grep -iE '^(server|x-powered-by)'   # must NOT show LiteSpeed/PHP
curl -s -o /dev/null -w '%{http_code}\n' https://munchreach.com/
curl -s -o /dev/null -w '%{http_code}\n' https://munchreach.com/pricing
curl -s -o /dev/null -w '%{http_code}\n' https://munchreach.com/blog
curl -s https://munchreach.com/pricing | grep -o '<title>[^<]*</title>'   # SSR proof
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://munchreach.com/api/public/inbound/email  # expect 401
curl -s -o /dev/null -w '%{http_code}\n' https://munchreach.com/api/public/webhooks/stripe        # expect 404
```

## 7. Deferred to later phases (do NOT do now)

- Supabase cutover to the new project.
- `pg_cron` jobs against `https://munchreach.com/api/public/cron/*`.
- Provider webhook registration against `https://munchreach.com/api/public/billing/*`
  and `/api/public/inbound/email`.
- Storage byte transfer + realtime live test (Phase 4B leftovers).

## What you must do outside Lovable

1. Cloudflare account + API token + `munchreach.com` zone (or the Node host).
2. Remove the LiteSpeed/WordPress parked site.
3. Registrar DNS change.
4. Push all production secrets to the host.
