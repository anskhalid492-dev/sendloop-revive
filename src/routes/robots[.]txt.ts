import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * robots.txt is generated from the admin-managed configuration so crawl rules
 * can change without a deploy. If the lookup fails we still serve a valid
 * permissive file rather than an error page.
 */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        let body = `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
        try {
          const { renderRobotsTxt } = await import("@/lib/site-content.server");
          body = await renderRobotsTxt(origin);
        } catch {
          // fall through to the permissive default
        }
        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=600",
          },
        });
      },
    },
  },
});
