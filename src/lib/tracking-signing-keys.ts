/**
 * Shared signing-key resolution for tracking tokens (open pixel, click links).
 *
 * `signingKey` is the strict key new tokens are signed with: the first private
 * key that is at least 16 characters after trimming.
 *
 * `verificationKeys` additionally includes the exact key the previous release
 * signed with — the first private env value that was non-empty, used raw
 * (untrimmed, any length) — so links already sitting in recipients' inboxes keep
 * verifying. Public/publishable keys and hardcoded literals are never accepted.
 * Values are never logged.
 */
const MIN_SECRET_LENGTH = 16;

export function signingKey(names: readonly string[]): string | null {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value.length >= MIN_SECRET_LENGTH) return value;
  }
  return null;
}

export function verificationKeys(names: readonly string[]): string[] {
  const keys: string[] = [];
  const strict = signingKey(names);
  if (strict) keys.push(strict);
  for (const name of names) {
    const raw = process.env[name] ?? "";
    if (raw) {
      if (!keys.includes(raw)) keys.push(raw);
      break;
    }
  }
  return keys;
}
