/**
 * Machine-readable description of the Public API v1 surface.
 *
 * This is the single source of truth for the developer portal *and* the
 * generated OpenAPI document, so the docs cannot describe an endpoint the
 * router does not serve. Every entry mirrors a route file under
 * `src/routes/api/public/v1/`; add the route and the entry in the same edit.
 */
import type { GrantableScope } from "./scopes";

export const V1_BASE_PATH = "/api/public/v1";

export type V1Method = "GET" | "POST" | "PATCH" | "DELETE";

export type V1Param = {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  type: string;
  description: string;
};

export type V1Operation = {
  id: string;
  method: V1Method;
  /** Path relative to {@link V1_BASE_PATH}, using `{braces}` for parameters. */
  path: string;
  summary: string;
  description: string;
  scope: GrantableScope | null;
  idempotent?: boolean;
  params?: V1Param[];
  requestBody?: string;
  responseExample: string;
  source: string;
};

export type V1Resource = {
  id: string;
  title: string;
  summary: string;
  operations: V1Operation[];
};

const CURSOR_PARAMS: V1Param[] = [
  {
    name: "limit",
    in: "query",
    required: false,
    type: "integer (1–100, default 25)",
    description: "Page size.",
  },
  {
    name: "cursor",
    in: "query",
    required: false,
    type: "string",
    description: "Opaque cursor returned as `pagination.next_cursor` by the previous page.",
  },
];

function pathParam(name: string, what: string): V1Param {
  return { name, in: "path", required: true, type: "uuid", description: what };
}

export const V1_RESOURCES: V1Resource[] = [
  {
    id: "v1-auth",
    title: "Authentication",
    summary:
      "Every request carries `Authorization: Bearer mr_live_…`. A key resolves to exactly one workspace, so there is no workspace parameter anywhere in the API — you physically cannot read another workspace's data with your key.",
    operations: [
      {
        id: "v1-me",
        method: "GET",
        path: "/me",
        summary: "Verify a key",
        description:
          "Returns the workspace and scopes your key resolves to. Call this first when wiring up an integration: a 401 here means the key is wrong, and a surprising workspace name means the key belongs somewhere else.",
        scope: null,
        responseExample: `{
  "data": {
    "object": "api_key_context",
    "api_key_id": "0d1f…",
    "workspace": { "id": "b4c…", "name": "Acme Outbound" },
    "scopes": ["campaigns:read", "contacts:write"],
    "rate_limit_per_minute": 120
  }
}`,
        source: "src/routes/api/public/v1/me.ts",
      },
    ],
  },
  {
    id: "v1-campaigns",
    title: "Campaigns",
    summary:
      "Create, configure and control campaigns. Launch, pause, resume and stop run through the same services the dashboard uses, so plan limits, readiness checks and queue handling behave identically.",
    operations: [
      {
        id: "v1-campaigns-list",
        method: "GET",
        path: "/campaigns",
        summary: "List campaigns",
        description: "Cursor-paginated, newest first. Filter by `status` or search by `q`.",
        scope: "campaigns:read",
        params: [
          ...CURSOR_PARAMS,
          {
            name: "status",
            in: "query",
            required: false,
            type: "string",
            description: "draft, scheduled, active, paused, completed or archived.",
          },
          {
            name: "q",
            in: "query",
            required: false,
            type: "string",
            description: "Case-insensitive name search.",
          },
        ],
        responseExample: `{
  "data": [
    {
      "object": "campaign",
      "id": "7f0…",
      "name": "Packaging Companies — US",
      "status": "active",
      "timezone": "Asia/Dubai",
      "daily_send_limit": 200,
      "created_at": "2026-08-20T08:00:00.000Z"
    }
  ],
  "pagination": { "has_more": false, "next_cursor": null }
}`,
        source: "src/routes/api/public/v1/campaigns.ts",
      },
      {
        id: "v1-campaigns-create",
        method: "POST",
        path: "/campaigns",
        summary: "Create a campaign",
        description:
          "Creates a draft campaign. Sequence steps are added separately, and the campaign only sends after you launch it.",
        scope: "campaigns:write",
        idempotent: true,
        requestBody: `{
  "name": "Packaging Companies — US",
  "timezone": "Asia/Dubai",
  "daily_send_limit": 200,
  "sending_days": [1, 2, 3, 4, 5],
  "send_window_start": "09:00",
  "send_window_end": "17:00"
}`,
        responseExample: `{ "data": { "object": "campaign", "id": "7f0…", "status": "draft" } }`,
        source: "src/routes/api/public/v1/campaigns.ts",
      },
      {
        id: "v1-campaigns-get",
        method: "GET",
        path: "/campaigns/{campaign_id}",
        summary: "Retrieve a campaign",
        description: "Full campaign object, including schedule and tracking configuration.",
        scope: "campaigns:read",
        params: [pathParam("campaign_id", "Campaign identifier.")],
        responseExample: `{ "data": { "object": "campaign", "id": "7f0…", "status": "active" } }`,
        source: "src/routes/api/public/v1/campaigns.$campaignId.ts",
      },
      {
        id: "v1-campaigns-update",
        method: "PATCH",
        path: "/campaigns/{campaign_id}",
        summary: "Update a campaign",
        description:
          "Partial update. Changing sending days, window or timezone re-plans the queued messages the same way the dashboard does.",
        scope: "campaigns:write",
        params: [pathParam("campaign_id", "Campaign identifier.")],
        requestBody: `{ "daily_send_limit": 150, "sending_days": [1, 2, 3, 4, 5, 6] }`,
        responseExample: `{ "data": { "object": "campaign", "id": "7f0…", "daily_send_limit": 150 } }`,
        source: "src/routes/api/public/v1/campaigns.$campaignId.ts",
      },
      {
        id: "v1-campaigns-delete",
        method: "DELETE",
        path: "/campaigns/{campaign_id}",
        summary: "Delete a campaign",
        description: "Permanently deletes the campaign and its queued messages.",
        scope: "campaigns:write",
        params: [pathParam("campaign_id", "Campaign identifier.")],
        responseExample: `{ "data": { "object": "campaign", "id": "7f0…", "deleted": true } }`,
        source: "src/routes/api/public/v1/campaigns.$campaignId.ts",
      },
      {
        id: "v1-campaigns-actions",
        method: "POST",
        path: "/campaigns/{campaign_id}/actions/{action}",
        summary: "Launch, pause, resume or stop",
        description:
          "`action` is one of `launch`, `pause`, `resume`, `stop`. Launch runs the full readiness check: if a mailbox, list or sequence step is missing you get a 422 listing exactly what is blocking it.",
        scope: "campaigns:write",
        idempotent: true,
        params: [
          pathParam("campaign_id", "Campaign identifier."),
          {
            name: "action",
            in: "path",
            required: true,
            type: "string",
            description: "launch, pause, resume or stop.",
          },
        ],
        responseExample: `{
  "data": {
    "object": "campaign_action",
    "action": "launch",
    "campaign_id": "7f0…",
    "status": "active",
    "queued": 1196,
    "first_send_at": "2026-08-31T16:00:00.000Z"
  }
}`,
        source: "src/routes/api/public/v1/campaigns.$campaignId.actions.$action.ts",
      },
      {
        id: "v1-campaigns-stats",
        method: "GET",
        path: "/campaigns/{campaign_id}/stats",
        summary: "Campaign statistics",
        description:
          "Sent, delivered, opened, clicked, replied, bounced and unsubscribed, split into lifetime totals and today's activity in the campaign timezone.",
        scope: "analytics:read",
        params: [pathParam("campaign_id", "Campaign identifier.")],
        responseExample: `{
  "data": {
    "object": "campaign_stats",
    "campaign_id": "7f0…",
    "total": { "sent": 842, "replied": 37, "bounced": 6 },
    "today": { "sent": 118, "replied": 4, "bounced": 1 },
    "rates": { "reply_rate": 0.044, "bounce_rate": 0.007 }
  }
}`,
        source: "src/routes/api/public/v1/campaigns.$campaignId.stats.ts",
      },
    ],
  },
  {
    id: "v1-sequences",
    title: "Sequences",
    summary:
      "Sequence steps are the emails a campaign sends. Step 1 goes out at launch; later steps wait their configured delay after the previous step.",
    operations: [
      {
        id: "v1-steps-list",
        method: "GET",
        path: "/campaigns/{campaign_id}/sequence",
        summary: "List steps",
        description: "All steps in send order.",
        scope: "sequences:read",
        params: [pathParam("campaign_id", "Campaign identifier.")],
        responseExample: `{
  "data": [
    {
      "object": "sequence_step",
      "id": "a1b…",
      "step_number": 1,
      "subject": "Quick question about {{company}}",
      "wait_days": 0
    }
  ]
}`,
        source: "src/routes/api/public/v1/campaigns.$campaignId.sequence.ts",
      },
      {
        id: "v1-steps-create",
        method: "POST",
        path: "/campaigns/{campaign_id}/sequence",
        summary: "Add a step",
        description:
          "Appends a step. Bodies support the same variables as the builder, including `{{first_name}}` and `{{unsubscribe_link}}`.",
        scope: "sequences:write",
        idempotent: true,
        params: [pathParam("campaign_id", "Campaign identifier.")],
        requestBody: `{
  "subject": "Following up, {{first_name}}",
  "body": "Hi {{first_name}},\\n\\nJust bumping this.\\n\\nUnsubscribe: {{unsubscribe_link}}",
  "wait_days": 3
}`,
        responseExample: `{ "data": { "object": "sequence_step", "id": "c3d…", "step_number": 2 } }`,
        source: "src/routes/api/public/v1/campaigns.$campaignId.sequence.ts",
      },
      {
        id: "v1-steps-update",
        method: "PATCH",
        path: "/campaigns/{campaign_id}/sequence/{step_id}",
        summary: "Update a step",
        description: "Partial update of subject, body or delay.",
        scope: "sequences:write",
        params: [
          pathParam("campaign_id", "Campaign identifier."),
          pathParam("step_id", "Sequence step identifier."),
        ],
        requestBody: `{ "wait_days": 5 }`,
        responseExample: `{ "data": { "object": "sequence_step", "id": "c3d…", "wait_days": 5 } }`,
        source: "src/routes/api/public/v1/campaigns.$campaignId.sequence.$stepId.ts",
      },
      {
        id: "v1-steps-delete",
        method: "DELETE",
        path: "/campaigns/{campaign_id}/sequence/{step_id}",
        summary: "Delete a step",
        description: "Removes the step and renumbers the remaining ones.",
        scope: "sequences:write",
        params: [
          pathParam("campaign_id", "Campaign identifier."),
          pathParam("step_id", "Sequence step identifier."),
        ],
        responseExample: `{ "data": { "object": "sequence_step", "id": "c3d…", "deleted": true } }`,
        source: "src/routes/api/public/v1/campaigns.$campaignId.sequence.$stepId.ts",
      },
    ],
  },
  {
    id: "v1-contacts",
    title: "Contacts",
    summary:
      "Contacts are the leads in your workspace. Matching is on workspace + email, so re-sending an address updates the existing contact instead of duplicating it.",
    operations: [
      {
        id: "v1-contacts-list",
        method: "GET",
        path: "/contacts",
        summary: "List contacts",
        description: "Cursor-paginated. Filter by `list_id`, `status` or search with `q`.",
        scope: "contacts:read",
        params: [
          ...CURSOR_PARAMS,
          {
            name: "list_id",
            in: "query",
            required: false,
            type: "uuid",
            description: "Restrict to one lead list.",
          },
          {
            name: "q",
            in: "query",
            required: false,
            type: "string",
            description: "Matches email, name or company.",
          },
        ],
        responseExample: `{
  "data": [
    {
      "object": "contact",
      "id": "9aa…",
      "email": "ada@example.com",
      "first_name": "Ada",
      "company": "Example Inc",
      "status": "active"
    }
  ],
  "pagination": { "has_more": true, "next_cursor": "MjAyNi0w…" }
}`,
        source: "src/routes/api/public/v1/contacts.ts",
      },
      {
        id: "v1-contacts-create",
        method: "POST",
        path: "/contacts",
        summary: "Create or update a contact",
        description: "Upserts on email. Custom fields are stored as JSON.",
        scope: "contacts:write",
        idempotent: true,
        requestBody: `{
  "email": "ada@example.com",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "company": "Example Inc",
  "custom_fields": { "industry": "packaging" }
}`,
        responseExample: `{ "data": { "object": "contact", "id": "9aa…", "email": "ada@example.com" } }`,
        source: "src/routes/api/public/v1/contacts.ts",
      },
      {
        id: "v1-contacts-get",
        method: "GET",
        path: "/contacts/{contact_id}",
        summary: "Retrieve a contact",
        description: "Single contact by id.",
        scope: "contacts:read",
        params: [pathParam("contact_id", "Contact identifier.")],
        responseExample: `{ "data": { "object": "contact", "id": "9aa…" } }`,
        source: "src/routes/api/public/v1/contacts.$contactId.ts",
      },
      {
        id: "v1-contacts-update",
        method: "PATCH",
        path: "/contacts/{contact_id}",
        summary: "Update a contact",
        description: "Partial update of any writable field.",
        scope: "contacts:write",
        params: [pathParam("contact_id", "Contact identifier.")],
        requestBody: `{ "company": "Example Group" }`,
        responseExample: `{ "data": { "object": "contact", "id": "9aa…", "company": "Example Group" } }`,
        source: "src/routes/api/public/v1/contacts.$contactId.ts",
      },
      {
        id: "v1-contacts-delete",
        method: "DELETE",
        path: "/contacts/{contact_id}",
        summary: "Delete a contact",
        description: "Removes the contact from the workspace.",
        scope: "contacts:write",
        params: [pathParam("contact_id", "Contact identifier.")],
        responseExample: `{ "data": { "object": "contact", "id": "9aa…", "deleted": true } }`,
        source: "src/routes/api/public/v1/contacts.$contactId.ts",
      },
      {
        id: "v1-contacts-bulk",
        method: "POST",
        path: "/contacts/bulk",
        summary: "Bulk create, update or delete",
        description:
          "Up to 1,000 contacts per call. Every row is reported individually, so a partial failure never hides which addresses were rejected.",
        scope: "contacts:write",
        idempotent: true,
        requestBody: `{
  "operation": "upsert",
  "contacts": [
    { "email": "ada@example.com", "first_name": "Ada" },
    { "email": "grace@example.com", "first_name": "Grace" }
  ]
}`,
        responseExample: `{
  "data": {
    "object": "bulk_result",
    "operation": "upsert",
    "succeeded": 2,
    "failed": 0,
    "results": [
      { "email": "ada@example.com", "ok": true, "id": "9aa…" },
      { "email": "grace@example.com", "ok": true, "id": "9ab…" }
    ]
  }
}`,
        source: "src/routes/api/public/v1/contacts.bulk.ts",
      },
      {
        id: "v1-contacts-export",
        method: "GET",
        path: "/contacts/export",
        summary: "Export contacts as CSV",
        description:
          "Streams `text/csv` rather than JSON. Use `list_id` to export one list. Suitable for scheduled syncs into a warehouse.",
        scope: "contacts:read",
        params: [
          {
            name: "list_id",
            in: "query",
            required: false,
            type: "uuid",
            description: "Restrict the export to one lead list.",
          },
        ],
        responseExample: `email,first_name,last_name,company,status,created_at
ada@example.com,Ada,Lovelace,Example Inc,active,2026-08-20T08:00:00.000Z`,
        source: "src/routes/api/public/v1/contacts.export.ts",
      },
    ],
  },
  {
    id: "v1-mailboxes",
    title: "Mailboxes",
    summary:
      "Read-only view of connected sending accounts, their health and remaining capacity. Connecting a mailbox stays a dashboard action because it requires DNS and provider verification.",
    operations: [
      {
        id: "v1-mailboxes-list",
        method: "GET",
        path: "/mailboxes",
        summary: "List mailboxes",
        description: "Every sending account with status, warmup state and daily capacity.",
        scope: "mailboxes:read",
        params: CURSOR_PARAMS,
        responseExample: `{
  "data": [
    {
      "object": "mailbox",
      "id": "5c1…",
      "email": "hello@acme.com",
      "provider": "ses",
      "status": "active",
      "daily_limit": 70,
      "sent_today": 32,
      "warmup_enabled": true
    }
  ]
}`,
        source: "src/routes/api/public/v1/mailboxes.ts",
      },
      {
        id: "v1-mailboxes-get",
        method: "GET",
        path: "/mailboxes/{mailbox_id}",
        summary: "Retrieve a mailbox",
        description: "Single mailbox, including why it is paused when it is.",
        scope: "mailboxes:read",
        params: [pathParam("mailbox_id", "Mailbox identifier.")],
        responseExample: `{ "data": { "object": "mailbox", "id": "5c1…", "status": "active" } }`,
        source: "src/routes/api/public/v1/mailboxes.$mailboxId.ts",
      },
    ],
  },
  {
    id: "v1-replies",
    title: "Replies",
    summary: "Inbound replies with their sentiment classification.",
    operations: [
      {
        id: "v1-replies-list",
        method: "GET",
        path: "/replies",
        summary: "List replies",
        description:
          "Newest first. Filter by `campaign_id` or `sentiment` (positive, neutral, negative, out_of_office).",
        scope: "replies:read",
        params: [
          ...CURSOR_PARAMS,
          {
            name: "campaign_id",
            in: "query",
            required: false,
            type: "uuid",
            description: "Restrict to one campaign.",
          },
          {
            name: "sentiment",
            in: "query",
            required: false,
            type: "string",
            description: "positive, neutral, negative or out_of_office.",
          },
        ],
        responseExample: `{
  "data": [
    {
      "object": "reply",
      "id": "e77…",
      "campaign_id": "7f0…",
      "from_email": "ada@example.com",
      "subject": "Re: Quick question",
      "sentiment": "positive",
      "received_at": "2026-08-29T09:12:00.000Z"
    }
  ]
}`,
        source: "src/routes/api/public/v1/replies.ts",
      },
    ],
  },
  {
    id: "v1-analytics",
    title: "Analytics",
    summary: "Workspace-level performance, matching the numbers on the dashboard.",
    operations: [
      {
        id: "v1-analytics-get",
        method: "GET",
        path: "/analytics",
        summary: "Workspace analytics",
        description:
          "Totals and rates across the workspace for a date range. Warmup traffic is always excluded.",
        scope: "analytics:read",
        params: [
          {
            name: "from",
            in: "query",
            required: false,
            type: "date (YYYY-MM-DD)",
            description: "Start of the range. Defaults to 30 days ago.",
          },
          {
            name: "to",
            in: "query",
            required: false,
            type: "date (YYYY-MM-DD)",
            description: "End of the range. Defaults to today.",
          },
        ],
        responseExample: `{
  "data": {
    "object": "workspace_analytics",
    "range": { "from": "2026-07-30", "to": "2026-08-29" },
    "totals": { "sent": 12480, "replied": 512, "bounced": 74 },
    "rates": { "reply_rate": 0.041, "bounce_rate": 0.006 }
  }
}`,
        source: "src/routes/api/public/v1/analytics.ts",
      },
    ],
  },
  {
    id: "v1-webhooks",
    title: "Webhooks",
    summary:
      "Subscribe to events instead of polling. Deliveries are queued and retried with exponential backoff, and every request is signed so you can verify it came from MunchReach.",
    operations: [
      {
        id: "v1-webhooks-list",
        method: "GET",
        path: "/webhooks",
        summary: "List endpoints",
        description: "All webhook endpoints registered for the workspace.",
        scope: "webhooks:read",
        responseExample: `{
  "data": [
    {
      "object": "webhook_endpoint",
      "id": "44a…",
      "url": "https://example.com/hooks/munchreach",
      "events": ["reply.received"],
      "status": "active"
    }
  ]
}`,
        source: "src/routes/api/public/v1/webhooks.ts",
      },
      {
        id: "v1-webhooks-create",
        method: "POST",
        path: "/webhooks",
        summary: "Create an endpoint",
        description:
          "The signing secret is returned once, on creation. Store it — it is never shown again.",
        scope: "webhooks:write",
        idempotent: true,
        requestBody: `{
  "url": "https://example.com/hooks/munchreach",
  "events": ["reply.received", "email.sent"]
}`,
        responseExample: `{
  "data": {
    "object": "webhook_endpoint",
    "id": "44a…",
    "secret": "whsec_…",
    "events": ["reply.received", "email.sent"]
  }
}`,
        source: "src/routes/api/public/v1/webhooks.ts",
      },
      {
        id: "v1-webhooks-update",
        method: "PATCH",
        path: "/webhooks/{webhook_id}",
        summary: "Update an endpoint",
        description: "Change the URL, subscribed events, or pause the endpoint.",
        scope: "webhooks:write",
        params: [pathParam("webhook_id", "Webhook endpoint identifier.")],
        requestBody: `{ "status": "paused" }`,
        responseExample: `{ "data": { "object": "webhook_endpoint", "id": "44a…", "status": "paused" } }`,
        source: "src/routes/api/public/v1/webhooks.$webhookId.ts",
      },
      {
        id: "v1-webhooks-delete",
        method: "DELETE",
        path: "/webhooks/{webhook_id}",
        summary: "Delete an endpoint",
        description: "Stops all future deliveries to this endpoint.",
        scope: "webhooks:write",
        params: [pathParam("webhook_id", "Webhook endpoint identifier.")],
        responseExample: `{ "data": { "object": "webhook_endpoint", "id": "44a…", "deleted": true } }`,
        source: "src/routes/api/public/v1/webhooks.$webhookId.ts",
      },
      {
        id: "v1-webhooks-deliveries",
        method: "GET",
        path: "/webhooks/{webhook_id}/deliveries",
        summary: "Delivery history",
        description:
          "Recent attempts with response status, attempt count and next retry time — the first place to look when an integration goes quiet.",
        scope: "webhooks:read",
        params: [pathParam("webhook_id", "Webhook endpoint identifier."), ...CURSOR_PARAMS],
        responseExample: `{
  "data": [
    {
      "object": "webhook_delivery",
      "id": "d19…",
      "event": "reply.received",
      "status": "failed",
      "attempts": 3,
      "response_status": 500,
      "next_attempt_at": "2026-08-29T10:04:00.000Z"
    }
  ]
}`,
        source: "src/routes/api/public/v1/webhooks.$webhookId.deliveries.ts",
      },
    ],
  },
];

export const V1_ERROR_CODES: Array<{ status: number; code: string; meaning: string }> = [
  { status: 400, code: "invalid_request", meaning: "Malformed JSON or a missing required field." },
  { status: 401, code: "unauthorized", meaning: "Missing, unknown, expired or revoked API key." },
  { status: 403, code: "forbidden", meaning: "The key is valid but lacks the required scope." },
  { status: 404, code: "not_found", meaning: "No such resource in this workspace." },
  { status: 409, code: "conflict", meaning: "The resource is in a state that forbids the action." },
  { status: 422, code: "unprocessable", meaning: "Validation or readiness check failed." },
  { status: 429, code: "rate_limited", meaning: "Too many requests — back off and retry." },
  { status: 500, code: "server_error", meaning: "Unexpected failure on our side." },
];
