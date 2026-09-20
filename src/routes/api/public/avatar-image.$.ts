/**
 * Stable image URL for profile pictures.
 *
 * Profile pictures are stored in the private Cloudflare R2 bucket. They are
 * shown in the app header, on the profile page and to teammates in the same
 * workspace, so a short-lived signed link tied to one signer was the wrong
 * shape: any hiccup in issuing it made a saved picture look like it had
 * vanished, and a teammate could never load it at all.
 *
 * This route streams the stored bytes through the app instead, so the bucket
 * stays closed, no storage credentials leave the server, and the URL a picture
 * is rendered from never expires. Keys carry a random id, so they cannot be
 * guessed, and only image objects under the avatars prefix are ever served.
 */
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/public/avatar-image/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = String((params as Record<string, string>)["_splat"] ?? "").replace(/^\/+/, "");
        if (!path || path.includes("..") || path.includes("//")) {
          return new Response("Not found", { status: 404 });
        }

        const key = path.startsWith("avatars/") ? path : `avatars/${path}`;
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
