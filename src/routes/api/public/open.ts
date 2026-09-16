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

export const Route = createFileRoute("/api/public/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t") ?? "";
        const target = parseOpenToken(token);
        if (target) {
          try {
            const { recordOpenHit } = await import("@/lib/open-tracking.server");
            await recordOpenHit({
              target,
              userAgent: request.headers.get("user-agent"),
              ip: clientIp(request),
            });
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
