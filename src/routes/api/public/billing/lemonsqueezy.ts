import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/billing/lemonsqueezy")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, endpoint: "lemonsqueezy-webhook", method: "POST" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      POST: async ({ request }) => {
        const { handleBillingWebhook } = await import("@/lib/billing/webhook.server");
        return handleBillingWebhook("lemonsqueezy", request);
      },
    },
  },
});
