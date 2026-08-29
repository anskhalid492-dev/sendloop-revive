/**
 * `/api/public/v1/campaigns/{id}` — read, update and delete one campaign.
 *
 * Thin transport shell: authentication, scopes, rate limiting, idempotency and
 * error shaping all live in `handleApiRequest`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/campaigns/$campaignId")({
  server: {
    handlers: {
      GET: ({ request, params }) => dispatch(request, params),
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
      name: "/v1/campaigns/{id}",
      handlers: {
        GET: { scope: "campaigns:read", handler: resources.getCampaign },
        PATCH: { scope: "campaigns:write", handler: resources.updateCampaign },
        DELETE: { scope: "campaigns:write", handler: resources.deleteCampaign },
      },
    },
    request,
    params as Record<string, string>,
  );
}
