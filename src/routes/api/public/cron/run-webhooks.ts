/**
 * Webhook delivery worker.
 *
 * Called on a schedule (pg_cron or any external scheduler) with the shared
 * runner token. It drains due deliveries and applies the exponential backoff
 * defined in `src/lib/api/v1/webhooks.ts`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/run-webhooks")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});

async function run(request: Request) {
  const expected = process.env["CRON_RUNNER_TOKEN"] ?? "";
  const token =
    new URL(request.url).searchParams.get("token") ??
    request.headers.get("x-cron-token") ??
    "";

  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runWebhookDeliveries } = await import("@/lib/api/v1/webhook-delivery.server");

  try {
    const result = await runWebhookDeliveries(supabaseAdmin, 50);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("[cron/run-webhooks]", error);
    return new Response(JSON.stringify({ ok: false, error: "delivery_run_failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
