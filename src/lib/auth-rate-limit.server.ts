/**
 * Throttling for unauthenticated auth-email endpoints (password reset,
 * magic link). These are public endpoints that trigger outbound email, so
 * they are the classic target for enumeration and mail-bombing.
 *
 * Counters live in public.admin_rate_limits through the backend-only
 * admin_rate_limit_hit routine, so the budget is shared across all server
 * instances and can never be reset by the caller. Fixed windows: each window
 * expires on its own and the next request starts a fresh one.
 *
 * Email addresses are hashed before they become a counter key so the
 * rate-limit table never stores an address in plain text.
 */
import { createHash } from "crypto";

type Rule = { scope: string; limit: number; windowSeconds: number };

const EMAIL_RULES: Rule[] = [
  { scope: "email:15m", limit: 3, windowSeconds: 15 * 60 },
  { scope: "email:24h", limit: 10, windowSeconds: 24 * 60 * 60 },
];

const IP_RULES: Rule[] = [
  { scope: "ip:15m", limit: 10, windowSeconds: 15 * 60 },
  { scope: "ip:24h", limit: 40, windowSeconds: 24 * 60 * 60 },
];

function hashKey(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

function retryMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const wait =
    minutes < 60
      ? `${minutes} minute${minutes === 1 ? "" : "s"}`
      : `${Math.ceil(minutes / 60)} hour${Math.ceil(minutes / 60) === 1 ? "" : "s"}`;
  return `Too many requests. Please try again in about ${wait}.`;
}

export class AuthRateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(retryMessage(retryAfterSeconds));
    this.name = "AuthRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Consumes one unit of budget for every applicable rule and throws
 * AuthRateLimitError when any of them is exhausted. Counting failures never
 * block a legitimate request (fail-open on infrastructure errors only).
 */
export async function assertAuthEmailRateLimit(action: string, email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { requestMeta } = await import("@/lib/admin-security.server");

  const ip = requestMeta().ip;
  const buckets: Array<{ rule: Rule; bucket: string }> = [
    ...EMAIL_RULES.map((rule) => ({ rule, bucket: `auth:${action}:${rule.scope}:${hashKey(email)}` })),
    ...(ip ? IP_RULES.map((rule) => ({ rule, bucket: `auth:${action}:${rule.scope}:${hashKey(ip)}` })) : []),
  ];

  let blockedFor = 0;
  for (const { rule, bucket } of buckets) {
    const { data, error } = await (supabaseAdmin as any).rpc("admin_rate_limit_hit", {
      _bucket: bucket,
      _limit: rule.limit,
      _window_seconds: rule.windowSeconds,
    });
    if (error) continue; // never lock users out because the counter itself failed
    const result = data as { allowed?: boolean; retry_after_seconds?: number } | null;
    if (result && result.allowed === false) {
      blockedFor = Math.max(blockedFor, result.retry_after_seconds ?? rule.windowSeconds);
    }
  }

  if (blockedFor > 0) throw new AuthRateLimitError(blockedFor);
}
