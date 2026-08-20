import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/billing/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleBillingWebhook } = await import("@/lib/billing/webhook.server");
        return handleBillingWebhook("stripe", request);
      },
    },
  },
});
