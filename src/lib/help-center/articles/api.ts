import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const API_ARTICLES: HelpArticle[] = [
  {
    slug: "api-overview",
    title: "MunchReach API overview",
    description:
      "What the MunchReach Public API v1 covers, where the base URL is, and how to make your first call.",
    category: "api",
    updated: UPDATED,
    popular: true,
    keywords: ["api", "rest", "developer", "v1", "integration", "base url"],
    related: ["api-authentication", "api-keys", "api-request-response", "api-pagination"],
    content: `MunchReach exposes a REST API at \`/api/public/v1\`. Everything you can do on the dashboard for campaigns, sequence steps, contacts, replies and analytics has an API equivalent, and every request is scoped to one workspace.

## When you need this
Use the API when you want to push contacts from your own system, create and launch campaigns programmatically, or pull performance data into a reporting tool.

## Base URL
All endpoints live under \`https://munchreach.com/api/public/v1\`.

## What the API covers
- \`GET /me\` — verify a key and see its workspace, scopes and rate limit
- Campaigns — list, create, retrieve, update, delete, launch/pause/resume/stop, stats
- Sequences — list, add, update and delete steps on a campaign
- Contacts — list, create or update, retrieve, update, delete, bulk operations, CSV export
- Mailboxes — list and retrieve connected mailboxes (read only)
- Replies — list inbound replies with sentiment classification
- Analytics — workspace-level performance
- Webhooks — create, list, update and delete endpoints, plus delivery history

## Your first call
Create a key in Settings → API Keys, then verify it:

\`curl -H "Authorization: Bearer $MUNCHREACH_API_KEY" https://munchreach.com/api/public/v1/me\`

A 200 response returns the workspace name and the scopes the key carries. A 401 means the key is wrong, revoked or expired.

## Important notes
- There is no workspace parameter anywhere in the API. A key resolves to exactly one workspace, so you cannot read another workspace's data with it.
- The full interactive reference, with request and response examples in cURL, JavaScript and Python, lives on the API reference page.

## Common problems
- **404 on every path** — you left \`/api/public/v1\` off the URL.
- **401 on \`/me\`** — the key is not being sent as \`Authorization: Bearer …\`.`,
    faqs: [
      {
        q: "Is there an OpenAPI document?",
        a: "Yes. The API reference page is generated from the same machine-readable catalog that the router serves, and an OpenAPI document is published from it.",
      },
      {
        q: "Is the API available on every plan?",
        a: "API access follows your plan's entitlements. If key creation is locked, check Settings → Billing for your current plan.",
      },
    ],
  },
  {
    slug: "api-authentication",
    title: "MunchReach API authentication",
    description: "How bearer tokens work, what scopes do, and how to debug a 401 or 403.",
    category: "api",
    updated: UPDATED,
    popular: true,
    keywords: ["bearer", "token", "401", "403", "scope", "authorization header"],
    related: ["api-keys", "api-overview", "api-errors", "api-troubleshooting"],
    content: `Every API request carries a bearer token:

\`Authorization: Bearer mr_live_…\`

## Short answer
No header, no access. The key identifies both the caller and the workspace, so there is no separate workspace ID to pass.

## Scopes
A key is created with an explicit set of scopes and can only do what those scopes allow:

- \`campaigns:read\`, \`campaigns:write\`
- \`contacts:read\`, \`contacts:write\`
- \`sequences:read\`, \`sequences:write\`
- \`mailboxes:read\`
- \`analytics:read\`
- \`replies:read\`
- \`webhooks:read\`, \`webhooks:write\`

Two blanket scopes also exist: \`read\` (read access to everything the API exposes) and \`write\` (read and write access to everything).

## Checking what a key can do
\`GET /me\` returns the key's workspace, its scopes and its per-minute rate limit. Call it first whenever an integration misbehaves.

## Error responses
- \`401 unauthorized\` / \`invalid_api_key\` — missing or malformed key
- \`401 api_key_revoked\` — the key was revoked in Settings → API Keys
- \`401 api_key_expired\` — the key passed its expiry date
- \`403 insufficient_scope\` — the key is valid but lacks the scope for that endpoint

## Important notes
Treat a key like a password. Store it in an environment variable or a secret manager, never in front-end code or a public repository.`,
    faqs: [
      {
        q: "Can one key access several workspaces?",
        a: "No. A key resolves to exactly one workspace. Create a separate key per workspace.",
      },
      {
        q: "Can I widen a key's scopes later?",
        a: "Create a new key with the scopes you need and revoke the old one. Scopes are fixed at creation so an existing integration's blast radius cannot silently grow.",
      },
    ],
  },
  {
    slug: "api-keys",
    title: "Creating and revoking API keys",
    description: "Create a scoped key, store it safely, rotate it and revoke it when it leaks.",
    category: "api",
    updated: UPDATED,
    keywords: ["api key", "create key", "revoke", "rotate", "secret"],
    related: ["api-authentication", "api-key-security", "api-overview"],
    content: `## Create a key
1. Go to Settings → API Keys.
2. Click Create key.
3. Name it after the system that will use it, so you know what breaks if you revoke it.
4. Pick scopes. The dialog groups them as Blanket, Campaigns, Contacts, Sequences, Mailboxes, Analytics, Replies and Webhooks.
5. Save, then copy the key.

The full key value is shown once, at creation. After that only a prefix is stored for identification, so MunchReach cannot show it to you again.

## Revoke a key
In Settings → API Keys, revoke the key. Revocation takes effect on the next request, which then fails with \`api_key_revoked\`.

## Rotation
Rotate by creating the replacement first, deploying it, confirming traffic on the new key, then revoking the old one. That avoids downtime.

## Important notes
- Give each integration its own key with the narrowest scopes it needs.
- If a key ever appears in a log, a screenshot or a repository, revoke it immediately — there is no way to un-leak it.`,
  },
  {
    slug: "api-request-response",
    title: "API request and response format",
    description: "JSON conventions, the data envelope, idempotency keys and content types.",
    category: "api",
    updated: UPDATED,
    keywords: ["json", "envelope", "idempotency", "content-type", "response shape"],
    related: ["api-pagination", "api-errors", "api-overview"],
    content: `## Requests
Send JSON with \`Content-Type: application/json\` on any request that has a body. Path parameters are UUIDs.

## Responses
Successful responses wrap the payload in a \`data\` key:

\`\`\`
{ "data": { "object": "campaign", "id": "…", "name": "Q4 outbound" } }
\`\`\`

Collections return an array in \`data\` plus a \`pagination\` object.

## Idempotency
Write endpoints that create or trigger something accept an \`x-idempotency-key\` header. Send a unique value (a UUID) per logical operation and retry with the same value: the second call returns the first call's result instead of doing the work twice.

If a retry arrives while the first call is still running you get \`409 idempotency_in_progress\`; wait and retry. If the same key is reused with a different body you get \`409 idempotency_conflict\`.

## Important notes
- Payloads above the size limit return \`413 payload_too_large\`.
- A non-JSON content type on a body request returns \`415 unsupported_media_type\`.
- Unknown methods on a valid path return \`405 method_not_allowed\`.`,
  },
  {
    slug: "api-pagination",
    title: "API pagination",
    description: "How cursor pagination works and how to walk a full collection safely.",
    category: "api",
    updated: UPDATED,
    keywords: ["cursor", "limit", "next_cursor", "paging", "pagination"],
    related: ["api-request-response", "api-contacts", "api-campaigns"],
    content: `Every collection endpoint uses cursor pagination, not offsets.

## Parameters
- \`limit\` — page size, 1 to 100 on most collections (the server caps oversized values)
- \`cursor\` — the opaque \`pagination.next_cursor\` value from the previous page

## Walking a collection
1. Request the first page with just \`limit\`.
2. Read \`pagination.next_cursor\` from the response.
3. Request the next page with that cursor.
4. Stop when \`next_cursor\` is null.

## Why cursors
Results are ordered by creation time descending. With offsets, rows inserted while you page cause records to be skipped or repeated. A cursor points at a fixed position, so paging stays stable during writes.

## Important notes
Cursors are opaque. Do not parse, build or store them long term — treat them as a token that is valid for the next request in the same sequence.`,
  },
  {
    slug: "api-rate-limits",
    title: "API rate limits",
    description: "The per-minute limit, the 429 response and how to back off correctly.",
    category: "api",
    updated: UPDATED,
    keywords: ["429", "rate limit", "retry-after", "throttle", "too many requests"],
    related: ["api-errors", "api-troubleshooting", "api-authentication"],
    content: `Each API key has a per-minute request limit. The default is 120 requests per minute; \`GET /me\` reports the exact figure for your key as \`rate_limit_per_minute\`.

## When you exceed it
The API returns \`429 rate_limited\` with a \`Retry-After\` header, in seconds, telling you when the current window resets.

## How to handle it
1. Read \`Retry-After\` and wait that long — do not retry immediately.
2. Use exponential backoff with jitter on top for repeated 429s.
3. Batch where possible: \`POST /contacts/bulk\` moves many contacts in one request instead of one call per contact.
4. Page with a larger \`limit\` rather than making many small requests.

## Important notes
The limit is per key. Splitting a workload across several keys to dodge the limit is not supported and can trip abuse protection.`,
  },
  {
    slug: "api-errors",
    title: "API error handling",
    description: "The error envelope, every error code and what each one means.",
    category: "api",
    updated: UPDATED,
    keywords: ["error", "status code", "422", "409", "500", "invalid_request"],
    related: ["api-troubleshooting", "api-authentication", "api-request-response"],
    content: `Errors always return the same shape, with a machine-readable \`code\` and a human message. Database errors, stack traces and SQL are never surfaced; anything unexpected becomes \`internal_error\` and the detail is logged against the request id you received.

## Codes by status
**401** — \`unauthorized\`, \`invalid_api_key\`, \`api_key_revoked\`, \`api_key_expired\`
**403** — \`insufficient_scope\`, \`forbidden\`
**404** — \`not_found\`, \`campaign_not_found\`, \`contact_not_found\`, \`mailbox_not_found\`, \`reply_not_found\`, \`webhook_not_found\`, \`job_not_found\`
**405** — \`method_not_allowed\`
**409** — \`conflict\`, \`idempotency_conflict\`, \`idempotency_in_progress\`
**413** — \`payload_too_large\`
**415** — \`unsupported_media_type\`
**422** — \`invalid_request\` (validation failed; the details list the offending fields)
**429** — \`rate_limited\`
**500** — \`internal_error\`

## How to handle them
- Retry only \`429\`, \`500\` and network failures. Everything else is a bug in the request.
- Log the request id from the response with your error so support can trace it.
- Treat \`422\` details as the source of truth for what to fix.`,
  },
  {
    slug: "api-campaigns",
    title: "Campaign API",
    description: "List, create, update, control and measure campaigns over the API.",
    category: "api",
    updated: UPDATED,
    keywords: ["campaign api", "launch", "pause", "resume", "stop", "stats"],
    related: ["api-sequences", "api-analytics", "api-overview", "campaign-statuses"],
    content: `Scopes: \`campaigns:read\` to read, \`campaigns:write\` to change or control.

## Endpoints
- \`GET /campaigns\` — list, cursor paginated
- \`POST /campaigns\` — create a campaign
- \`GET /campaigns/{campaign_id}\` — retrieve one
- \`PATCH /campaigns/{campaign_id}\` — update settings
- \`DELETE /campaigns/{campaign_id}\` — delete
- \`POST /campaigns/{campaign_id}/actions/{action}\` — \`launch\`, \`pause\`, \`resume\` or \`stop\`
- \`GET /campaigns/{campaign_id}/stats\` — per-campaign performance

## Launching
The actions endpoint runs the same services the dashboard uses, so plan limits, launch readiness checks and queue handling behave identically. A campaign that is not ready to launch in the UI will not launch over the API either — the response explains what is missing.

Launch is idempotent: send \`x-idempotency-key\` and a retried call will not double-queue the audience.

## Important notes
A large audience is queued in controlled batches. The campaign becomes active once the whole audience is queued; until then it stays in draft.`,
  },
  {
    slug: "api-sequences",
    title: "Sequence API",
    description: "Read and edit a campaign's sequence steps programmatically.",
    category: "api",
    updated: UPDATED,
    keywords: ["sequence api", "steps", "follow-up", "sequence step"],
    related: ["api-campaigns", "api-overview", "create-follow-ups"],
    content: `Scopes: \`sequences:read\` and \`sequences:write\`.

## Endpoints
- \`GET /campaigns/{campaign_id}/sequence\` — list steps in order
- \`POST /campaigns/{campaign_id}/sequence\` — add a step
- \`PATCH /campaigns/{campaign_id}/sequence/{step_id}\` — update a step
- \`DELETE /campaigns/{campaign_id}/sequence/{step_id}\` — remove a step

## Important notes
- Steps carry a subject, a body and a wait interval relative to the previous step, exactly as in the sequence editor.
- Editing a sequence on an active campaign affects steps that have not been queued yet; already-scheduled messages keep the copy they were rendered with.`,
  },
  {
    slug: "api-contacts",
    title: "Lead & contact API",
    description: "Create, update, bulk-modify, export and delete contacts over the API.",
    category: "api",
    updated: UPDATED,
    keywords: ["contacts api", "leads api", "bulk", "upsert", "csv export"],
    related: ["api-pagination", "api-overview", "csv-import-guide"],
    content: `Scopes: \`contacts:read\` and \`contacts:write\`.

## Endpoints
- \`GET /contacts\` — list and filter, cursor paginated
- \`POST /contacts\` — create or update a contact (upsert by email)
- \`GET /contacts/{contact_id}\` — retrieve one
- \`PATCH /contacts/{contact_id}\` — update fields
- \`DELETE /contacts/{contact_id}\` — delete
- \`POST /contacts/bulk\` — create, update or delete many in one request
- \`GET /contacts/export\` — export as CSV

## Important notes
- Contacts are unique per workspace and email address, so \`POST /contacts\` with an existing address updates that record rather than creating a duplicate.
- Use \`/contacts/bulk\` with an idempotency key for imports; it is far kinder to the rate limit than a call per row.
- Suppressed addresses stay suppressed. Re-creating a contact does not clear a bounce or unsubscribe record.`,
  },
  {
    slug: "api-mailboxes",
    title: "Mailbox API",
    description: "Read connected mailboxes, their health and their sending stats.",
    category: "api",
    updated: UPDATED,
    keywords: ["mailbox api", "sending accounts", "health"],
    related: ["api-overview", "mailbox-health", "api-authentication"],
    content: `Scope: \`mailboxes:read\`. The mailbox API is read-only — mailboxes are connected and configured in the dashboard.

## Endpoints
- \`GET /mailboxes\` — list connected mailboxes with status, health and sending stats
- \`GET /mailboxes/{mailbox_id}\` — retrieve one

## What to use it for
Monitoring. Poll the list on a schedule and alert your team when a mailbox leaves the active state or its health drops, instead of finding out when a campaign stalls.`,
  },
  {
    slug: "api-replies",
    title: "Inbox & replies API",
    description: "Pull inbound replies, with their sentiment classification, into your own systems.",
    category: "api",
    updated: UPDATED,
    keywords: ["replies api", "inbox api", "sentiment", "inbound"],
    related: ["api-webhooks", "unified-inbox", "api-overview"],
    content: `Scope: \`replies:read\`.

## Endpoint
- \`GET /replies\` — list inbound replies with their sentiment classification, cursor paginated

## Polling versus webhooks
For near-real-time delivery to your own CRM, subscribe to the \`reply.received\` webhook event instead of polling. Use \`GET /replies\` for backfills and reconciliation.

## Important notes
Sending a reply is done from the unified inbox; the API exposes replies for reading.`,
  },
  {
    slug: "api-analytics",
    title: "Analytics API",
    description: "Read workspace-level performance numbers that match the dashboard.",
    category: "api",
    updated: UPDATED,
    keywords: ["analytics api", "metrics", "reporting api", "stats"],
    related: ["api-campaigns", "reading-analytics", "api-overview"],
    content: `Scope: \`analytics:read\`.

## Endpoints
- \`GET /analytics\` — workspace-level performance
- \`GET /campaigns/{campaign_id}/stats\` — the same metrics scoped to one campaign

## Important notes
The numbers match the dashboard because they come from the same deduplicated event data. If an API figure and a dashboard figure disagree, check the date range you passed before assuming a bug.`,
  },
  {
    slug: "api-webhooks",
    title: "Webhooks: events, payloads and signatures",
    description: "Subscribe to MunchReach events, verify signatures and handle retries.",
    category: "api",
    updated: UPDATED,
    popular: true,
    keywords: ["webhook", "event", "signature", "hmac", "retry", "delivery"],
    related: ["api-webhooks-troubleshooting", "api-authentication", "api-overview"],
    content: `Scopes: \`webhooks:read\` and \`webhooks:write\`.

## Endpoints
- \`GET /webhooks\` — list endpoints
- \`POST /webhooks\` — create an endpoint
- \`PATCH /webhooks/{webhook_id}\` — update an endpoint
- \`DELETE /webhooks/{webhook_id}\` — delete an endpoint
- \`GET /webhooks/{webhook_id}/deliveries\` — delivery history

## Supported events
\`email.sent\`, \`email.delivered\`, \`email.opened\`, \`email.clicked\`, \`email.bounced\`, \`email.failed\`, \`email.unsubscribed\`, \`reply.received\`, \`campaign.launched\`, \`campaign.completed\`, \`campaign.paused\`, \`contact.created\`, \`contact.updated\`, \`contact.replied\`.

## Headers on every delivery
- \`x-munchreach-event\` — the event name
- \`x-munchreach-delivery\` — a unique delivery id
- \`x-munchreach-timestamp\` — the Unix timestamp that was signed
- \`x-munchreach-signature\` — \`v1=<hex HMAC-SHA256>\`

## Verifying a signature
Compute HMAC-SHA256 over the exact string \`v1:<timestamp>:<raw body>\` using your endpoint secret, and compare it to the hex value after \`v1=\` with a constant-time comparison. Verify against the raw body bytes, before any JSON parsing. Reject deliveries whose timestamp is far from your clock — that is what stops replays.

## Retries
A delivery is retried when your endpoint does not return a 2xx. Backoff is 1 minute, 5 minutes, 15 minutes, 1 hour, 6 hours, then 24 hours.

## Important notes
Respond 2xx quickly and process asynchronously. A slow handler causes timeouts, which look like failures and trigger retries.`,
  },
  {
    slug: "api-webhooks-troubleshooting",
    title: "Webhook troubleshooting",
    description: "Deliveries failing, signatures not matching, duplicate events.",
    category: "api",
    updated: UPDATED,
    keywords: ["webhook not working", "signature mismatch", "duplicate webhook", "retries"],
    related: ["api-webhooks", "api-troubleshooting", "api-errors"],
    content: `## Problem
Your endpoint is not receiving events, or it rejects them.

## Possible causes
- The endpoint is not publicly reachable, or sits behind authentication that blocks the request.
- Your handler returns a non-2xx status, so every delivery is treated as failed.
- The signature is computed over parsed JSON instead of the raw body.
- The events you care about were not selected on the endpoint.

## How to check
1. Call \`GET /webhooks/{webhook_id}/deliveries\` and read the recorded status and response for recent attempts.
2. Log the four \`x-munchreach-*\` headers and the raw body on your side.
3. Recompute the signature manually over \`v1:<timestamp>:<raw body>\` and compare.

## How to fix
- Return 2xx as soon as you have stored the payload; do the work afterwards.
- Serialise nothing before verifying — capture the raw body first.
- De-duplicate on \`x-munchreach-delivery\`; retries mean the same event can arrive more than once.

## When to contact support
If deliveries show as failed with no response recorded and your endpoint is reachable from the public internet, send the delivery ids to support.`,
  },
  {
    slug: "api-troubleshooting",
    title: "API troubleshooting",
    description: "The fastest checks for 401, 403, 404, 422 and 429 responses.",
    category: "api",
    updated: UPDATED,
    keywords: ["api not working", "401", "403", "422", "429", "debug api"],
    related: ["api-errors", "api-authentication", "api-rate-limits", "api-keys"],
    content: `## Problem
An API call fails and you need to know whether it is the key, the scopes, the URL or the payload.

## How to check, in order
1. Call \`GET /me\`. A 200 proves the key, the header format and the base URL are all correct.
2. Compare the scopes it returns with the scope the endpoint requires.
3. Re-read the path: every v1 path starts with \`/api/public/v1\`, and ids are UUIDs.
4. For a 422, read the \`details\` array — it names the invalid fields.
5. For a 429, read \`Retry-After\` and back off.

## How to fix
- \`401\` — fix the \`Authorization: Bearer …\` header, or the key was revoked or expired; create a new one.
- \`403 insufficient_scope\` — create a key with the needed scope; scopes are fixed at creation.
- \`404\` — the id belongs to another workspace or was deleted.
- \`409 idempotency_conflict\` — you reused an idempotency key with a different body.
- \`500\` — retry once with backoff, then send support the request id.

## When to contact support
Persistent \`internal_error\` responses. Include the request id, the endpoint and the approximate timestamp.`,
  },
  {
    slug: "api-key-security",
    title: "API security best practices",
    description: "Scope narrowly, store secrets properly, rotate on schedule and monitor use.",
    category: "api",
    updated: UPDATED,
    keywords: ["api security", "secret", "leak", "rotation", "least privilege"],
    related: ["api-keys", "api-authentication", "security-best-practices"],
    content: `## Short answer
One key per integration, the fewest scopes that integration needs, stored in a secret manager, rotated on a schedule.

## Practices that matter
1. **Least privilege.** A reporting job needs \`analytics:read\`, not \`write\`.
2. **Never in the browser.** A key in front-end code is public. Call MunchReach from your server.
3. **Never in source control.** Use environment variables or a secret manager; add \`.env\` to \`.gitignore\`.
4. **Rotate.** Create the replacement, deploy, verify, then revoke the old key.
5. **Revoke fast.** A suspected leak is a leak. Revoking is instant and free.
6. **Verify webhooks.** Always check the signature before trusting a payload; an unverified endpoint accepts anything anyone posts to it.

## Important notes
MunchReach shows a key's value only once, at creation, and stores only a prefix afterwards. Support cannot recover a lost key — create a new one.`,
  },
];
