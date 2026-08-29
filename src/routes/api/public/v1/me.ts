/**
 * `/api/public/v1/me` — verify a key.
 *
 * The first call every integration makes: confirms the key is live and shows
 * exactly which workspace and scopes it resolves to, so a misconfigured key is
 * obvious before any real request is attempted.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/me")({
  server: {
    handlers: {
      GET: ({ request }) => dispatch(request),
      OPTIONS: ({ request }) => dispatch(request),
    },
  },
});

async function dispatch(request: Request) {
  const { handleApiRequest } = await import("@/lib/api/v1/runtime.server");
  return handleApiRequest(
    {
      name: "/v1/me",
      handlers: {
        GET: {
          // Any valid key can identify itself; no resource data is exposed.
          scope: "campaigns:read",
          handler: async (ctx) => {
            const { data: workspace } = await ctx.admin
              .from("workspaces")
              .select("id, name")
              .eq("id", ctx.auth.workspaceId)
              .maybeSingle();
            return {
              data: {
                object: "api_key_context",
                api_key_id: ctx.auth.keyId,
                workspace: { id: ctx.auth.workspaceId, name: workspace?.name ?? null },
                scopes: ctx.auth.scopes,
                rate_limit_per_minute: ctx.auth.rateLimitPerMinute,
              },
            };
          },
        },
      },
    },
    request,
    {},
  );
}
