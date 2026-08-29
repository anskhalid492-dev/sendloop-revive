/**
 * Webhook delivery worker.
 *
 * A scheduler calls this endpoint to drain due webhook deliveries and apply the
 * exponential backoff defined in `src/lib/api/v1/webhooks.ts`. Deliveries are
 * never attempted inline on a send or reply path, so a dead customer endpoint
 * can never slow outbound mail down.
 *
 * Auth: the same shared runner secret the other cron endpoints accept, via
 * `x-sendloop-signature`, `Authorization: Bearer`, or `?token=`.
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

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1)
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function run(request: Request) {
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-sendloop-signature") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("token") ??
    "";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: runnerSettings } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "campaign_runner")
    .maybeSingle();
  const secrets = [
    (runnerSettings?.value as { token?: string } | null)?.token,
    process.env["CAMPAIGN_CRON_SECRET"],
    process.env["INBOUND_EMAIL_SECRET"],
  ].filter((value): value is string => Boolean(value));

  if (secrets.length === 0) return json({ error: "Runner is not configured" }, 503);
  if (!secrets.some((secret) => secretMatches(provided, secret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { runWebhookDeliveries } = await import("@/lib/api/v1/webhook-delivery.server");
  try {
    const result = await runWebhookDeliveries(supabaseAdmin, 50);
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    console.error("[cron/run-webhooks]", error);
    return json({ ok: false, error: "delivery_run_failed" }, 500);
  }
}
