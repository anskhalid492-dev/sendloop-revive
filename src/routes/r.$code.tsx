/**
 * Referral link entry point: /r/<CODE>
 *
 * Records the click server-side, drops a first-party attribution cookie and
 * forwards the visitor to the signup page. The cookie is readable by the
 * signup screen so the code can be claimed once the account exists.
 */
import { createFileRoute } from "@tanstack/react-router";

import { REFERRAL_COOKIE, normalizeCode } from "@/lib/referral-model";

async function handle(request: Request, code: string) {
  const url = new URL(request.url);
  const normalized = normalizeCode(code);
  const destination = new URL("/signup", url.origin);

  if (!normalized) {
    return new Response(null, { status: 302, headers: { location: destination.toString() } });
  }

  destination.searchParams.set("ref", normalized);

  const { recordClick, hashIp, clientIp, getProgram } = await import("@/lib/referral.server");
  let cookieDays = 60;
  try {
    const program = await getProgram();
    cookieDays = program.cookie_duration_days ?? 60;
    await recordClick({
      code: normalized,
      ipHash: await hashIp(clientIp(request)),
      userAgent: request.headers.get("user-agent"),
      referer: request.headers.get("referer"),
      landingPath: url.pathname,
    });
  } catch {
    // Never block the visitor if tracking fails.
  }

  const maxAge = 60 * 60 * 24 * cookieDays;
  return new Response(null, {
    status: 302,
    headers: {
      location: destination.toString(),
      "set-cookie": `${REFERRAL_COOKIE}=${normalized}; Path=/; Max-Age=${maxAge}; SameSite=Lax`,
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/r/$code")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.code),
    },
  },
});
