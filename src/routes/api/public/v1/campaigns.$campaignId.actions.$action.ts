/**
 * `/api/public/v1/campaigns/{id}/actions/{action}` — launch, pause, resume, stop.
 *
 * Actions run through the same services the dashboard uses, so plan
 * entitlements, readiness checks and queue handling are identical.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/campaigns/$campaignId/actions/$action")({
  server: {
    handlers: {
      POST: ({ request, params }) => dispatch(request, params),
      OPTIONS: ({ request, params }) => dispatch(request, params),
    },
  },
});

const ACTIONS = ["launch", "pause", "resume", "stop"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatch(request: Request, params: any) {
  const { handleApiRequest } = await import("@/lib/api/v1/runtime.server");
  const { ApiError } = await import("@/lib/api/v1/errors");
  const { campaignAction } = await import("@/lib/api/v1/resources/campaigns.server");

  return handleApiRequest(
    {
      name: "/v1/campaigns/{id}/actions/{action}",
      handlers: {
        POST: {
          scope: "campaigns:write",
          idempotent: true,
          handler: async (ctx) => {
            const action = String(ctx.params["action"] ?? "");
            if (!(ACTIONS as readonly string[]).includes(action)) {
              throw new ApiError("not_found", `Unknown action \`${action}\`.`, {
                details: { allowed: ACTIONS },
              });
            }
            return campaignAction(ctx, action as (typeof ACTIONS)[number]);
          },
        },
      },
    },
    request,
    params as Record<string, string>,
  );
}
