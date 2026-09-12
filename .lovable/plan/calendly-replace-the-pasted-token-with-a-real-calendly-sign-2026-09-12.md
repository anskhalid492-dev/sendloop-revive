# Calendly: replace the pasted token with a real Calendly sign-in

## What is there today

- The Calendly card in **Settings → Integrations** asks the customer to paste a Calendly personal access token. That token is what is failing with "Calendly rejected the token (403)" — pasted personal tokens expire, get revoked, or belong to an account without API access.
- Calendly is currently **outbound only**: MunchReach can send a "meeting booked" event to it, but nothing ever comes back from Calendly. Booked meetings are therefore never detected automatically today.
- Meetings already count everywhere from one place: a contact marked as `meeting_booked` plus an activity row. Dashboard "Meetings", campaign meeting counts and the CRM all read that. The new Calendly path will write exactly that, so nothing about campaign, sequence or analytics logic changes.

## What will change

### 1. Connect flow (customer side)
- The token field disappears. The card gets a single **Connect Calendly** button that sends the customer to Calendly's own approval screen and back.
- The connection is only marked connected after Calendly's own API confirms the account (`GET /users/me`, API v2). No fake success state.
- Once connected, the card shows the real Calendly name and email, plus **Reconnect** and **Disconnect**. Disconnect revokes the access at Calendly, removes the webhook subscription and deletes the stored connection.
- Existing card design, plan gating, owner/admin-only rule and activity log stay exactly as they are.

### 2. Booked meetings flowing back in
- On connect, MunchReach registers a Calendly webhook subscription for `invitee.created`, `invitee.canceled` and (where Calendly sends it) reschedules.
- Every incoming Calendly call is signature-verified and de-duplicated, so a retry never counts a meeting twice.
- The invitee's email is matched to the contact, and through the contact to the campaign and the exact sequence step that was last sent to them. That produces: contact marked as meeting booked, a CRM activity entry, the meeting counted in campaign analytics and the dashboard, and the existing automation trigger firing. A cancellation reverses the meeting state and logs it.
- Anything that cannot be matched to a contact is logged as an unmatched event rather than silently dropped.

### 3. Security
- Everything happens on the server: the app secret, the customer's access token and refresh token never reach the browser.
- Tokens are stored encrypted with the same encryption already used for other provider credentials.
- Every Calendly operation re-checks that the signed-in user belongs to that workspace, and one workspace can never read another workspace's Calendly connection.
- The approval link is tied to a signed, single-use, expiring state value, so the callback cannot be replayed or pointed at another workspace.
- Access tokens are refreshed automatically; if Calendly says the authorization was revoked, the card flips to "needs attention" with a Reconnect prompt instead of failing silently.

## What I need from you

Calendly per-customer sign-in requires a **Calendly OAuth application**, created once by you in Calendly's developer portal (developer.calendly.com → My OAuth apps). During setup add these two redirect URLs:

- `https://munchreach.com/api/public/integrations/calendly/callback`
- `https://id-preview--1068fd05-79ee-44fc-9230-0fbdfc76d42c.lovable.app/api/public/integrations/calendly/callback` (for testing before publishing)

Calendly then gives you a **Client ID** and **Client Secret**. I'll ask for both through the secure form once you approve this plan — they are stored server-side and never shown to customers.

Honest note on scopes: Calendly's OAuth has no scope picker. An approved app gets the access level of the person who approved it, so "minimum scopes" is not something we choose — the narrowing we can do is only calling the endpoints we need (`/users/me`, webhook subscription, scheduled event lookup) and requesting the webhook subscription at user level rather than whole-organization level, which is what I'll do.

## Technical notes

- New `src/lib/calendly.server.ts`: authorize URL, code exchange, refresh, `GET /users/me`, webhook subscription create/delete, revoke — all Calendly API v2.
- New public routes `src/routes/api/public/integrations/calendly/callback.ts` (state check + code exchange) and `.../calendly/webhook.ts` (signature verify, dedupe via `integration_events.idempotency_key`, attribution).
- Extend `integrations.functions.ts` with `startCalendlyOAuth` / `disconnectCalendly`; catalog entry `authType: "oauth"`, no secret field; `verifyIntegration`'s Calendly branch becomes token-based verification used by the callback.
- Attribution helper resolves lead → `campaign_recipients` → last sent `campaign_messages` step, writes `leads.status`, `lead_activities`, and emits the existing `meeting.booked` automation event.
- Migration: additive columns/config only (webhook signing key + Calendly user/organization URIs held in the encrypted credential blob and connection config). No changes to campaign, message or analytics tables.
- Verification: real OAuth round trip in the preview environment with a throwaway test workspace only, per the scoped-testing rule.
