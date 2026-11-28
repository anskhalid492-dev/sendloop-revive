import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/integrations/microsoft/initiate")({
  server: { handlers: { POST: async ({ request }) => {
    const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
    // Public URL does not imply a public action. The server function validates
    // the bearer and workspace access; never accept a session token in the URL.
    if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
      return new Response("Sign in before connecting a Microsoft mailbox.", { status: 401, headers });
    }
    try {
      const { initiateMicrosoftMailboxOAuth } = await import("@/lib/microsoft-oauth.functions");
      const result = await initiateMicrosoftMailboxOAuth({ data: await request.json() });
      return Response.json(result, { headers });
    } catch {
      return new Response("Microsoft authorization could not be started. Check configuration, sign-in and workspace access. No mailbox was connected.", { status: 400, headers });
    }
  } } },
});