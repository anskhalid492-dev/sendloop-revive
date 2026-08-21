/**
 * AI personalization queue runner.
 *
 * A scheduler calls this endpoint on a short interval. Each run processes one
 * bounded batch behind a single-flight lease, marks progress per item, and stops
 * the whole queue on credit/policy denials (with a single probe item per later
 * run to detect recovery).
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
    request.headers.get("x-munchreach-signature") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("token") ??
    "";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: runnerSettings } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "ai_personalization_runner")
    .maybeSingle();
  const secrets = [
    (runnerSettings?.value as { token?: string } | null)?.token,
    process.env["CAMPAIGN_CRON_SECRET"],
  ].filter((value): value is string => Boolean(value));
  if (secrets.length === 0) return json({ error: "Runner is not configured" }, 503);
  if (!secrets.some((secret) => secretMatches(provided, secret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { processAiPersonalizationBatch } = await import("@/lib/ai-personalization.server");
  const result = await processAiPersonalizationBatch(
    `cron-${Math.random().toString(36).slice(2, 10)}`,
  );
  return json({ ok: true, ...result }, 200);
}

export const Route = createFileRoute("/api/public/cron/run-ai-personalization")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
