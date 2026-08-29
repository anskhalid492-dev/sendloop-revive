/**
 * `/api/public/v1/campaigns/{id}/sequence` — read and append sequence steps.
 *
 * Thin transport shell: authentication, scopes, rate limiting, idempotency and
 * error shaping all live in `handleApiRequest`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/campaigns/$campaignId/sequence")({
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
  const resources = await import("@/lib/api/v1/resources/campaigns.server");
  return handleApiRequest(
    {
      name: "/v1/campaigns/{id}/sequence",
      handlers: {
        GET: { scope: "sequences:read", handler: resources.listSteps },
        POST: { scope: "sequences:write", idempotent: true, handler: resources.createStep },
      },
    },
    request,
    params as Record<string, string>,
  );
}
