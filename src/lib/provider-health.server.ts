/**
 * Provider health, computed from real operations.
 *
 * Every provider API operation (credential check, domain lookup, real send)
 * writes a row to `provider_health_events`. Health is then derived from a
 * ROLLING WINDOW of those rows, never from lifetime counters — so a provider
 * that failed yesterday recovers as soon as real operations succeed again.
 *
 * A passing credential test only proves the API key works; it is one operation
 * among many and never forces the status to healthy on its own.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export const HEALTH_WINDOW_HOURS = 24;
const WINDOW_SIZE = 100;

export type HealthLevel = "healthy" | "degraded" | "down" | "unknown";

export type ProviderOperation = {
  operation: string;
  ok: boolean;
  httpStatus?: number | null;
  message?: string | null;
  domain?: string | null;
};

export type HealthEventRow = {
  id: string;
  operation: string;
  ok: boolean;
  http_status: number | null;
  error_code: string | null;
  message: string | null;
  domain: string | null;
  occurred_at: string;
};

export type ProviderDiagnostics = {
  providerId: string;
  health: HealthLevel;
  reason: string;
  errorRate: number;
  successful: number;
  failed: number;
  total: number;
  windowHours: number;
  lastError: string | null;
  lastErrorCode: string | null;
  lastHttpStatus: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  recent: HealthEventRow[];
};

/** Pulls an HTTP status out of a provider error string, whatever its shape. */
export function httpStatusFrom(message: string | null | undefined): number | null {
  if (!message) return null;
  const patterns = [
    /"statusCode"\s*:\s*(\d{3})/,
    /\[(\d{3})\]/,
    /\bstatus(?:\s*code)?[:= ]\s*(\d{3})\b/i,
    /\bHTTP\s+(\d{3})\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    const code = match?.[1] ? Number(match[1]) : null;
    if (code && code >= 100 && code <= 599) return code;
  }
  return null;
}

/** Human-readable cause, derived from the status code and the provider text. */
export function classifyProviderError(
  status: number | null,
  message: string | null | undefined,
): { code: string; reason: string } {
  const text = (message ?? "").toLowerCase();

  if (status === 401 || text.includes("invalid api key") || text.includes("unauthorized")) {
    return { code: "invalid_credentials", reason: "401 invalid API key — credentials rejected" };
  }
  if (status === 403) {
    if (text.includes("domain is not verified") || text.includes("not verified")) {
      return {
        code: "domain_not_verified",
        reason: "403 domain not verified at the provider — sends from that domain are refused",
      };
    }
    return { code: "forbidden", reason: "403 forbidden — the API key lacks permission" };
  }
  if (status === 422 || text.includes("validation_error")) {
    return { code: "validation_error", reason: "422 provider rejected the request payload" };
  }
  if (status === 429 || text.includes("rate limit") || text.includes("too many requests")) {
    return { code: "rate_limited", reason: "429 rate limit — the provider is throttling requests" };
  }
  if (status && status >= 500) {
    return { code: "provider_error", reason: `${status} provider-side error — the API is failing` };
  }
  if (status === 404) {
    return { code: "not_found", reason: "404 resource not found at the provider" };
  }
  if (
    !status &&
    (text.includes("timeout") || text.includes("could not reach") || text.includes("fetch failed"))
  ) {
    return { code: "unreachable", reason: "Provider API unreachable — network or timeout" };
  }
  if (status && status >= 400) {
    return { code: "http_error", reason: `${status} provider returned an error` };
  }
  return { code: "unknown_error", reason: message ? message.slice(0, 160) : "Unknown failure" };
}

/** Appends one real operation result to the rolling health log. */
export async function recordProviderOperation(
  admin: Admin,
  providerId: string | null,
  op: ProviderOperation,
): Promise<void> {
  if (!providerId) return;
  const status = op.httpStatus ?? httpStatusFrom(op.message);
  const code = op.ok ? null : classifyProviderError(status, op.message).code;
  try {
    await admin.from("provider_health_events").insert({
      provider_id: providerId,
      operation: op.operation.slice(0, 60),
      ok: op.ok,
      http_status: status,
      error_code: code,
      message: (op.message ?? "").slice(0, 1000) || null,
      domain: op.domain ?? null,
    });
  } catch {
    /* diagnostics must never break a send */
  }
}

function since(): string {
  return new Date(Date.now() - HEALTH_WINDOW_HOURS * 3600_000).toISOString();
}

/** Derives health for one provider from its recent operations only. */
export async function computeProviderDiagnostics(
  admin: Admin,
  providerId: string,
): Promise<ProviderDiagnostics> {
  const { data } = await admin
    .from("provider_health_events")
    .select("id, operation, ok, http_status, error_code, message, domain, occurred_at")
    .eq("provider_id", providerId)
    .gte("occurred_at", since())
    .order("occurred_at", { ascending: false })
    .limit(WINDOW_SIZE);

  const rows = (data ?? []) as HealthEventRow[];
  const failures = rows.filter((r) => !r.ok);
  const successes = rows.filter((r) => r.ok);
  const total = rows.length;
  const rate = total === 0 ? 0 : failures.length / total;

  const lastFailure = failures[0] ?? null;
  const lastSuccess = successes[0] ?? null;

  let health: HealthLevel;
  let reason: string;

  if (total === 0) {
    health = "unknown";
    reason = `No provider operations in the last ${HEALTH_WINDOW_HOURS}h — run a test to measure health.`;
  } else if (rate >= 0.5) {
    health = "down";
    reason = lastFailure
      ? `${Math.round(rate * 100)}% of the last ${total} operations failed — ${
          classifyProviderError(lastFailure.http_status, lastFailure.message).reason
        }`
      : `${Math.round(rate * 100)}% of recent operations failed.`;
  } else if (rate > 0.1) {
    health = "degraded";
    reason = lastFailure
      ? `${Math.round(rate * 100)}% of the last ${total} operations failed — ${
          classifyProviderError(lastFailure.http_status, lastFailure.message).reason
        }`
      : `${Math.round(rate * 100)}% of recent operations failed.`;
  } else {
    health = "healthy";
    reason =
      rate === 0
        ? `All ${total} operations in the last ${HEALTH_WINDOW_HOURS}h succeeded.`
        : `${successes.length} of ${total} recent operations succeeded.`;
  }

  return {
    providerId,
    health,
    reason,
    errorRate: rate,
    successful: successes.length,
    failed: failures.length,
    total,
    windowHours: HEALTH_WINDOW_HOURS,
    lastError: lastFailure?.message ?? null,
    lastErrorCode: lastFailure?.error_code ?? null,
    lastHttpStatus: lastFailure?.http_status ?? null,
    lastSuccessAt: lastSuccess?.occurred_at ?? null,
    lastFailureAt: lastFailure?.occurred_at ?? null,
    recent: rows.slice(0, 20),
  };
}

/** Recomputes health from the rolling window and stores it on the pool row. */
export async function refreshProviderHealth(
  admin: Admin,
  providerId: string,
): Promise<ProviderDiagnostics> {
  const diagnostics = await computeProviderDiagnostics(admin, providerId);
  try {
    await admin
      .from("email_providers")
      .update({
        health_status: diagnostics.health,
        health_reason: diagnostics.reason.slice(0, 500),
        health_detail: diagnostics.lastError ? diagnostics.lastError.slice(0, 500) : null,
        health_checked_at: new Date().toISOString(),
        last_http_status: diagnostics.lastHttpStatus,
        last_failure_at: diagnostics.lastFailureAt,
      })
      .eq("id", providerId);
  } catch {
    /* health persistence is best-effort */
  }
  return diagnostics;
}
