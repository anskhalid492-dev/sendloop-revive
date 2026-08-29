/**
 * `/api/public/v1/contacts/bulk` — bulk upsert, delete, archive, tag and move.
 *
 * Thin transport shell: authentication, scopes, rate limiting, idempotency and
 * error shaping all live in `handleApiRequest`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/contacts/bulk")({
  server: {
    handlers: {
      POST: ({ request, params }) => dispatch(request, params),
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
      name: "/v1/contacts/bulk",
      handlers: {
        POST: { scope: "contacts:write", idempotent: true, handler: resources.bulkContacts },
      },
    },
    request,
    params as Record<string, string>,
  );
}
