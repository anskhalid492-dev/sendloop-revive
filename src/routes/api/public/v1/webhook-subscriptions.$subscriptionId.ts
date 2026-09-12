/**
 * `/api/public/v1/webhook-subscriptions/{id}` — REST Hook unsubscribe endpoint.
 *
 * Alias of `DELETE /v1/webhooks/{id}`. Deleting the subscription stops delivery
 * immediately: queued rows for the removed endpoint are cancelled by the
 * delivery worker, so no further events reach the URL.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/webhook-subscriptions/$subscriptionId")({
  server: {
    handlers: {
      GET: ({ request, params }) => dispatch(request, params),
      DELETE: ({ request, params }) => dispatch(request, params),
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
      name: "/v1/webhook-subscriptions/{id}",
      handlers: {
        GET: { scope: "webhooks:read", handler: resources.getWebhookSubscription },
        DELETE: { scope: "webhooks:write", handler: resources.deleteWebhookSubscription },
      },
    },
    request,
    params as Record<string, string>,
  );
}
