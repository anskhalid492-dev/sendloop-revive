# Phase 5A — Deploy MunchReach to Cloudflare Workers

Scope: put the already-built MunchReach app live on `https://munchreach.com`.
**No Supabase cutover, no cron jobs, no production webhooks in this phase.**
The app stays on the CURRENT Supabase project `ciaxsdojimcupxzpbpev`.

---

## 1. Runtime and build

| Item | Value |
| --- | --- |
| Runtime | Cloudflare Workers (`cloudflare-module` Nitro preset) |
| Compatibility flag | `nodejs_compat` (required) |
| Compatibility date | `>= 2025-01-01` |
| Node for building | Node 22 / Bun (local build only) |
| Build command | `bun install --frozen-lockfile && bun run build` |
| Server bundle | `dist/server` (entry + generated `wrangler.json`) |
| Client assets | `dist/client` (served by the Worker assets binding) |
| Start command | none — Workers are event-driven; `npx wrangler deploy --config dist/server/wrangler.json` |
| Worker name | `munchreach` |

The deploy script rewrites `dist/server/wrangler.json` with the worker name,
`nodejs_compat`, observability, and the two custom domains. The app is **not**
rewritten — only the generated deploy config is pinned.

## 2. Environment variables

Fill every key in `.env.production.example`. No values live in the repo.

- Build-time (baked into the client, must be exported **before** `bun run build`):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_PROJECT_ID` (= `ciaxsdojimcupxzpbpev` in this phase),
  `VITE_APP_URL=https://munchreach.com`.
- Worker secrets (`wrangler secret put NAME --config dist/server/wrangler.json`):
  everything else in the template — Supabase URL/keys + `SB_SERVICE_ROLE_KEY`,
  `PROVIDER_CREDENTIALS_KEY`, cron secrets, inbound/webhook signing secrets,
  referral secrets, sending-DNS values, provider API keys.
- `APP_URL=https://munchreach.com` and `PUBLIC_APP_URL=https://munchreach.com`.

**`PROVIDER_CREDENTIALS_KEY` must be copied byte-identical from the current
production environment.** Do not generate or rotate it — every stored provider
and AI credential is encrypted with it and would fail to decrypt.

## 3. DNS / Cloudflare changes (perform manually, outside Lovable)

Current state: `munchreach.com` resolves to the old LiteSpeed/PHP host.

1. Add `munchreach.com` as a zone in the Cloudflare dashboard (Websites → Add site).
2. At the registrar, replace the current nameservers with the two Cloudflare
   nameservers shown for the zone. Wait for the zone to report **Active**.
3. Import/keep all existing non-web records unchanged — especially email:
   `MX`, `SPF` (`TXT @`), `DKIM`, `DMARC`, and any sending/tracking CNAMEs.
4. Remove the old web records that point at the LiteSpeed host:
   - `A  @   <old-host-IP>`
   - `A|CNAME  www  <old-host>`
5. Attach the Worker custom domains (done automatically by the deploy script, or
   Workers & Pages → munchreach → Settings → Domains & Routes → Add custom domain):
   - `munchreach.com`
   - `www.munchreach.com`
   Cloudflare then creates the proxied records for both and issues certificates.

Nothing else is required; do **not** add manual `A`/`CNAME` records for the app —
custom domains manage them.

## 4. SSL/TLS

- SSL/TLS → Overview: **Full (strict)**.
- Edge Certificates: **Always Use HTTPS** = On, **Automatic HTTPS Rewrites** = On,
  Minimum TLS 1.2, HSTS optional (enable only after the cutover is verified).
- Certificates for both custom domains are issued automatically by Cloudflare.

## 5. Deployment

```bash
export CLOUDFLARE_API_TOKEN=...   # Workers Scripts:Edit + Workers Routes:Edit + Zone:Read
export CLOUDFLARE_ACCOUNT_ID=...
./scripts/deploy-production.sh
```

The script: safety-checks the Supabase project → builds → pins the worker config
→ deploys → attaches the custom domains → runs the smoke tests.

## 6. Smoke tests run automatically

SSR: `/`, `/pricing`, `/blog` → 200.

API (a 400/401/403 proves the route is live and enforcing verification):

- `/api/public/inbound/email`
- `/api/public/billing/stripe`, `/paddle`, `/lemonsqueezy`
- `/api/public/integrations/:slug`
- `/api/public/automations/:token`
- `/api/public/referral/billing`
- `/api/public/cron/*` (run-campaigns, run-warmup, run-automations,
  run-transactional-email, run-ai-personalization, reconcile-delivery,
  retry-inbound, recheck-domains, provider-health)
- `/api/public/media/*`

Must stay absent: `/api/public/webhooks/*` → 404. Payment webhooks remain at
`/api/public/billing/{stripe,paddle,lemonsqueezy}`.

The script also fails if `server: LiteSpeed` or `x-powered-by: PHP` is still
returned, which means DNS has not moved yet.

## 7. Checklist

- [ ] Cloudflare zone active for `munchreach.com`
- [ ] All secrets pushed (`wrangler secret list` matches the template)
- [ ] `PROVIDER_CREDENTIALS_KEY` identical to current production
- [ ] `VITE_SUPABASE_PROJECT_ID = ciaxsdojimcupxzpbpev`
- [ ] `bun run build` succeeds; `dist/client` + `dist/server` present
- [ ] Worker deployed as `munchreach`
- [ ] Custom domains `munchreach.com` + `www.munchreach.com` attached
- [ ] Old LiteSpeed `A`/`CNAME` web records removed, email records untouched
- [ ] SSL Full (strict) + Always Use HTTPS
- [ ] Smoke tests pass
- [ ] Cron jobs NOT created, production webhooks NOT activated, Supabase NOT cut over
