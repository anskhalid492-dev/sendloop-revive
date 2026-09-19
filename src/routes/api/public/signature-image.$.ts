/**
 * Public passthrough for signature images.
 *
 * Signature assets live in the private Cloudflare R2 bucket, but a recipient's
 * email client must be able to load them without a session. This route reads the
 * object with trusted credentials and streams the bytes back, so the bucket
 * stays closed and no storage credentials ever reach a customer or a recipient.
 */
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/public/signature-image/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = String((params as Record<string, string>)["_splat"] ?? "").replace(/^\/+/, "");
        if (!path || path.includes("..") || path.includes("//")) {
          return new Response("Not found", { status: 404 });
        }

        const key = path.startsWith("signatures/") ? path : `signatures/${path}`;
        const { isValidR2Key } = await import("@/lib/files-model");
        if (!isValidR2Key(key)) return new Response("Not found", { status: 404 });

        const { getR2Object } = await import("@/lib/r2.server");
        const file = await getR2Object(key);
        if (!file.ok || !file.body) return new Response("Not found", { status: 404 });

        const type = file.headers.get("content-type") ?? "application/octet-stream";
        if (!type.toLowerCase().startsWith("image/")) {
          return new Response("Not found", { status: 404 });
        }

        return new Response(file.body, {
          headers: {
            "Content-Type": type,
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=86400, s-maxage=604800",
          },
        });
      },
    },
  },
});
