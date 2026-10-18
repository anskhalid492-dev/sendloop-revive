import { createFileRoute } from "@tanstack/react-router";

/** Retired custom-HMAC endpoint. Only native billing webhooks create commissions. */
export const Route = createFileRoute("/api/public/referral/billing")({
  server: { handlers: { POST: () => Response.json({ error: "Use /api/public/billing/stripe" }, { status: 410 }) } },
});
