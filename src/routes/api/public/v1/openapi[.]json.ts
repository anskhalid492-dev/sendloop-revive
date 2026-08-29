/**
 * `/api/public/v1/openapi.json` — machine-readable spec.
 *
 * Public and unauthenticated on purpose: it describes the API, never any
 * workspace data, so SDK generators and API clients can fetch it directly.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/openapi.json")({
  server: {
    handlers: {
      GET: async () => {
        const { buildOpenApiDocument } = await import("@/lib/api/v1/openapi");
        return new Response(JSON.stringify(buildOpenApiDocument(), null, 2), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=300",
            "access-control-allow-origin": "*",
          },
        });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        }),
    },
  },
});
