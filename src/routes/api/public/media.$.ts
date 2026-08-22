/**
 * Public passthrough for blog media.
 *
 * The storage bucket is private and has no public read rule, so the browser
 * never talks to it directly. This route signs a short-lived URL server-side
 * with trusted credentials and streams the bytes back, which keeps image URLs
 * stable and cacheable while the bucket stays fully closed.
 */
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/public/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = String((params as Record<string, string>)["_splat"] ?? "").replace(/^\/+/, "");
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin.storage
          .from("blog-media")
          .createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) return new Response("Not found", { status: 404 });

        const file = await fetch(data.signedUrl);
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

