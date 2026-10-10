/**
 * Marketing open pixel. Always returns the same 1x1 GIF, whether or not the
 * token is valid, so nothing can be enumerated and no image ever breaks.
 */
import { createFileRoute } from "@tanstack/react-router";

import { classifyOpenRequest, openPixelHeaders, transparentGifBytes } from "@/lib/open-tracking";
import { parseMarketingOpenToken } from "@/lib/marketing/engagement-tracking";

function pixel(): Response {
  const bytes = transparentGifBytes();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, { status: 200, headers: openPixelHeaders(bytes.byteLength) });
}

export const Route = createFileRoute("/api/public/marketing/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = parseMarketingOpenToken(new URL(request.url).searchParams.get("t") ?? "");
        if (target) {
          try {
            const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
            const ip = forwarded?.split(",")[0]?.trim() || null;
            const kind = classifyOpenRequest({ userAgent: request.headers.get("user-agent"), ip });
            const { recordMarketingOpen } = await import("@/lib/marketing/engagement.server");
            await recordMarketingOpen({ target, isPrefetch: kind.isPrefetch, source: kind.source });
          } catch {
            console.warn("[marketing-open] recording failed");
          }
        }
        return pixel();
      },
    },
  },
});
