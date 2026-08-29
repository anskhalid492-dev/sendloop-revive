/**
 * The single error vocabulary for the public API.
 *
 * Handlers never surface database errors, stack traces or SQL. Anything
 * unexpected becomes `internal_error` and the detail goes to the server log
 * keyed by the request id the caller received.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "invalid_api_key"
  | "api_key_revoked"
  | "api_key_expired"
  | "insufficient_scope"
  | "forbidden"
  | "not_found"
  | "campaign_not_found"
  | "contact_not_found"
  | "mailbox_not_found"
  | "reply_not_found"
  | "webhook_not_found"
  | "job_not_found"
  | "method_not_allowed"
  | "invalid_request"
  | "payload_too_large"
  | "unsupported_media_type"
  | "conflict"
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "rate_limited"
  | "internal_error";

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  invalid_api_key: 401,
  api_key_revoked: 401,
  api_key_expired: 401,
  insufficient_scope: 403,
  forbidden: 403,
  not_found: 404,
  campaign_not_found: 404,
  contact_not_found: 404,
  mailbox_not_found: 404,
  reply_not_found: 404,
  webhook_not_found: 404,
  job_not_found: 404,
  method_not_allowed: 405,
  invalid_request: 422,
  payload_too_large: 413,
  unsupported_media_type: 415,
  conflict: 409,
  idempotency_conflict: 409,
  idempotency_in_progress: 409,
  rate_limited: 429,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { details?: unknown; headers?: Record<string, string>; status?: number },
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = options?.status ?? ERROR_STATUS[code];
    if (options?.details !== undefined) this.details = options.details;
    if (options?.headers) this.headers = options.headers;
  }
}

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    request_id: string;
    details?: unknown;
  };
};

export function errorBody(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): ApiErrorBody {
  const error: ApiErrorBody["error"] = { code, message, request_id: requestId };
  if (details !== undefined) error.details = details;
  return { error };
}
