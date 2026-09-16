/**
 * Click tracking endpoint.
 *
 * A reader opens `/api/public/click?t=<signed token>`; we record the click
 * against the exact message and link the token names, then forward them to the
 * real destination immediately. Recording never blocks or breaks the redirect,
 * and a token that does not verify simply goes nowhere useful instead of
 * becoming an open redirect.
 */
import { createFileRoute } from "@tanstack/react-router";

import { parseClickToken } from "@/lib/click-tracking";
import { SITE_URL } from "@/lib/seo";

function clientIp(request: Request): string | null {
  const forwarded =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

function redirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      "cache-control": "no-store, no-cache, must-revalidate, private, max-age=0",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export const Route = createFileRoute("/api/public/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t") ?? "";
        const hit = parseClickToken(token);
        if (!hit) return redirect(SITE_URL);
        try {
          const { recordClickHit } = await import("@/lib/click-tracking.server");
          await recordClickHit({
            hit,
            userAgent: request.headers.get("user-agent"),
            ip: clientIp(request),
          });
        } catch (error) {
          // The reader must always reach the page they clicked.
          console.warn("[click] recording failed", error);
        }
        return redirect(hit.url);
      },
    },
  },
});
