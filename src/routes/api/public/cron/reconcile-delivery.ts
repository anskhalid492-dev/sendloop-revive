/**
 * Scheduled delivery reconciliation.
 *
 * Recovers delivery outcomes for recent sends whose webhook never arrived, so
 * campaign metrics converge on the real provider state even after an outage.
 *
 * Auth: shared secret via `x-munchreach-signature`, `Authorization: Bearer`,
 * or `?token=`.
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
  const { data: settings } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "delivery_reconcile_runner")
    .maybeSingle();
  const dbToken = (settings?.value as { token?: string } | null)?.token ?? null;
  const secrets = [dbToken, process.env["INBOUND_EMAIL_SECRET"]].filter(
    (value): value is string => Boolean(value),
  );
  if (secrets.length === 0) return json({ error: "Reconciliation runner is not configured" }, 503);
  if (!secrets.some((secret) => secretMatches(provided, secret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const { reconcileDeliveryState } = await import("@/lib/delivery-reconcile.server");
    const result = await reconcileDeliveryState();
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reconciliation failed";
    console.error("delivery reconciliation failed", error);
    return json({ ok: false, error: message }, 500);
  }
}

export const Route = createFileRoute("/api/public/cron/reconcile-delivery")({
  server: {
    handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) },
  },
});
