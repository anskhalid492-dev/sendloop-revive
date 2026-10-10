/**
 * Open tracking pixel endpoint.
 *
 * A mail client requests `/api/public/open?t=<signed token>`; we record the open
 * against the exact message the token names and return a real 1x1 transparent
 * GIF — never a redirect, so every mail client renders it — with caching fully
 * disabled so a genuine later open by the same reader still registers.
 *
 * The response is identical whether or not the token is valid: no enumeration,
 * no broken-image icon in someone's inbox.
 */
import { createFileRoute } from "@tanstack/react-router";

import { openPixelHeaders, parseOpenToken, transparentGifBytes } from "@/lib/open-tracking";

function pixel(): Response {
  const bytes = transparentGifBytes();
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Response(body, { status: 200, headers: openPixelHeaders(bytes.byteLength) });
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

/**
 * Some mail clients mangle the query (`t+=`, stray encoded characters). The
 * signature still has to verify, so tolerating them cannot admit a forged token.
 */
export function readPixelToken(url: URL): string {
  let raw = url.searchParams.get("t");
  if (raw == null) {
    for (const [key, value] of url.searchParams) {
      if (key.trim() === "t") {
        raw = value;
        break;
      }
    }
  }
  return (raw ?? "").replace(/[^A-Za-z0-9_.-]/g, "");
}

export const Route = createFileRoute("/api/public/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = readPixelToken(new URL(request.url));
        const target = parseOpenToken(token);
        if (!target) {
          // Diagnostic only: never logs the token or any recipient data.
          console.log(JSON.stringify({ event: "open_pixel", result: "ignored", reason: token ? "invalid_token" : "missing_token", len: token.length }));
        }
        if (target) {
          try {
            const { recordOpenHit } = await import("@/lib/open-tracking.server");
            const outcome = await recordOpenHit({
              target,
              userAgent: request.headers.get("user-agent"),
              ip: clientIp(request),
            });
            console.log(JSON.stringify({ event: "open_pixel", result: outcome.recorded ? "recorded" : "ignored", reason: outcome.reason ?? null, prefetch: outcome.isPrefetch }));
          } catch (error) {
            // The reader must always get the image back.
            console.warn("[open-pixel] recording failed", error);
          }
        }
        return pixel();
      },
    },
  },
});
