import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Sitemap generated from the page registry plus published blog posts.
 * Draft, unpublished, noindex, admin and dashboard URLs are never emitted.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const { buildSitemap, renderSitemapXml } = await import("@/lib/site-content.server");
        const { entries } = await buildSitemap();
        const xml = renderSitemapXml(entries, origin);
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
