/**
 * Scheduled sending-provider health probes.
 *
 * The scheduler calls this endpoint every few minutes. Each enabled provider in
 * the global pool is probed against its live API; the result is persisted on the
 * pool row (healthy / degraded / down) and written to the routing audit trail,
 * so automatic routing and failover always work from fresh health data.
 *
 * Auth: shared secret via `x-munchreach-signature`, `Authorization: Bearer`, or
 * `?token=` (reuses INBOUND_EMAIL_SECRET).
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
    request.headers.get("x-munchreach-signature") ??
    request.headers.get("x-sendloop-signature") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("token") ??
    "";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "provider_health_runner")
    .maybeSingle();
  const dbToken = (settings?.value as { token?: string } | null)?.token ?? null;
  const secrets = [dbToken, process.env["PROVIDER_HEALTH_CRON_SECRET"], process.env["INBOUND_EMAIL_SECRET"]].filter(
    (value): value is string => Boolean(value),
  );
  if (secrets.length === 0) return json({ error: "Provider health runner is not configured" }, 503);
  if (!secrets.some((secret) => secretMatches(provided, secret))) return json({ error: "Unauthorized" }, 401);

  try {
    const { checkPoolHealth } = await import("@/lib/provider-pool.server");
    const results = await checkPoolHealth(supabaseAdmin);
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.health] = (acc[r.health] ?? 0) + 1;
      return acc;
    }, {});
    return json({ ok: true, checked: results.length, summary, results }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider health check failed";
    console.error("provider health check failed", error);
    return json({ ok: false, error: message }, 500);
  }
}

export const Route = createFileRoute("/api/public/cron/provider-health")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
