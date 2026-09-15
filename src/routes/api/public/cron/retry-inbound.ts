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
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-sendloop-signature") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("token") ??
    "";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Scheduler token lives in platform_settings (service-role only); env
  // secrets remain supported for external schedulers.
  const { data: runnerSettings } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "inbound_retry_runner")
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

  const { runInboundRetrySweep, reconcileInboundEvents } = await import("@/lib/inbound-ops.server");
  const retry = await runInboundRetrySweep();
  const reconciliation = await reconcileInboundEvents();

  // Warmup safety net: if the dedicated warmup schedule stops firing, warmup
  // silently stops dispatching while mailboxes still show as active. This tick
  // catches that up, and flags mailboxes stuck warming with zero sends.
  let warmup: unknown = null;
  let warmupStalls: unknown = null;
  try {
    const { ensureWarmupTick, checkStalledWarmupAccounts } = await import(
      "@/lib/warmup-watchdog.server"
    );
    warmup = await ensureWarmupTick(supabaseAdmin);
    warmupStalls = await checkStalledWarmupAccounts(supabaseAdmin);
  } catch (error) {
    console.error("warmup watchdog failed", error);
    warmup = { ran: false, reason: error instanceof Error ? error.message : "failed" };
  }

  return json(
    {
      ok: true,
      retry,
      warmup,
      warmupStalls,
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
