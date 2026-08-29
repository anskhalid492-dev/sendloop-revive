/**
 * Cursor pagination shared by every collection endpoint.
 *
 * Cursors are opaque to callers but deterministic for us: base64url of
 * `<iso timestamp>|<uuid>`, matching the `(created_at desc, id desc)` ordering
 * used by the collection queries. That keeps paging stable while rows are being
 * inserted, which offset paging cannot do.
 */
import { ApiError } from "./errors";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export type Cursor = { createdAt: string; id: string };

function b64urlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeCursor(cursor: Cursor): string {
  return b64urlEncode(`${cursor.createdAt}|${cursor.id}`);
}

export function decodeCursor(value: string): Cursor {
  let decoded: string;
  try {
    decoded = b64urlDecode(value);
  } catch {
    throw new ApiError("invalid_request", "The cursor is not valid.");
  }
  const index = decoded.lastIndexOf("|");
  if (index <= 0) throw new ApiError("invalid_request", "The cursor is not valid.");
  const createdAt = decoded.slice(0, index);
  const id = decoded.slice(index + 1);
  if (!createdAt || !id) throw new ApiError("invalid_request", "The cursor is not valid.");
  return { createdAt, id };
}

export function parseLimit(raw: string | null): number {
  if (raw === null || raw === "") return DEFAULT_LIMIT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new ApiError("invalid_request", "`limit` must be a positive integer.");
  }
  return Math.min(value, MAX_LIMIT);
}

export type Paginated<T> = {
  data: T[];
  pagination: { next_cursor: string | null; has_more: boolean; limit: number };
};

/**
 * Trims an over-fetched page (`limit + 1` rows) into the wire shape.
 * `cursorOf` must read the same columns the query ordered by.
 */
export function paginate<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => Cursor,
): Paginated<T> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    data: page,
    pagination: {
      next_cursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
      has_more: hasMore,
      limit,
    },
  };
}
