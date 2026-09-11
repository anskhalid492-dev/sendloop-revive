/**
 * Public passthrough for blog media.
 *
 * Media lives in the private Cloudflare R2 bucket, so the browser never talks
 * to storage directly. This route reads the object with trusted credentials and
 * streams the bytes back, keeping image URLs stable and cacheable while the
 * bucket stays fully closed.
 */
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/public/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = String((params as Record<string, string>)["_splat"] ?? "").replace(/^\/+/, "");
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });

        const { legacyKeyToR2 } = await import("@/lib/files-model");
        const { getR2Object } = await import("@/lib/r2.server");

        const key = legacyKeyToR2("blog-media", path);
        const file = await getR2Object(key);
        if (!file.ok || !file.body) return new Response("Not found", { status: 404 });

        return new Response(file.body, {
          headers: {
            "Content-Type": file.headers.get("content-type") ?? "application/octet-stream",
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
          },
        });
      },
    },
  },
});
