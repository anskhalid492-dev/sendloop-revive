/**
 * Warmup runner.
 *
 * The scheduler (pg_cron or any external cron) calls this endpoint. Each run is
 * bounded, single-flight (database lease), idempotent and exits immediately
 * while the runner is paused.
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
  const { runWarmupCycle, runWarmupForAccount } = await import("@/lib/warmup-engine.server");

  // The scheduler token lives in platform_settings (written by the cron
  // migration, readable only with the service role); env secrets stay
  // supported so an external scheduler can be used instead.
  const { data: settings } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "warmup_runner")
    .maybeSingle();
  const dbToken = (settings?.value as { token?: string } | null)?.token ?? null;
  const secrets = [dbToken, process.env["WARMUP_CRON_SECRET"], process.env["INBOUND_EMAIL_SECRET"]]
    .filter((value): value is string => Boolean(value));
  if (secrets.length === 0) return json({ error: "Warmup runner is not configured" }, 503);
  if (!secrets.some((secret) => secretMatches(provided, secret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const limitParam = Number(url.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 40) : undefined;

  try {
    // Single-mailbox run: the same production pipeline, forced to send now.
    const accountId = url.searchParams.get("account");
    if (accountId) {
      const single = await runWarmupForAccount(supabaseAdmin, accountId, { max: limit ?? 1 });
      return json(single, 200);
    }
    // Queue mode only on an explicit worker_mode.warmup = "queue"; anything
    // else (missing, unreadable) keeps the legacy cycle, so flipping back is the rollback.
    const { getWorkerMode } = await import("@/lib/worker-mode.server");
    if ((await getWorkerMode(supabaseAdmin, "warmup")) === "queue") {
      const { runWarmupQueue } = await import("@/lib/warmup-queue.server");
      return json(await runWarmupQueue({ client: supabaseAdmin, ...(limit ? { limit } : {}) }), 200);
    }
    const result = await runWarmupCycle(supabaseAdmin, limit ? { limit } : {});
    return json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Warmup run failed";
    console.error("warmup runner failed", error);
    return json({ ok: false, error: message }, 500);
  }
}

export const Route = createFileRoute("/api/public/cron/run-warmup")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
