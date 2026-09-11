/**
 * Automation worker endpoint.
 *
 * pg_cron (or any external scheduler) calls this every minute. The engine
 * claims queued/resumable runs with a single-flight database lock, so multiple
 * overlapping invocations never execute the same run twice.
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
    request.headers.get("x-sendloop-signature") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("token") ??
    "";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: runnerSettings } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "automation_runner")
    .maybeSingle();

  const secrets = [
    (runnerSettings?.value as { token?: string } | null)?.token,
    process.env["CAMPAIGN_CRON_SECRET"],
    process.env["INBOUND_EMAIL_SECRET"],
  ].filter((value): value is string => Boolean(value));
  if (secrets.length === 0) return json({ error: "Runner is not configured" }, 503);
  if (!secrets.some((secret) => secretMatches(provided, secret))) return json({ error: "Unauthorized" }, 401);

  const limitParam = Number(url.searchParams.get("limit") ?? "25");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 25) : 25;

  const { runAutomationCycle } = await import("@/lib/automation-engine.server");
  try {
    const result = await runAutomationCycle(limit);
    // A transient claim failure is reported, not raised: the next cycle retries
    // and the scheduler must not treat it as a hard endpoint failure.
    return json({ ok: !result.claimError, ...result }, 200);
  } catch (error) {
    console.error("automation cron cycle failed", error);
    return json({ ok: false, error: (error as Error).message }, 200);
  }
}

export const Route = createFileRoute("/api/public/cron/run-automations")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});
