/**
 * Inbound retry + reconciliation runner.
 *
 * A scheduler calls this endpoint to retry failed inbound webhook events using
 * the backoff configured in Admin → Providers, and to reconcile stored events
 * against the unified inbox. Auth reuses the shared inbound secret.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function run(request: Request) {
  const secret = process.env["CAMPAIGN_CRON_SECRET"] ?? process.env["INBOUND_EMAIL_SECRET"];
  if (!secret) return json({ error: "Inbound retry runner is not configured" }, 503);

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-sendloop-signature") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("token") ??
    "";
  if (!secretMatches(provided, secret)) return json({ error: "Unauthorized" }, 401);

  const { runInboundRetrySweep, reconcileInboundEvents } = await import("@/lib/inbound-ops.server");
  const retry = await runInboundRetrySweep();
  const reconciliation = await reconcileInboundEvents();

  return json(
    {
      ok: true,
      retry,
      reconciliation: {
        scanned: reconciliation.scanned,
        linked: reconciliation.linked,
        mismatched: reconciliation.mismatched,
      },
    },
    200,
  );
}

export const Route = createFileRoute("/api/public/cron/retry-inbound")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
