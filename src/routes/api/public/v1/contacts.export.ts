/**
 * `/api/public/v1/contacts/export` — CSV export of the workspace contacts.
 *
 * Thin transport shell: authentication, scopes, rate limiting, idempotency and
 * error shaping all live in `handleApiRequest`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/contacts/export")({
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
  const resources = await import("@/lib/api/v1/resources/contacts.server");
  return handleApiRequest(
    {
      name: "/v1/contacts/export",
      handlers: {
        GET: { scope: "contacts:read", handler: resources.exportContacts },
      },
    },
    request,
    params as Record<string, string>,
  );
}
