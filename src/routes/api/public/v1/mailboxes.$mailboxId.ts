/**
 * `/api/public/v1/mailboxes/{id}` — one mailbox.
 *
 * Thin transport shell: authentication, scopes, rate limiting, idempotency and
 * error shaping all live in `handleApiRequest`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/mailboxes/$mailboxId")({
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
      name: "/v1/mailboxes/{id}",
      handlers: {
        GET: { scope: "mailboxes:read", handler: resources.getMailbox },
      },
    },
    request,
    params as Record<string, string>,
  );
}
