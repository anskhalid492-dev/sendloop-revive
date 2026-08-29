# MunchReach Public API v1

## What exists today

- `/api-docs` is a real docs portal already driven by a single source of truth (`src/lib/api-reference.ts`) that mirrors the handlers under `src/routes/api/public/*`. It will be **upgraded in place**, never duplicated.
- Today's public surface is only: lead intake (`/api/public/integrations/{slug}`), automations trigger, unsubscribe, media, billing/inbound webhooks, cron runners. There is **no** public REST API and **no** API keys.
- All business logic lives in `createServerFn` modules (`campaigns.functions.ts`, `leads`, `replies`, `analytics`, `sending`, `dispatch.server.ts`, `campaign-launch.server.ts`, …). Those are authenticated by a Supabase user JWT, so an API key cannot call them as-is.

## Core architectural move

Extract the workspace-scoped logic each server function already performs into a **service layer** (`src/lib/services/*.server.ts`) that takes an explicit `{ workspaceId, actor }` context. Then:

```text
Dashboard server fns ─┐
REST /api/v1 handlers ─┼──→ Application services → Database
Future MCP ───────────┘
```

Server functions become thin wrappers over the services, so the dashboard and the API provably run the same code (launch, pause, scheduling, limits, unsubscribe, billing all unchanged). No REST handler touches tables directly for a stateful operation.

## Phases

Each phase ends with typecheck + full test suite + production build, and updates `api-reference.ts` so docs and OpenAPI never drift.

### Phase 1 — Foundation (auth, keys, plumbing)
- Migration: `api_keys` (workspace_id, name, prefix, hashed secret, scopes[], status, created_at, last_used_at, revoked_at), `api_key_usage` counters for rate limiting, `idempotency_keys`. RLS + GRANTs; secret stored as SHA-256 hash only.
- Key format `mr_live_<32 chars>`, shown once at creation.
- `src/lib/api/v1/runtime.server.ts`: key auth, scope enforcement, workspace derivation (client-supplied `workspace_id` always ignored), cursor pagination, Zod validation, request IDs (`X-Request-Id`), uniform error envelope, body-size caps, rate limiting with `429` + `Retry-After`, `Idempotency-Key` replay.
- Settings → Integrations UI: create / name / copy-once / scope-select / revoke / status / created / last used.

### Phase 2 — Campaigns + stats + sequences
- `GET/POST /api/v1/campaigns`, `GET/PATCH/DELETE /api/v1/campaigns/:id`.
- Actions `launch|pause|resume|stop` → the existing launch/scheduler services.
- `GET /api/v1/campaigns/:id/stats` fed by the same source the dashboard uses (delivery state, run state, daily usage, remaining capacity, next window).
- Sequence CRUD over the existing sequence storage.

### Phase 3 — Contacts, import/export, mailboxes, replies, analytics
- Contact CRUD, `bulk`, pagination/filter/search/sort.
- `import`/`export` return a job id; `GET /api/v1/exports/:id` polls. Large work runs async on the existing queue.
- Mailboxes read-only (list, get, health, stats) with a strict field allowlist — no credentials, tokens or secrets ever serialized.
- Replies (UniBox data) with campaign/contact/mailbox/read/date filters; workspace analytics with date range + campaign filter.

### Phase 4 — Webhooks + reliability
- `webhook_endpoints` and `webhook_deliveries` tables; CRUD endpoints; per-endpoint secret shown once.
- HMAC-SHA256 `X-MunchReach-Signature` over the raw body with a timestamp.
- Event emission points for the listed campaign/email/reply/contact/mailbox events; delivery is queued, never inline with sending.
- Cron-driven retry worker with exponential backoff, delivery status, last attempt, next retry, failure reason.

### Phase 5 — Docs, OpenAPI, security audit, tests
- Extend `api-reference.ts` with scopes/versioning and grow `/api-docs` into a developer portal: Quick Start, Authentication, API Keys, each resource, Errors, Rate Limits, Pagination, Idempotency, Webhooks — cURL/JS/Python samples with copy buttons (existing components already do this).
- Generate `/api/v1/openapi.json` from the same reference data, with a test asserting every documented path resolves to a real route and vice versa.
- Security audit pass over every endpoint; regression tests for auth, scopes, revocation, **workspace A key cannot read workspace B anything**, pagination, rate limit, idempotency, webhook signatures, error shape, and that API launch calls the identical scheduler path as the dashboard.

## Backward compatibility

Existing `/api/public/*` endpoints keep working unchanged. v1 is additive. Any behaviour change that would break a caller ships as v2 instead.

## Suggested execution

Phases run in order; I'll report at the end of each. Phase 1 is the gate — nothing else can be secure without it.
