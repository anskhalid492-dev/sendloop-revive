/**
 * Continues background CSV lead imports.
 *
 * Normal imports are driven straight after upload, so this runner exists as the
 * safety net: it picks up jobs whose worker died mid-file (expired lease) and
 * resumes them from the last committed chunk.
 *
 * Auth: shared secret via `x-munchreach-signature`, `Authorization: Bearer`, or
 * `?token=` (same secrets as the other runners).
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
  for (let i = 0; i < expected.length; i += 1)
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
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
    .eq("key", "domain_runner")
    .maybeSingle();
  const dbToken = (settings?.value as { token?: string } | null)?.token ?? null;
  const secrets = [
    dbToken,
    process.env["DOMAIN_CRON_SECRET"],
    process.env["INBOUND_EMAIL_SECRET"],
  ].filter((value): value is string => Boolean(value));
  if (secrets.length === 0) return json({ error: "Runner is not configured" }, 503);
  if (!secrets.some((secret) => secretMatches(provided, secret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const limitParam = Number(url.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 25) : 5;

  try {
    const { runLeadImportQueue } = await import("@/lib/lead-import.server");
    const result = await runLeadImportQueue(supabaseAdmin as never, limit);
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lead import runner failed";
    console.error("lead import runner failed", error);
    return json({ ok: false, error: message }, 500);
  }
}

export const Route = createFileRoute("/api/public/cron/run-lead-imports")({
  server: {
    handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) },
  },
});
