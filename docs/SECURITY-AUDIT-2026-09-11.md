# MunchReach — Independent security audit

Date: 2026-09-11. Scope: application code (`src/`), database (154 public tables,
268 RLS policies), public HTTP routes, secrets handling, third-party
integrations, dependencies. Method: source review + live tests against the
production backend and published site. No remediation applied.

Verdict: **no confirmed cross-tenant data breach path or authentication bypass
was found**, but there are 4 High and 7 Medium issues that should be fixed
before an enterprise/pre-launch sign-off.

---

## Critical

None confirmed.

## High

### H1 — Password-reset / magic-link email endpoints are unauthenticated and unthrottled
`src/lib/auth-email.functions.ts` exposes `requestPasswordResetEmail` and
`requestMagicLinkEmail` as public server functions with no rate limit, captcha
or per-address cooldown. Anyone can loop them to mail-bomb any address, burn
Resend/SES quota and damage sending reputation. Enumeration itself is handled
correctly (missing accounts return the same shape).
**Fix:** per-email and per-IP limit (e.g. 3 / 15 min) using the existing
`admin_rate_limit_hit`-style counter, plus a global hourly ceiling.

### H2 — SSRF through customer-configured webhook URLs
`src/lib/api/v1/resources/webhooks.server.ts` validates only `z.string().url()`;
`src/lib/automation-engine.server.ts` (webhook action) only requires `https://`.
Deliveries are then fetched server-side with the response status (and failure
message) surfaced back to the customer, so `http(s)://169.254.169.254/…`,
`localhost`, or private RFC1918 hosts become a probing oracle from inside the
Worker network.
**Fix:** enforce https + public-IP-only (reject private/loopback/link-local/
metadata hosts after DNS resolution), `redirect: "manual"`, and return only a
generic failure reason to the customer.

### H3 — Weak credential policy
Signup enforces only 8 characters (`src/routes/signup.tsx`) and Supabase
leaked-password protection is **disabled** (confirmed by the database linter).
Combined with no login rate limit of our own, this leaves the tenant open to
credential stuffing.
**Fix:** enable leaked-password protection, require 12+ characters, and require
MFA for platform admins (today MFA is enforced only once a factor is enrolled —
`src/lib/admin-access.server.ts`).

### H4 — 71 `SECURITY DEFINER` functions executable by `anon`
The linter reports 71 definer functions granted to `anon` and 72 to
`authenticated`. Job runners were correctly revoked in an earlier hardening
pass, but the remaining surface has not been individually re-reviewed after the
migration; any definer function that writes or reads tenant data while
executable by `anon` is an authorization bypass.
**Fix:** enumerate `pg_proc.prosecdef` in `public`, keep grants only for the
handful that back public pages (`public_platform_config`,
`public_review_stats`, `referral_program_public`, …), `REVOKE EXECUTE … FROM
anon, authenticated` on the rest.

## Medium

- **M1 — Unfiltered public read on site/CMS tables.** `site_pages`,
  `site_settings`, `site_nav_items`, `blog_media`, `blog_authors`,
  `blog_post_slugs` all have `anon SELECT … USING (true)`. Draft/unpublished
  pages and internal site configuration are therefore world-readable via the
  Data API. Add `status = 'published'` predicates (blog posts already do this).
- **M2 — No Content-Security-Policy.** `src/start.ts` sets nosniff, HSTS,
  frame options and referrer policy but deliberately omits CSP, so any XSS has
  full script and exfiltration capability. Ship a report-only CSP first, then
  enforce.
- **M3 — Unsanitized admin HTML.** `HtmlArticleBody`
  (`src/components/blog/ArticleBody.tsx`) renders CMS HTML through
  `dangerouslySetInnerHTML` with no sanitizer. Trusted-author assumption fails
  the moment an admin/support account is compromised. Sanitize server-side on
  save and on render.
- **M4 — Attacker-chosen `Content-Type` on downloads.** Upload metadata takes
  the client-supplied MIME type (`src/lib/files.functions.ts`), which R2 then
  echoes on presigned GETs — a stored `text/html` attachment executes on the R2
  hostname. Allowlist MIME per category and force
  `Content-Disposition: attachment` for user uploads. No AV/content scanning
  exists either.
- **M5 — Inconsistent cron authentication, secret accepted in the query
  string.** `run-campaigns.ts` accepts `x-sendloop-signature`, `Authorization:
  Bearer` *and* `?token=`; other cron routes accept different subsets. Query
  tokens leak into access logs and referrers. Standardise on one header.
- **M6 — Internal error text returned from public routes.** Seven
  `src/routes/api/public/**` handlers return `error.message` to the caller,
  leaking table/function names. Log detail, return a generic message.
- **M7 — PII in Realtime publication.** `leads` (and referral payout hints) are
  published to Realtime. RLS still applies, but this widens the blast radius of
  any policy mistake; publish only the columns the UI needs, or drop `leads`.
  Also `email_templates.workspace_id` is nullable, which weakens its
  workspace-scoped policies — make it `NOT NULL`.

## Low / Informational

- MFA is not mandatory for super admins (only enforced once enrolled).
- `bun audit` cannot run (registry HTTP 404); the platform dependency scanner
  reports **no high/critical** advisories.
- SES credentials are valid for `SendEmail` but `GetSendQuota`/`ListIdentities`
  return 403 and the account looks sandboxed — operational, not security.
- Nine tables have RLS enabled with zero policies (`*_secrets`,
  `workspace_ai_keys`, `inbound_routes`, `inbound_tests`, `admin_rate_limits`):
  intentional deny-all, service-role only. Verified correct.

## Verified controls (passed)

- **Multi-tenancy:** workspace tables gate on `is_workspace_member` /
  `has_workspace_role`; no anon INSERT/UPDATE/DELETE policy exists anywhere;
  earlier 53-assertion isolation suite passes.
- **Admin authorization:** roles only in `user_roles` via `has_role`
  security-definer; every admin handler goes through `assertSuperAdmin` with
  session-revocation, MFA and re-auth checks.
- **Webhook/callback integrity:** billing (Stripe/Paddle/LemonSqueezy) and
  inbound email verify signatures over the raw body before any parsing or
  write, with timing-safe comparison; unsigned/bad-signature requests returned
  401 in live tests. Idempotency is enforced via `billing_webhook_events`.
- **Public API v1:** SHA-256-hashed keys, scopes, per-key rate limiting, 1 MB
  body cap, Zod validation everywhere, uniform error envelope.
- **Secrets & crypto:** AES-256-GCM with random IV and auth tag for provider
  credentials; single active `PROVIDER_CREDENTIALS_KEY`; nothing sensitive in
  `import.meta.env`, loader data or the database besides encrypted ciphertext.
- **File storage:** all traffic is browser↔R2 with authenticated presigning,
  key-prefix ownership checks, 50 MB cap, 5-minute URLs, traversal-safe key
  validation; no Supabase Storage usage remains.
- **CORS:** no wildcard `Access-Control-Allow-Origin` anywhere; CSRF middleware
  is active for server functions.

## Limits of this audit

602 server functions exist; auth coverage was reviewed by pattern plus targeted
reading, not one-by-one, so an isolated missing guard could remain (H4 is the
systematic version of that risk). Platform-level backups, logs and retention
inside Lovable/Cloudflare are not observable from here.
