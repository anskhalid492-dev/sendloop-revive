/**
 * Shared password policy for every place a password is chosen: signup,
 * recovery (/reset-password) and the signed-in change form in settings.
 *
 * Two layers:
 *  1. `checkPasswordRules` — synchronous structural rules (length, character
 *     mix, common passwords, personal data, keyboard runs).
 *  2. `isPasswordBreached` — Have I Been Pwned range API using k-anonymity:
 *     the password is hashed with SHA-1 in the browser and only the first five
 *     hex characters of the hash are sent. The password itself never leaves the
 *     device, and neither our servers nor HIBP ever see it.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt limit used by the auth provider

/** Small high-frequency list; the breach check covers the long tail. */
const COMMON_PASSWORDS = new Set(
  [
    "password",
    "password1",
    "password12",
    "password123",
    "password1234",
    "passw0rd123",
    "123456789012",
    "1234567890",
    "qwertyuiop",
    "qwerty123456",
    "letmein12345",
    "iloveyou1234",
    "administrator",
    "welcome12345",
    "welcome123456",
    "abc123456789",
    "monkey123456",
    "dragon123456",
    "football1234",
    "baseball1234",
    "sunshine1234",
    "princess1234",
    "trustno1no1",
    "changeme1234",
    "starwars1234",
    "superman1234",
    "qazwsxedcrfv",
    "asdfghjkl123",
    "zaq12wsxcde3",
    "p@ssword1234",
    "coldemail123",
    "munchreach123",
  ].map((value) => value.toLowerCase()),
);

const KEYBOARD_RUNS = [
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "01234567890",
];

function hasRun(value: string, minRun = 5): boolean {
  const lower = value.toLowerCase();
  for (const row of KEYBOARD_RUNS) {
    for (let i = 0; i + minRun <= row.length; i += 1) {
      const chunk = row.slice(i, i + minRun);
      if (lower.includes(chunk) || lower.includes([...chunk].reverse().join(""))) return true;
    }
  }
  return false;
}

export type PasswordContext = {
  email?: string | null;
  fullName?: string | null;
};

/** Structural checks. Returns the first problem, or null when the password passes. */
export function checkPasswordRules(password: string, context: PasswordContext = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (/\s{2,}/.test(password)) return "Remove repeated spaces";
  if (!/[a-z]/.test(password)) return "Add a lower case letter";
  if (!/[A-Z]/.test(password)) return "Add an upper case letter";
  if (!/[0-9]/.test(password)) return "Add a number";

  const lower = password.toLowerCase();
  if (new Set(lower).size < 5) return "Use a wider mix of characters";
  if (/^(.)\1+$/.test(password)) return "Do not repeat a single character";
  if (COMMON_PASSWORDS.has(lower)) return "That password is too common. Choose something unique";
  if (hasRun(password)) return "Avoid keyboard or number sequences like 123456 or qwerty";
  if (lower.includes("munchreach")) return "Do not use the product name in your password";

  const name = context.fullName?.trim().toLowerCase();
  if (name && name.length >= 4 && lower.includes(name)) return "Do not include your name";
  const email = context.email?.trim().toLowerCase();
  const localPart = email?.split("@")[0];
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    return "Do not include your email address";
  }
  return null;
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Have I Been Pwned k-anonymity lookup. Only the first 5 hash characters are
 * sent. Returns false when the service cannot be reached — a transient network
 * failure must never block a legitimate signup (the structural rules still apply).
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [candidate, countRaw] = line.trim().split(":");
      if (candidate === suffix && Number(countRaw ?? 0) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const BREACHED_PASSWORD_MESSAGE =
  "This password has appeared in a known data breach. Please choose a different one.";

/** Full check used by every password form. */
export async function validatePassword(
  password: string,
  context: PasswordContext = {},
): Promise<string | null> {
  const structural = checkPasswordRules(password, context);
  if (structural) return structural;
  if (await isPasswordBreached(password)) return BREACHED_PASSWORD_MESSAGE;
  return null;
}

/** 0-4 strength score for the meter shown next to the field. */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (checkPasswordRules(password) !== null) score = Math.min(score, 1);
  return score;
}
