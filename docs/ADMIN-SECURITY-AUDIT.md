# MunchReach Admin Security Audit & Hardening

Status: **NEEDS ATTENTION → HARDENED** (all findings below fixed unless marked "Residual risk").

## Findings

### Critical
1. **Admin audit log was mutable.** `admin_audit_log` allowed UPDATE/DELETE by privileged code, so staff could erase their own history.
   *Fixed:* append-only DB triggers on `admin_audit_log` and the new `admin_security_events`; UPDATE/DELETE now raise.
2. **No MFA requirement for the admin area.** A stolen password was enough to reach every privileged operation.
   *Fixed:* Supabase Auth TOTP enrollment/step-up gate in the admin layout, plus server-side AAL2 enforcement inside `assertSuperAdmin` / `assertPlatformAdmin` for sensitive actions.

### High
3. **No session revocation.** A compromised admin session could not be killed without rotating global keys.
   *Fixed:* `admin_sessions` registry (device, IP, AAL, last activity) with per-session and bulk revocation, surfaced at Admin → Security & Sessions. Revoked sessions fail their next privileged call.
4. **No re-authentication for destructive actions.** Deletions, credential and plan changes ran on any live session.
   *Fixed:* `{ sensitive: true }` guards require AAL2 + authentication within the last 15 minutes and are rate limited.
5. **No rate limiting on privileged endpoints.** Brute forcing admin actions/MFA codes was unbounded.
   *Fixed:* server-side `admin_rate_limits` buckets on sensitive operations and MFA attempts.
6. **Support console lacked session/MFA checks.** `assertStaff` verified only the role.
   *Fixed:* routed through `enforceAdminSessionPolicy`.

### Medium
7. **Coarse admin role.** Every admin had every capability.
   *Fixed:* `admin_permission_grants` with least-privilege permissions (billing, support, content, security, customers, export, infrastructure); super admin retains all.
8. **Raw database errors surfaced to admin UI.** `safeAdminError` now returns customer-safe text; details stay in server logs.
9. **Missing baseline security headers.**
   *Fixed:* `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `HSTS` in `src/start.ts`.

### Low
10. No security event visibility. *Fixed:* Admin → Security & Sessions shows the append-only event feed with result, IP and device.

### Pass (verified, unchanged)
- Every admin server function runs behind `requireSupabaseAuth` and re-checks the role server-side; no client-trusted admin state.
- RLS policies unchanged; `SECURITY DEFINER` functions retain `search_path = public` and authorize the caller.
- Stripe/inbound webhook signature verification and idempotency untouched.
- No secrets in the client bundle: secret keys are read via `process.env` inside handlers only; provider secret tables are service-role only.

## Changes made
- New migration: `admin_sessions`, `admin_security_events`, `admin_permission_grants`, `admin_rate_limits`, append-only triggers.
- `src/lib/admin-security.server.ts` (security core), `src/lib/admin-security.functions.ts` (console RPCs).
- Hardened guards: `admin-access.server.ts`, `billing/access.server.ts`, `admin-support.functions.ts`.
- Sensitive-action guards across `admin.functions.ts`, `admin-directory.functions.ts`, `admin-platform.functions.ts`, `billing-admin.functions.ts`.
- UI: `AdminMfaGate`, `/admin/security`, AdminShell nav entry, security headers.

## Tests performed
- Typecheck clean.
- Unauthenticated call to an admin server function → rejected (no data leaked).
- Non-admin → role check denies before any query runs.
- Response headers verified on the running app (see list above).
- Append-only enforcement verified: UPDATE/DELETE on `admin_audit_log` raises `admin_audit_log is append-only`.

## Residual risks
- MFA is enforced at the admin surface; individual customer accounts remain single-factor by design.
- Admin session lifetime still follows the Supabase project JWT/refresh settings; shortening it further is an auth-provider setting, not app code.
- No enforcing CSP yet (Stripe/Supabase/font origins need a measured rollout in report-only mode first).
