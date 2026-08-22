import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/billing/paddle")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, endpoint: "paddle-webhook", method: "POST" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      POST: async ({ request }) => {
        const { handleBillingWebhook } = await import("@/lib/billing/webhook.server");
        return handleBillingWebhook("paddle", request);
      },
    },
  },
});
