/**
 * Server-side Cloudflare Turnstile verification.
 *
 * Every protected auth endpoint calls assertTurnstile() BEFORE any
 * authentication work happens. This sits alongside (not instead of) the
 * per-email / per-IP rate limiting in auth-rate-limit.server.ts: Turnstile
 * filters automation, the rate limiter caps volume.
 *
 * The secret key is read from the backend secret store at call time and never
 * leaves the server.
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const GENERIC_FAILURE = "Bot verification failed. Please reload the page and try again.";

function reportTurnstileMisconfiguration(codes: string[]) {
  const message = `Turnstile secret key rejected by Cloudflare (${codes.join(", ")})`;
  console.error(message);
  void import("@/lib/sentry.server")
    .then((mod) => mod.captureServerError(new Error(message)))
    .catch(() => undefined);
}

export class TurnstileError extends Error {
  readonly codes: string[];
  constructor(message: string, codes: string[] = []) {
    super(message);
    this.name = "TurnstileError";
    this.codes = codes;
  }
}

type SiteverifyResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

/** True when a secret key is configured, i.e. verification is enforced. */
export function turnstileConfigured(): boolean {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  return !!secret && secret.trim().length > 0;
}

/**
 * Verifies a Turnstile token for the given action.
 *
 * Throws TurnstileError when the token is missing, malformed, replayed,
 * expired, or issued for a different action. When no secret key is configured
 * (local/self-hosted deploys without Turnstile) verification is skipped so the
 * auth flows keep working.
 */
export async function assertTurnstile(
  token: string | null | undefined,
  action: string,
): Promise<void> {
  const secret = process.env["TURNSTILE_SECRET_KEY"]?.trim();
  if (!secret) return;

  const candidate = typeof token === "string" ? token.trim() : "";
  if (!candidate || candidate.length > 2048) {
    throw new TurnstileError(GENERIC_FAILURE, ["missing-input-response"]);
  }

  let ip: string | null = null;
  try {
    const { requestMeta } = await import("@/lib/admin-security.server");
    ip = requestMeta().ip ?? null;
  } catch {
    ip = null;
  }

  const body = new URLSearchParams({ secret, response: candidate });
  if (ip) body.set("remoteip", ip);

  let payload: SiteverifyResponse;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    });
    payload = (await response.json()) as SiteverifyResponse;
  } catch {
    // Cloudflare unreachable: treat as a failure rather than silently letting
    // unverified traffic through — the rate limiter alone is not enough here.
    throw new TurnstileError(
      "We could not complete the security check right now. Please try again in a moment.",
      ["siteverify-unreachable"],
    );
  }

  const codes = payload["error-codes"] ?? [];

  if (!payload.success) {
    // A rejected/absent SECRET is our own misconfiguration rather than a bot:
    // still reject the request (failing open would defeat the protection), but
    // report it so it can be fixed immediately.
    if (codes.some((code) => code.endsWith("-input-secret"))) {
      reportTurnstileMisconfiguration(codes);
    }
    throw new TurnstileError(GENERIC_FAILURE, codes);
  }
  if (payload.action && payload.action !== action) {
    throw new TurnstileError(GENERIC_FAILURE, ["action-mismatch"]);
  }
}
