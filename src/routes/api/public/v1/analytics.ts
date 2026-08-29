/**
 * `/api/public/v1/analytics` — workspace-wide delivery and engagement rollup.
 *
 * Thin transport shell: authentication, scopes, rate limiting, idempotency and
 * error shaping all live in `handleApiRequest`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/analytics")({
  server: {
    handlers: {
      GET: ({ request, params }) => dispatch(request, params),
      OPTIONS: ({ request, params }) => dispatch(request, params),
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatch(request: Request, params: any) {
  const { handleApiRequest } = await import("@/lib/api/v1/runtime.server");
  const resources = await import("@/lib/api/v1/resources/insights.server");
  return handleApiRequest(
    {
      name: "/v1/analytics",
      handlers: {
        GET: { scope: "analytics:read", handler: resources.workspaceAnalytics },
      },
    },
    request,
    params as Record<string, string>,
  );
}
