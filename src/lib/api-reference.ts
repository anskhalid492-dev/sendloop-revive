/**
 * Source of truth for the public API documentation.
 *
 * Every entry here mirrors a route that actually exists under
 * `src/routes/api/public/*`. Nothing in this file may be invented: methods,
 * paths, auth, payloads, status codes and responses are taken from the
 * handlers themselves. When an endpoint is added or changed, update this file
 * in the same edit so the docs page never drifts from the implementation.
 */

export const API_BASE_URL = "https://munchreach.com";
export const API_VERSION = "2026-08 (public preview)";

export type HttpMethod = "GET" | "POST" | "OPTIONS";

export type Param = {
  name: string;
  type: string;
  required: boolean;
  where: "path" | "query" | "header" | "body";
  description: string;
};

export type ErrorRow = {
  status: number;
  body: string;
  meaning: string;
  action: string;
};

export type Endpoint = {
  id: string;
  method: HttpMethod;
  path: string;
  title: string;
  description: string;
  auth: string;
  source: string;
  params: Param[];
  requestBody?: string;
  responseExample: string;
  errors: ErrorRow[];
  notes?: string[];
  /** Set when the handler does not expose enough detail to document fully. */
  needsReview?: string;
};

export type EndpointGroup = {
  id: string;
  title: string;
  summary: string;
  endpoints: Endpoint[];
};

const IDEMPOTENCY_HEADER: Param = {
  name: "x-idempotency-key",
  type: "string",
  required: false,
  where: "header",
  description:
    "Optional de-duplication key. Repeat deliveries with the same key are acknowledged without being processed twice.",
};

export const API_GROUPS: EndpointGroup[] = [
  {
    id: "leads",
    title: "Leads",
    summary:
      "Push prospects into a workspace from Zapier, Make, Google Sheets, a form or any HTTP client. This is the only endpoint that creates leads over HTTP.",
    endpoints: [
      {
        id: "leads-create",
        method: "POST",
        path: "/api/public/integrations/{slug}",
        title: "Create or update a lead",
        description:
          "Upserts a lead into the workspace that owns the integration connection. Matching is on workspace + email, so sending the same address twice updates the existing lead instead of duplicating it. The connection slug is recorded as the lead source.",
        auth: "Connection token in the `token` query parameter (minimum 16 characters). The token identifies exactly one connection and therefore exactly one workspace.",
        source: "src/routes/api/public/integrations/$slug.ts",
        params: [
          {
            name: "slug",
            type: "string",
            required: true,
            where: "path",
            description:
              "Integration slug of the connection, for example `zapier`, `make` or `google-sheets`.",
          },
          {
            name: "token",
            type: "string",
            required: true,
            where: "query",
            description: "Inbound token generated when the integration was connected.",
          },
          IDEMPOTENCY_HEADER,
          { name: "email", type: "string (email, max 320)", required: true, where: "body", description: "Prospect email address. Stored lowercased." },
          { name: "first_name", type: "string (max 120)", required: false, where: "body", description: "Given name." },
          { name: "last_name", type: "string (max 120)", required: false, where: "body", description: "Family name." },
          { name: "company", type: "string (max 200)", required: false, where: "body", description: "Company name." },
          { name: "job_title", type: "string (max 200)", required: false, where: "body", description: "Job title." },
          { name: "phone", type: "string (max 60)", required: false, where: "body", description: "Phone number." },
          { name: "website", type: "string (max 300)", required: false, where: "body", description: "Company website." },
        ],
        requestBody: `{
  "email": "ada@example.com",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "company": "Example Inc",
  "job_title": "Head of Growth",
  "phone": "+1 555 0100",
  "website": "https://example.com"
}`,
        responseExample: `{
  "ok": true
}`,
        errors: [
          { status: 401, body: `{ "error": "Missing token" }`, meaning: "No token, or shorter than 16 characters.", action: "Send the full token from Settings → Integrations." },
          { status: 401, body: `{ "error": "Invalid token" }`, meaning: "No connection matches this slug and token.", action: "Reconnect the integration and copy the new URL." },
          { status: 403, body: `{ "error": "Connection disabled" }`, meaning: "The connection exists but is disabled.", action: "Re-enable it in the dashboard." },
          { status: 400, body: `{ "error": "Invalid JSON body" }`, meaning: "The body could not be parsed as JSON.", action: "Send `Content-Type: application/json` with valid JSON." },
          { status: 400, body: `{ "error": "Invalid payload", "details": [ … ] }`, meaning: "A field failed validation. Up to five issues are returned.", action: "Fix the reported fields; `email` must be a valid address." },
          { status: 500, body: `{ "error": "Could not store the lead" }`, meaning: "The lead could not be written.", action: "Retry with the same `x-idempotency-key`." },
        ],
        notes: [
          "A duplicate delivery returns `200 { \"ok\": true, \"deduplicated\": true }` instead of writing again.",
          "When no `x-idempotency-key` header is sent, the key defaults to the connection id plus the lowercased email.",
          "Every attempt is written to the integration event log and is visible in Settings → Integrations.",
        ],
      },
      {
        id: "leads-preflight",
        method: "OPTIONS",
        path: "/api/public/integrations/{slug}",
        title: "CORS preflight",
        description:
          "Returns the CORS headers for browser-based callers. Allows any origin, the POST and OPTIONS methods, and the `content-type` and `x-idempotency-key` headers.",
        auth: "None.",
        source: "src/routes/api/public/integrations/$slug.ts",
        params: [],
        responseExample: `204 No Content
access-control-allow-origin: *
access-control-allow-methods: POST, OPTIONS
access-control-allow-headers: content-type, x-idempotency-key`,
        errors: [],
      },
    ],
  },
  {
    id: "automations",
    title: "Automations",
    summary:
      "Trigger an automation workflow from an external system. Each active automation with a webhook trigger has its own URL token.",
    endpoints: [
      {
        id: "automations-trigger",
        method: "POST",
        path: "/api/public/automations/{token}",
        title: "Trigger an automation",
        description:
          "Emits a `webhook.received` event for the automation that owns the token. When the JSON body contains an `email` field that matches a lead in the workspace, the run is linked to that lead.",
        auth: "The URL token identifies the automation. When the automation has a signing secret, an HMAC-SHA256 hex digest of the raw body must also be sent in the `x-sendloop-signature` header.",
        source: "src/routes/api/public/automations/$token.ts",
        params: [
          { name: "token", type: "string (16–64 hex chars)", required: true, where: "path", description: "Webhook token shown on the automation page." },
          { name: "x-sendloop-signature", type: "string (hex)", required: false, where: "header", description: "Required only when a signing secret is configured: `hmac_sha256(secret, raw_body)`." },
          IDEMPOTENCY_HEADER,
        ],
        requestBody: `{
  "email": "ada@example.com",
  "source": "your-system",
  "any_other_field": "is passed through to the automation"
}`,
        responseExample: `{
  "ok": true,
  "enqueued": 1
}`,
        errors: [
          { status: 404, body: `{ "error": "Not found" }`, meaning: "Token is malformed or does not match an automation. Unknown and inactive tokens look identical on purpose.", action: "Copy the URL again from the automation page." },
          { status: 401, body: `{ "error": "Invalid signature" }`, meaning: "The signature header did not match the HMAC of the raw body.", action: "Sign the exact bytes you send, before any re-serialisation." },
          { status: 400, body: `{ "error": "Body must be JSON" }`, meaning: "A non-empty body was not valid JSON.", action: "Send valid JSON, or send an empty body." },
          { status: 413, body: `{ "error": "Payload too large" }`, meaning: "The body exceeded 100,000 characters.", action: "Send a smaller payload." },
          { status: 202, body: `{ "ok": true, "skipped": "Automation is not active" }`, meaning: "The automation exists but is paused or draft.", action: "Activate the automation to process events." },
        ],
        notes: [
          "An empty body is accepted; the automation then runs with no payload fields.",
          "Only JSON objects are read — arrays and scalars are ignored and treated as an empty payload.",
        ],
      },
    ],
  },
  {
    id: "email-events",
    title: "Email delivery & replies",
    summary:
      "The endpoint MunchReach exposes to its sending infrastructure for delivery events and inbound replies. Documented because it appears in delivery logs; it is not intended for customer traffic.",
    endpoints: [
      {
        id: "inbound-health",
        method: "GET",
        path: "/api/public/inbound/email",
        title: "Inbound endpoint health",
        description: "Health probe. Confirms the inbound receiver is reachable.",
        auth: "None.",
        source: "src/routes/api/public/inbound/email.ts",
        params: [],
        responseExample: `{
  "ok": true,
  "endpoint": "inbound-email-webhook",
  "method": "POST"
}`,
        errors: [],
      },
      {
        id: "inbound-events",
        method: "POST",
        path: "/api/public/inbound/email",
        title: "Deliver an inbound email or delivery event",
        description:
          "Accepts inbound mail and delivery events (sent, delivered, opened, clicked, bounced, complained, replied). Every delivery is signature-verified and logged before processing, and processing is idempotent, so retries never duplicate a message or a metric.",
        auth: "Signature required: a provider Svix signature, an HMAC of the raw body, or the MunchReach shared secret sent as `x-munchreach-signature`, `x-sendloop-signature` or a bearer token.",
        source: "src/routes/api/public/inbound/email.ts",
        params: [
          { name: "content-type", type: "string", required: false, where: "header", description: "`application/json` is parsed as JSON; anything else is parsed as form-encoded." },
        ],
        responseExample: `{
  "ok": true
}`,
        errors: [
          { status: 401, body: `{ "error": "…", "signature": "invalid" }`, meaning: "Signature verification failed.", action: "Check the signing secret configured for the sender." },
          { status: 503, body: `{ "error": "…", "signature": "failed" }`, meaning: "Verification could not be completed.", action: "Retry; the sender should back off and retry." },
          { status: 400, body: `{ "error": "Invalid body" }`, meaning: "The body was neither JSON nor form-encoded.", action: "Fix the payload encoding." },
          { status: 500, body: `{ "error": "Processing failed" }`, meaning: "An infrastructure error occurred after verification.", action: "Retry — processing is idempotent." },
        ],
        notes: [
          "Unmatched mail is acknowledged with 200 so the sender does not retry indefinitely.",
          "Failed signature checks raise an internal alert and are visible to platform admins.",
        ],
        needsReview:
          "The event payload shape is defined by the sending provider rather than by MunchReach, so no fixed request schema is published here.",
      },
    ],
  },
  {
    id: "billing-webhooks",
    title: "Billing webhooks",
    summary:
      "Receivers for the payment providers MunchReach supports. Configure these URLs in the provider dashboard; they are not called by customers.",
    endpoints: [
      {
        id: "billing-stripe",
        method: "POST",
        path: "/api/public/billing/stripe",
        title: "Stripe webhook",
        description:
          "Processes Stripe subscription, invoice, payment and refund events. Each event id is stored once, so replays cannot double-apply a change.",
        auth: "Stripe signature verification against the configured webhook signing secret.",
        source: "src/routes/api/public/billing/stripe.ts",
        params: [],
        responseExample: `{
  "received": true
}`,
        errors: [
          { status: 400, body: `{ "error": "…" }`, meaning: "The payload could not be verified or parsed.", action: "Check the signing secret in the provider settings." },
        ],
        notes: ["`GET` on the same path returns a health response."],
      },
      {
        id: "billing-paddle",
        method: "POST",
        path: "/api/public/billing/paddle",
        title: "Paddle webhook",
        description: "Processes Paddle subscription and transaction events with signature verification and idempotent storage.",
        auth: "Paddle signature verification against the configured webhook secret.",
        source: "src/routes/api/public/billing/paddle.ts",
        params: [],
        responseExample: `{
  "received": true
}`,
        errors: [{ status: 400, body: `{ "error": "…" }`, meaning: "Verification or parsing failed.", action: "Check the configured webhook secret." }],
        notes: ["`GET` on the same path returns a health response."],
      },
      {
        id: "billing-lemonsqueezy",
        method: "POST",
        path: "/api/public/billing/lemonsqueezy",
        title: "Lemon Squeezy webhook",
        description: "Processes Lemon Squeezy subscription and order events with signature verification and idempotent storage.",
        auth: "Lemon Squeezy signature verification against the configured webhook secret.",
        source: "src/routes/api/public/billing/lemonsqueezy.ts",
        params: [],
        responseExample: `{
  "received": true
}`,
        errors: [{ status: 400, body: `{ "error": "…" }`, meaning: "Verification or parsing failed.", action: "Check the configured webhook secret." }],
        notes: ["`GET` on the same path returns a health response."],
      },
      {
        id: "billing-referral",
        method: "POST",
        path: "/api/public/referral/billing",
        title: "Referral commission webhook",
        description:
          "Credits referral commissions from a billing event. The body is HMAC-verified before anything is written and every event id is stored once, so a replayed event cannot create a second commission.",
        auth: "HMAC-SHA256 of the raw body in the `x-sendloop-signature` header, using the referral webhook secret.",
        source: "src/routes/api/public/referral/billing.tsx",
        params: [
          { name: "x-sendloop-signature", type: "string (hex)", required: true, where: "header", description: "`hmac_sha256(secret, raw_body)`." },
        ],
        responseExample: `{
  "ok": true
}`,
        errors: [
          { status: 401, body: `{ "error": "Invalid signature" }`, meaning: "Signature mismatch.", action: "Sign the raw request body with the referral secret." },
        ],
        notes: ["Every delivery attempt is logged for the admin health panel."],
      },
    ],
  },
  {
    id: "media",
    title: "Media",
    summary: "Stable, cacheable URLs for blog media. The underlying storage bucket stays private.",
    endpoints: [
      {
        id: "media-get",
        method: "GET",
        path: "/api/public/media/{path}",
        title: "Fetch a media file",
        description:
          "Signs a short-lived storage URL server-side and streams the bytes back. Responses are cacheable for one hour in the browser and one day at the edge.",
        auth: "None — only files inside the blog media bucket are reachable.",
        source: "src/routes/api/public/media.$.ts",
        params: [
          { name: "path", type: "string", required: true, where: "path", description: "Object path inside the blog media bucket. Paths containing `..` are rejected." },
        ],
        responseExample: `200 OK
Content-Type: image/png
Cache-Control: public, max-age=3600, s-maxage=86400

<binary image data>`,
        errors: [{ status: 404, body: `Not found`, meaning: "Missing, unreadable or traversal path.", action: "Check the object path." }],
      },
    ],
  },
  {
    id: "scheduler",
    title: "Scheduler (campaigns, warmup & jobs)",
    summary:
      "Background runners that keep campaigns, warmup and maintenance jobs moving. They are called by the platform scheduler with a shared secret and are listed here for completeness — customer integrations do not call them.",
    endpoints: [
      {
        id: "cron-endpoints",
        method: "POST",
        path: "/api/public/cron/{job}",
        title: "Run a scheduled job",
        description:
          "Runs one background job. Available jobs: `run-campaigns`, `run-warmup`, `run-automations`, `run-ai-personalization`, `run-transactional-email`, `reconcile-delivery`, `retry-inbound`, `recheck-domains`, `provider-health`. Both GET and POST are accepted.",
        auth: "Shared scheduler secret, sent as `x-sendloop-signature`, `Authorization: Bearer …` or `?token=`.",
        source: "src/routes/api/public/cron/*.ts",
        params: [
          { name: "job", type: "string", required: true, where: "path", description: "One of the job names listed above." },
          { name: "token", type: "string", required: false, where: "query", description: "Scheduler secret, if not sent as a header." },
        ],
        responseExample: `{
  "ok": true
}`,
        errors: [
          { status: 401, body: `{ "error": "Unauthorized" }`, meaning: "The scheduler secret did not match.", action: "Use the configured scheduler token." },
          { status: 503, body: `{ "error": "Runner is not configured" }`, meaning: "No scheduler secret is configured.", action: "Configure the runner token in platform settings." },
        ],
        notes: ["Each job returns a per-job summary object alongside `ok`."],
      },
    ],
  },
];

/** Events MunchReach delivers to connected integrations. */
export const OUTBOUND_EVENTS: {
  name: string;
  when: string;
  status: "live" | "declared";
  payload: string;
}[] = [
  {
    name: "reply.received",
    when: "A prospect replies to a campaign email and the reply lands in the unified inbox.",
    status: "live",
    payload: `{
  "event": "reply.received",
  "lead": {
    "email": "ada@example.com",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "company": "Example Inc"
  }
}`,
  },
  {
    name: "reply.positive",
    when: "A reply is classified as positive. Fires in addition to reply.received.",
    status: "live",
    payload: `{
  "event": "reply.positive",
  "lead": {
    "email": "ada@example.com",
    "first_name": "Ada",
    "company": "Example Inc"
  }
}`,
  },
  {
    name: "lead.created",
    when: "Declared by CRM and webhook integrations in the integration catalogue.",
    status: "declared",
    payload: `{
  "event": "lead.created",
  "lead": { "email": "ada@example.com" }
}`,
  },
  {
    name: "campaign.completed",
    when: "Declared by webhook and CRM integrations in the integration catalogue.",
    status: "declared",
    payload: `{
  "event": "campaign.completed",
  "lead": { "email": "ada@example.com" }
}`,
  },
  {
    name: "meeting.booked",
    when: "Declared by calendar, CRM and webhook integrations in the integration catalogue.",
    status: "declared",
    payload: `{
  "event": "meeting.booked",
  "lead": { "email": "ada@example.com" }
}`,
  },
  {
    name: "email.bounced",
    when: "Declared by webhook and CRM integrations in the integration catalogue.",
    status: "declared",
    payload: `{
  "event": "email.bounced",
  "lead": { "email": "ada@example.com" }
}`,
  },
  {
    name: "integration.connected",
    when: "Sent once as a test payload when a webhook integration is connected or tested.",
    status: "live",
    payload: `{
  "event": "integration.connected",
  "source": "sendloop",
  "message": "MunchReach connection test — you can ignore this message.",
  "timestamp": "2026-08-22T21:14:05.000Z"
}`,
  },
];

/** Areas that are dashboard-only today — no public HTTP endpoint exists yet. */
export const NOT_YET_PUBLIC = [
  "Campaign creation, start and pause",
  "Sending accounts and domains",
  "Conversations and the unified inbox",
  "Contacts, lists and segments",
  "Warmup configuration",
  "Usage and plan entitlements",
];
