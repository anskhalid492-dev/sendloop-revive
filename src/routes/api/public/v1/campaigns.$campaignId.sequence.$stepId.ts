/**
 * `/api/public/v1/campaigns/{id}/sequence/{step_id}` — edit one sequence step.
 *
 * Thin transport shell: authentication, scopes, rate limiting, idempotency and
 * error shaping all live in `handleApiRequest`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/campaigns/$campaignId/sequence/$stepId")({
  server: {
    handlers: {
      PATCH: ({ request, params }) => dispatch(request, params),
      DELETE: ({ request, params }) => dispatch(request, params),
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
      name: "/v1/campaigns/{id}/sequence/{step}",
      handlers: {
        PATCH: { scope: "sequences:write", handler: resources.updateStep },
        DELETE: { scope: "sequences:write", handler: resources.deleteStep },
      },
    },
    request,
    params as Record<string, string>,
  );
}
