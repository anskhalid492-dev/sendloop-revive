/**
 * API key format helpers.
 *
 * Client-safe (no secrets, no database access): the same helpers are used by
 * the key management UI to render a prefix and by the server to hash and match
 * an incoming key. Only a SHA-256 hash of a key is ever stored, so the plaintext
 * secret exists exactly once — in the response to the create call.
 */

export const KEY_PREFIX = "mr_live_";
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SECRET_LENGTH = 40;

/** Mint a new plaintext key. Never persisted. */
export function generateApiKey(): string {
  const bytes = new Uint8Array(SECRET_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `${KEY_PREFIX}${out}`;
}

/** The publicly displayable portion of a key, e.g. `mr_live_a1b2c3`. */
export function keyPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 6);
}

/** Cosmetic form shown in the dashboard once the secret is gone. */
export function maskedKey(prefix: string): string {
  return `${prefix}${"•".repeat(12)}`;
}

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Shape-check before touching the database, so junk never hits a query. */
export function looksLikeApiKey(value: string): boolean {
  return (
    value.startsWith(KEY_PREFIX) &&
    value.length === KEY_PREFIX.length + SECRET_LENGTH &&
    /^[A-Za-z0-9]+$/.test(value.slice(KEY_PREFIX.length))
  );
}
