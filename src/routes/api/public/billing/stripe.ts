import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/billing/stripe")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, endpoint: "stripe-webhook", method: "POST" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      POST: async ({ request }) => {
        const { handleBillingWebhook } = await import("@/lib/billing/webhook.server");
        return handleBillingWebhook("stripe", request);
      },
    },
  },
});
