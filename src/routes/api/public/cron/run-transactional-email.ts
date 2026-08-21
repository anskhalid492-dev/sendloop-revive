/**
 * Transactional email queue runner.
 *
 * Called by the scheduler (pg_cron) or an external cron. Every run is bounded,
 * single-flight (database lease), idempotent per message, and exits immediately
 * while the system is paused.
 *
 * Auth: shared secret via `x-sendloop-signature`, `Authorization: Bearer`, or
 * `?token=`. The token lives in platform settings; env secrets stay supported.
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
  const { processTransactionalQueue } = await import("@/lib/transactional-email.server");

  const { data: settings } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "transactional_runner")
    .maybeSingle();
  const dbToken = (settings?.value as { token?: string } | null)?.token ?? null;
  const secrets = [dbToken, process.env["TRANSACTIONAL_CRON_SECRET"], process.env["INBOUND_EMAIL_SECRET"]].filter(
    (value): value is string => Boolean(value),
  );
  if (secrets.length === 0) return json({ error: "Runner is not configured" }, 503);
  if (!provided || !secrets.some((secret) => secretMatches(provided, secret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let limit: number | undefined;
  try {
    const body = (await request.json()) as { limit?: number } | null;
    if (body && typeof body.limit === "number") limit = body.limit;
  } catch {
    /* GET or empty body */
  }

  try {
    const summary = await processTransactionalQueue(supabaseAdmin, limit ? { limit } : {});
    return json(summary, 200);
  } catch (error) {
    console.error("transactional runner failed", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Run failed" }, 500);
  }
}

export const Route = createFileRoute("/api/public/cron/run-transactional-email")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
