/**
 * `/api/public/v1/webhook-subscriptions` — REST Hook subscribe endpoint.
 *
 * Alias of `POST /v1/webhooks` shaped for subscription-style callers (Zapier
 * REST Hooks): it takes a target URL plus one event and is idempotent, so
 * re-subscribing the same URL returns the existing subscription instead of
 * creating a second identical endpoint.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/webhook-subscriptions")({
  server: {
    handlers: {
      GET: ({ request, params }) => dispatch(request, params),
      POST: ({ request, params }) => dispatch(request, params),
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
      name: "/v1/webhook-subscriptions",
      handlers: {
        GET: { scope: "webhooks:read", handler: resources.listWebhooks },
        POST: {
          scope: "webhooks:write",
          idempotent: true,
          handler: resources.createWebhookSubscription,
        },
      },
    },
    request,
    params as Record<string, string>,
  );
}
