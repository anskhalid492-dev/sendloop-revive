# Microsoft 365 OAuth — preparation only

## Exact production Redirect URI

```text
https://munchreach.com/api/public/integrations/microsoft/callback
```

Register this exact, case-sensitive URL under **Microsoft Entra → App registrations → your MunchReach application → Authentication → Add a platform → Web → Redirect URIs**. Do not select SPA or enable implicit access/ID token grants. No trailing slash. The URL is reserved by the prepared source code, **not deployed yet**; registering it does not make it live.

This TanStack Start app uses an authenticated server function for initiation and an app-hosted public server route for the external callback, not new database-hosted Edge Functions. Do not register the backend Auth `/auth/v1/callback` URL: this connects a mailbox, not MunchReach sign-in.

## Microsoft Entra settings

1. Use your own application registration. For customers in different Microsoft 365 organizations, select **Accounts in any organizational directory (multitenant)**. For only your organization, select single tenant. Personal Outlook.com accounts are outside this preparation stage.
2. Under **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, add **Mail.Send, Mail.Read, User.Read, openid, profile, email, offline_access**. Do not select Application permissions. `offline_access` is required to receive refresh tokens; it does not grant mail access by itself.
3. Complete any administrator consent required by your organization/customer tenant's consent policy. Do not add broader permissions to work around a consent failure.
4. Under **Certificates & secrets**, create a client secret with an appropriate expiry and rotation reminder. Store its **Value**, not its Secret ID, securely; do not send it in chat.

## Server-side configuration names

Configure these later through **Project Settings → Secrets**, never committed `.env` files, frontend code, or `VITE_` variables:

| Name | Value source |
|---|---|
| `MICROSOFT_CLIENT_ID` | Application (client) ID from your registration Overview |
| `MICROSOFT_CLIENT_SECRET` | Client secret **Value** from Certificates & secrets |
| `MICROSOFT_TENANT_ID` | `organizations` for multitenant Microsoft 365; Directory (tenant) ID for single tenant |
| `MICROSOFT_REDIRECT_URI` | `https://munchreach.com/api/public/integrations/microsoft/callback` |

None of the four settings was present when inspected. No credentials were requested, fabricated, saved or committed during preparation.

## Existing architecture inspection

- `supabase/config.toml` and the runtime configuration point to project `rihgzkofoxcjljlbvbya`. The database inspection tool is sandbox-bound, so its metadata result is **not production-schema verification**. No production customer/account records were queried or changed.
- Existing customer connections use `mailboxes`, workspace-scoped reads, SMTP/IMAP endpoints and encrypted password references. `customer-mailboxes.functions.ts` creates a connected row only after real endpoint tests. `sending_accounts` holds separate sending/warmup state.
- `customer-mailbox-send.server.ts` sends via the current SMTP relay; `mailbox-imap-poll.server.ts` handles inbox polling. Neither was modified. Existing Google sign-in/connection code was untouched.
- The generated mailbox schema has no dedicated Microsoft Graph OAuth token/refresh lifecycle. Therefore this stage deliberately does **not** write OAuth credentials to password columns, create connected records, or switch transports.

## Prepared security and behavior

- Initiation: POST `/api/public/integrations/microsoft/initiate` delegates to `initiateMicrosoftMailboxOAuth` in `src/lib/microsoft-oauth.functions.ts`, an authenticated server function requiring existing workspace access. Call with the signed-in MunchReach bearer token in the Authorization header and JSON `{ "workspaceId": "<actual authorized workspace UUID>" }`; never put tokens in a URL. It is not mounted in Email Accounts.
- Initiation is restricted to the exact production origin, including the POST Origin header. Preview and `www` cannot initiate a production-bound transaction; start later from `https://munchreach.com`.
- Each transaction uses cryptographic random state plus S256 PKCE. State, initiating user/workspace identity and PKCE verifier are sealed using AES-GCM/HKDF with the real client secret, in a host-only Secure, HttpOnly, SameSite=Lax cookie expiring after ten minutes. No tokens are in the cookie or frontend. Rotating the client secret invalidates pending transactions.
- The callback validates the encrypted cookie, exact state, expiry, configuration binding, callback origin and duplicate query parameters **before** token exchange. It clears the cookie; Microsoft enforces single-use authorization codes and PKCE on redemption. There is no in-memory replay registry or database mutation. A future persistence stage must add atomic durable transaction consumption before any connection writes.
- Codes are exchanged server-side against Microsoft's v2 token endpoint with the exact redirect URI and verifier. Granted mail scopes and refresh-token presence are checked; Graph `/v1.0/me?$select=id` verifies the token's account identity. ID tokens are not consumed as MunchReach sessions or trusted for identity.
- Even after real consent, this preparation-only callback **discards tokens** and says no mailbox was connected. It does not send an email, read message bodies, create a mailbox, or enable inbox access. Provider token bodies, codes, client secrets and account details are not logged or returned. Callback responses prevent caching/referrer leakage; hosting access-log handling of callback query strings still needs deployment review.
- Missing configuration returns HTTP 503, not a fake connected state. Consent rejection, invalid/expired state and failed exchange return clear failures.

## Stop point and next approval

Nothing published, deployed, migrated or activated. Register the Web redirect and prepare the four configuration values above; the endpoint will not work on the live site until an approved deployment.

Before claiming working OAuth, obtain separate approval for deployment and a consent test on an explicitly named throwaway Microsoft 365 account/workspace. Check denied consent, tampered/expired/missing state, replayed code, missing scopes and a genuine successful Graph identity response. Do not test against the customer base.

A complete connected-mailbox feature is a later stage: approved encrypted token persistence, atomic single-use transactions, token refresh/rotation/revocation, workspace ownership revalidation and duplicate prevention, plan-capacity gates, and separately tested Graph sending/inbox adapters. No current sending/inbox feature is changed or claimed functional by this preparation.

## Verification completed in preparation

21 isolated tests passed (10 Microsoft security cases plus 11 existing Slack/HubSpot regressions). Automatic compilation passed. Real Microsoft consent, delegated mail operations and production-schema verification remain untested; no credentials or named test-account session are configured.

References: [Microsoft authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference).