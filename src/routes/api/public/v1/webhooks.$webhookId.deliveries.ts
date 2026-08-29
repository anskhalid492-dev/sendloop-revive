/**
 * `/api/public/v1/webhooks/{id}/deliveries` — delivery attempts and their outcome.
 *
 * Thin transport shell: authentication, scopes, rate limiting, idempotency and
 * error shaping all live in `handleApiRequest`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/webhooks/$webhookId/deliveries")({
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
  const resources = await import("@/lib/api/v1/resources/webhooks.server");
  return handleApiRequest(
    {
      name: "/v1/webhooks/{id}/deliveries",
      handlers: {
        GET: { scope: "webhooks:read", handler: resources.listDeliveries },
      },
    },
    request,
    params as Record<string, string>,
  );
}
