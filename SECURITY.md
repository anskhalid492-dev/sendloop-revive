# Sendloop — Phase 10 Security, Audit & Production Test Report

Last verified: 2026-08-20 (automated suites re-run against the live backend).

## 1. Access control

| Layer | Control | Verified |
| --- | --- | --- |
| Route gate | `/_authenticated/admin` resolves the platform role server-side (`getAdminIdentity`) and redirects non-admins | Customer session hitting `/admin`, `/admin/users`, `/admin/billing`, `/admin/settings`, `/admin/audit` is redirected away every time |
| Server functions | Every admin handler calls `assertAdmin` / `assertSuperAdmin` from `admin-access.server.ts` before any read or write | 13 admin endpoints (directory, dashboard, plans, credits, subscriptions, providers, billing console, integrations, referral templates, auth settings, system settings, production checks) all returned `Forbidden: (super) admin role required` for a normal customer |
| Roles | Stored only in `public.user_roles`, read through the `has_role` security-definer function | Customer cannot insert into `user_roles` (`permission denied`); `amIAdmin` returns `false` |

`amIAdmin` is intentionally callable by any signed-in user — it is a self-check that returns only a boolean about the caller.

## 2. Tenant isolation (RLS)

53/53 automated isolation assertions pass. Two independent customers with separate workspaces were provisioned, then cross-read, cross-write and escalation were attempted:

- Reads across workspaces return 0 rows for leads, campaigns, sending domains, conversations, automations, warmup settings, credits, credit ledger, subscriptions, support tickets, integration connections, CRM stages, lead activities and campaign messages.
- Writes across workspaces are rejected by RLS (insert lead, rename workspace, delete campaigns, self-join `workspace_members`).
- Workspace RPCs (`analytics_summary`, `workspace_team`, `delete_workspace`) reject non-members, non-owners and anonymous callers.
- Anonymous role cannot read `workspaces`, `leads`, `campaigns`, `profiles`, `user_roles` or `platform_settings`.

## 3. Secrets

- `email_provider_secrets`, `sending_account_secrets`, `integration_secrets` have RLS enabled with **no policies** (deny-all) and are reachable only through the service role inside server code.
- Service-role key, provider API keys and webhook secrets are read with `process.env` inside handlers only; nothing sensitive is exposed through `import.meta.env` or loader data.
- Admin UIs display masked/last-4 representations and never echo stored secret values.

## 4. Privileged jobs

`run_automation_runner`, `run_campaign_scheduler`, `run_warmup_runner`, `run_inbound_retry` and the claim/apply helpers have `EXECUTE` revoked from `anon` and `authenticated`; customer calls fail with `permission denied for function`. They are invoked only by `pg_cron` and by the secret-protected cron routes.

Internal `SECURITY DEFINER` helpers (analytics, CRM, referral, support notification triggers) had their public grants revoked in the same hardening migration.

## 5. Webhooks and public endpoints

| Endpoint | Unauthenticated result |
| --- | --- |
| `/api/public/cron/*` (campaigns, warmup, automations, retry-inbound) | `401 Unauthorized` with no secret and with a wrong secret |
| `/api/public/billing/stripe` / `paddle` / `lemonsqueezy` | `401 Invalid signature` |
| `/api/public/automations/{token}` | `404 Not found` for an unknown token |
| `/api/public/integrations/{slug}` | `401 Missing token` |

Signature checks use HMAC over the raw body with timing-safe comparison, before any parsing or database write.

## 6. Auth

- Email/password with a strength policy; no anonymous sign-ups.
- Google sign-in can be disabled from Admin → Settings → Authentication; `enforceOAuthPolicy` revokes all sessions of a Google-authenticated user globally when the provider is off. Email-authenticated sessions are unaffected (`{ blocked: false }`).
- Sign-out cancels in-flight queries, clears the query cache and replaces history.

## 7. Billing, credits and sending

- Plan, feature, subscription, credit and payment mutations are super-admin only and every change is snapshotted to `admin_audit_log` with before/after JSON (viewable at `/admin/audit`).
- Credit adjustments validate `mode`, `amount >= 0` and a non-empty reason, then assert super admin before touching the ledger.
- Managed sending requires a verified sending domain and server-held provider credentials; customers never receive provider keys.

## 8. Fixes applied in this phase

1. Revoked `EXECUTE` on `run_automation_runner` (and the other job runners/claim helpers) from `anon` and `authenticated` — previously a privileged job could be triggered by any signed-in user.
2. Revoked public grants on 13 internal `SECURITY DEFINER` helper functions.
3. Patched `ensure_crm_stages` so a workspace owner can seed default stages during onboarding before the membership row exists (this previously broke new-workspace creation with a `42501` RLS error).

## 9. Known accepted items

- `plans`, `integrations`, `public_auth_settings`, `public_platform_flags`, `public_review_stats`, `referral_program_public` are readable by `anon` by design — they back public marketing pages and expose no tenant data.
- Deny-all RLS (enabled, zero policies) on the three secret tables is intentional.

## 10. Re-running the tests

- Tenant isolation and escalation suite: `bun /tmp/sec/isolation.ts` (53 assertions).
- Admin surface suite: `python3 /tmp/browser/adm/check_admin.py` (route gates + 13 admin endpoints as a customer).
- Endpoint auth: the curl matrix in section 5.
