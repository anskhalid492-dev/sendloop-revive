/**
 * Public passthrough for blog media.
 *
 * The storage bucket is private, so the browser never talks to it directly.
 * This route mints a short-lived signed URL with the publishable key (a read
 * policy allows it) and redirects, which keeps image URLs stable and
 * cacheable while the bucket itself stays closed for writes.
 */
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/config";

export const Route = createFileRoute("/api/public/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = String((params as Record<string, string>)["_splat"] ?? "").replace(/^\/+/, "");
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });

        const url = process.env["SUPABASE_URL"] || SUPABASE_URL;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || SUPABASE_PUBLISHABLE_KEY;

        const signed = await fetch(`${url}/storage/v1/object/sign/blog-media/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({ expiresIn: 3600 }),
        });
        if (!signed.ok) return new Response("Not found", { status: 404 });
        const body = (await signed.json()) as { signedURL?: string };
        if (!body.signedURL) return new Response("Not found", { status: 404 });

        const file = await fetch(`${url}/storage/v1${body.signedURL}`);
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
