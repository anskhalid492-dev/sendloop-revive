/**
 * Request runtime for the MunchReach Public API v1.
 *
 * Every `/api/v1/*` handler goes through `handleApiRequest`, which is the only
 * place that:
 *   - authenticates the API key and derives the workspace (a client-supplied
 *     `workspace_id` is never trusted — it is simply not read),
 *   - enforces scopes,
 *   - applies per-key rate limiting,
 *   - bounds the request body,
 *   - replays `Idempotency-Key` results,
 *   - stamps `X-Request-Id` on the response and on every log line,
 *   - converts anything thrown into the single documented error envelope.
 */
import { ApiError, errorBody, type ApiErrorCode } from "./errors";
import { hashApiKey, looksLikeApiKey } from "./keys";
import { scopeSatisfied, type ApiScope } from "./scopes";

// The generated Supabase types make the admin client extremely noisy here and
// every field read below is validated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export const MAX_BODY_BYTES = 1_000_000; // 1 MB
const LAST_USED_THROTTLE_MS = 60_000;

export type ApiAuth = {
  keyId: string;
  workspaceId: string;
  scopes: string[];
  rateLimitPerMinute: number;
  /** The member who minted the key; used as the actor on created records. */
  createdBy: string | null;
};

export type ApiContext = {
  request: Request;
  requestId: string;
  auth: ApiAuth;
  admin: Admin;
  url: URL;
  params: Record<string, string>;
  /** Parsed + validated JSON body (empty object for bodyless requests). */
  body: unknown;
  /** Throws `insufficient_scope` unless the key carries the permission. */
  require: (scope: ApiScope) => void;
};

export type HandlerSpec = {
  /** Omitted only for endpoints that expose nothing but the key's own identity. */
  scope?: ApiScope;
  /** POST/PATCH handlers that create or trigger work should opt into replay. */
  idempotent?: boolean;
  handler: (ctx: ApiContext) => Promise<unknown | Response>;
};

export type RouteSpec = {
  /** Used as the idempotency namespace and in logs. */
  name: string;
  handlers: Partial<Record<"GET" | "POST" | "PATCH" | "PUT" | "DELETE", HandlerSpec>>;
};

function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function baseHeaders(requestId: string): Record<string, string> {
  return {
    "content-type": "application/json; charset=utf-8",
    "x-request-id": requestId,
    "cache-control": "no-store",
  };
}

export function jsonResponse(
  body: unknown,
  requestId: string,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...baseHeaders(requestId), ...extraHeaders },
  });
}

function errorResponse(error: ApiError, requestId: string): Response {
  return jsonResponse(
    errorBody(error.code, error.message, requestId, error.details),
    requestId,
    error.status,
    error.headers ?? {},
  );
}

/** Convenience for handlers that want to fail with a documented code. */
export function fail(code: ApiErrorCode, message: string, details?: unknown): never {
  throw new ApiError(code, message, details === undefined ? undefined : { details });
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

async function authenticate(request: Request, admin: Admin): Promise<ApiAuth> {
  const header = request.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : header.startsWith("bearer ")
      ? header.slice(7).trim()
      : "";

  if (!raw) {
    throw new ApiError(
      "unauthorized",
      "Provide your API key as `Authorization: Bearer mr_live_...`.",
      { headers: { "www-authenticate": 'Bearer realm="MunchReach API"' } },
    );
  }
  if (!looksLikeApiKey(raw)) {
    throw new ApiError("invalid_api_key", "The API key is not valid.");
  }

  const hash = await hashApiKey(raw);
  const { data: key } = await admin
    .from("api_keys")
    .select("id, workspace_id, scopes, status, revoked_at, expires_at, last_used_at, rate_limit_per_minute, created_by")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!key) throw new ApiError("invalid_api_key", "The API key is not valid.");
  if (key.status === "revoked" || key.revoked_at) {
    throw new ApiError("api_key_revoked", "This API key has been revoked.");
  }
  if (key.status !== "active") {
    throw new ApiError("invalid_api_key", "This API key is not active.");
  }
  if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) {
    throw new ApiError("api_key_expired", "This API key has expired.");
  }

  // `last_used_at` is a coarse activity signal, not an audit log: throttled so a
  // busy integration does not write on every request.
  const last = key.last_used_at ? new Date(key.last_used_at).getTime() : 0;
  if (Date.now() - last > LAST_USED_THROTTLE_MS) {
    await admin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", key.id);
  }

  return {
    keyId: key.id as string,
    workspaceId: key.workspace_id as string,
    scopes: (key.scopes ?? []) as string[],
    rateLimitPerMinute: (key.rate_limit_per_minute as number) || 120,
    createdBy: (key.created_by as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function enforceRateLimit(
  admin: Admin,
  auth: ApiAuth,
  meta: RateMeta,
): Promise<void> {
  meta.limit = auth.rateLimitPerMinute;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
  const { data, error } = await admin.rpc("api_rate_limit_hit", {
    _api_key_id: auth.keyId,
    _window_start: windowStart,
    _limit: auth.rateLimitPerMinute,
  });
  // A counter outage must never take the API down; it fails open but is logged.
  if (error) {
    console.warn("[api/v1] rate limit counter unavailable", error.message);
    return;
  }
  const count = Number(data ?? 0);
  meta.remaining = Math.max(0, auth.rateLimitPerMinute - count);
  if (count > auth.rateLimitPerMinute) {
    const retryAfter = Math.max(1, Math.ceil((new Date(windowStart).getTime() + 60_000 - now) / 1000));
    throw new ApiError(
      "rate_limited",
      `Rate limit of ${auth.rateLimitPerMinute} requests per minute exceeded.`,
      {
        headers: {
          "retry-after": String(retryAfter),
          "x-ratelimit-limit": String(auth.rateLimitPerMinute),
          "x-ratelimit-remaining": "0",
        },
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Body handling
// ---------------------------------------------------------------------------

async function readJsonBody(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "DELETE") return {};

  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    throw new ApiError("payload_too_large", "Request body exceeds the 1 MB limit.");
  }

  const text = await request.text();
  if (!text.trim()) return {};
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError("payload_too_large", "Request body exceeds the 1 MB limit.");
  }

  const type = request.headers.get("content-type") ?? "";
  if (type && !type.includes("application/json")) {
    throw new ApiError("unsupported_media_type", "Send `Content-Type: application/json`.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("invalid_request", "Request body is not valid JSON.");
  }
}

async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value ?? {})),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Rate-limit state filled in during the request so every response can report it. */
type RateMeta = { limit: number | null; remaining: number | null };

/**
 * Public entry point. Delegates to the request pipeline and then stamps the
 * rate-limit budget onto whatever response came back, so clients can throttle
 * themselves before they ever see a 429.
 */
export async function handleApiRequest(
  spec: RouteSpec,
  request: Request,
  params: Record<string, string> = {},
): Promise<Response> {
  const meta: RateMeta = { limit: null, remaining: null };
  const response = await runApiRequest(spec, request, params, meta);
  if (meta.limit !== null && !response.headers.has("x-ratelimit-limit")) {
    response.headers.set("x-ratelimit-limit", String(meta.limit));
    response.headers.set("x-ratelimit-remaining", String(meta.remaining ?? 0));
  }
  return response;
}

async function runApiRequest(
  spec: RouteSpec,
  request: Request,
  params: Record<string, string>,
  meta: RateMeta,
): Promise<Response> {
  const requestId = request.headers.get("x-request-id")?.match(/^[A-Za-z0-9_-]{6,64}$/)
    ? request.headers.get("x-request-id")!
    : newRequestId();

  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "x-request-id": requestId,
        allow: Object.keys(spec.handlers).join(", "),
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, idempotency-key, x-request-id",
        "access-control-allow-methods": `${Object.keys(spec.handlers).join(", ")}, OPTIONS`,
        "access-control-max-age": "86400",
      },
    });
  }

  try {
    const entry = spec.handlers[method as keyof RouteSpec["handlers"]];
    if (!entry) {
      throw new ApiError("method_not_allowed", `${method} is not supported on this endpoint.`, {
        headers: { allow: Object.keys(spec.handlers).join(", ") },
      });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Admin;

    const auth = await authenticate(request, admin);
    await enforceRateLimit(admin, auth, meta);

    if (entry.scope && !scopeSatisfied(auth.scopes, entry.scope)) {
      throw new ApiError(
        "insufficient_scope",
        `This API key is missing the \`${entry.scope}\` permission.`,
      );
    }

    const body = await readJsonBody(request);
    const url = new URL(request.url);

    const ctx: ApiContext = {
      request,
      requestId,
      auth,
      admin,
      url,
      params,
      body,
      require: (scope) => {
        if (!scopeSatisfied(auth.scopes, scope)) {
          throw new ApiError(
            "insufficient_scope",
            `This API key is missing the \`${scope}\` permission.`,
          );
        }
      },
    };

    // Both spellings are accepted: `x-idempotency-key` matches the older
    // MunchReach endpoints, `Idempotency-Key` matches the wider convention.
    const idemKey =
      (request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key"))?.trim() ??
      "";
    if (!entry.idempotent || !idemKey) {
      const result = await entry.handler(ctx);
      if (result instanceof Response) return result;
      return jsonResponse(result, requestId, method === "POST" ? 201 : 200);
    }

    if (idemKey.length > 255) {
      throw new ApiError("invalid_request", "`Idempotency-Key` must be 255 characters or fewer.");
    }

    const print = await fingerprint(body);
    const endpoint = `${method} ${spec.name}`;

    const { data: existing } = await admin
      .from("api_idempotency_keys")
      .select("state, status_code, response_body, request_fingerprint")
      .eq("workspace_id", auth.workspaceId)
      .eq("endpoint", endpoint)
      .eq("idempotency_key", idemKey)
      .maybeSingle();

    if (existing) {
      if (existing.request_fingerprint !== print) {
        throw new ApiError(
          "idempotency_conflict",
          "This Idempotency-Key was already used with a different request body.",
        );
      }
      if (existing.state === "completed") {
        return jsonResponse(existing.response_body, requestId, existing.status_code ?? 200, {
          "idempotent-replay": "true",
        });
      }
      throw new ApiError(
        "idempotency_in_progress",
        "A request with this Idempotency-Key is still being processed.",
      );
    }

    const { error: claimError } = await admin.from("api_idempotency_keys").insert({
      workspace_id: auth.workspaceId,
      api_key_id: auth.keyId,
      idempotency_key: idemKey,
      endpoint,
      request_fingerprint: print,
      state: "in_progress",
    });
    if (claimError) {
      // Unique violation: another in-flight request won the race.
      throw new ApiError(
        "idempotency_in_progress",
        "A request with this Idempotency-Key is still being processed.",
      );
    }

    try {
      const result = await entry.handler(ctx);
      if (result instanceof Response) {
        // Raw responses are not replayable; drop the claim so a retry re-runs.
        await admin
          .from("api_idempotency_keys")
          .delete()
          .eq("workspace_id", auth.workspaceId)
          .eq("endpoint", endpoint)
          .eq("idempotency_key", idemKey);
        return result;
      }
      const status = method === "POST" ? 201 : 200;
      await admin
        .from("api_idempotency_keys")
        .update({ state: "completed", status_code: status, response_body: result })
        .eq("workspace_id", auth.workspaceId)
        .eq("endpoint", endpoint)
        .eq("idempotency_key", idemKey);
      return jsonResponse(result, requestId, status);
    } catch (handlerError) {
      await admin
        .from("api_idempotency_keys")
        .delete()
        .eq("workspace_id", auth.workspaceId)
        .eq("endpoint", endpoint)
        .eq("idempotency_key", idemKey);
      throw handlerError;
    }
  } catch (thrown) {
    if (thrown instanceof ApiError) {
      if (thrown.status >= 500) console.error(`[api/v1][${requestId}]`, thrown);
      return errorResponse(thrown, requestId);
    }
    // Anything else is a bug or a database failure: log the detail, return none.
    console.error(`[api/v1][${requestId}] unhandled`, thrown);
    return errorResponse(
      new ApiError("internal_error", "Something went wrong while handling this request."),
      requestId,
    );
  }
}
