/**
 * Input validation for the public API.
 *
 * Every handler parses through `parseBody`/`parseQuery` so a validation failure
 * always produces the same `invalid_request` envelope with per-field details —
 * never a raw Zod stack or a database constraint error.
 */
import { z } from "zod";

import { ApiError } from "./errors";

export function parseWith<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
  throw new ApiError("invalid_request", "The request body failed validation.", { details });
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, url: URL): z.infer<T> {
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
  throw new ApiError("invalid_request", "One or more query parameters are invalid.", { details });
}

export const uuid = z.string().uuid();

/** Requires a real UUID in a path segment before it ever reaches a query. */
export function pathId(value: string | undefined, label = "id"): string {
  const result = uuid.safeParse(value ?? "");
  if (!result.success) {
    throw new ApiError("invalid_request", `\`${label}\` must be a UUID.`);
  }
  return result.data;
}
