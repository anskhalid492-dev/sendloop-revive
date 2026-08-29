/**
 * Campaign runner.
 *
 * A scheduler (pg_cron, an external cron service, or a manual ping) calls this
 * endpoint to keep every active campaign moving: due messages are sent through
 * the managed provider and follow-up steps are queued once their delay passes.
 *
 * Auth: shared secret via `x-sendloop-signature`, `Authorization: Bearer`, or
 * `?token=`. It reuses INBOUND_EMAIL_SECRET so no extra secret is required.
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
  // Liveness heartbeat: proves the external (pg_cron) registration still calls
  // this endpoint. The admin console alerts when it goes stale.
  await supabaseAdmin.from("platform_settings").upsert(
    { key: "campaign_scheduler_heartbeat", value: { lastTickAt: new Date().toISOString() } },
    { onConflict: "key" },
  );

  const { runCampaignScheduler } = await import("@/lib/campaign-scheduler.server");

  const only = url.searchParams.get("campaignId");
  const now = new Date().toISOString();
  let query = supabaseAdmin
    .from("campaigns")
    .select("id, name")
    .in("status", ["active", "scheduled"])
    .or(`status.eq.active,start_at.is.null,start_at.lte.${now}`);
  if (only) query = query.eq("id", only);
  const { data: campaigns, error } = await query.limit(50);
  if (error) return json({ error: error.message }, 500);

  // Bounded, resumable run: this always answers inside the HTTP timeout and the
  // next cron tick continues wherever this one stopped.
  const summary = await runCampaignScheduler(supabaseAdmin, (campaigns ?? []) as { id: string }[]);
  return json(summary, 200);
}

export const Route = createFileRoute("/api/public/cron/run-campaigns")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
