/**
 * Background domain re-verification.
 *
 * Customers never wait for an admin. This runner picks up domains that are not
 * ready to send yet (DNS still propagating, provider authorisation pending) and
 * re-runs the automatic pipeline: DNS lookups -> provider authorisation ->
 * ready to send.
 *
 * Auth: shared secret via `x-sendloop-signature`, `Authorization: Bearer`, or
 * `?token=` (reuses INBOUND_EMAIL_SECRET).
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
  const secrets = [dbToken, process.env["DOMAIN_CRON_SECRET"], process.env["INBOUND_EMAIL_SECRET"]].filter(
    (value): value is string => Boolean(value),
  );
  if (secrets.length === 0) return json({ error: "Domain runner is not configured" }, 503);
  if (!secrets.some((secret) => secretMatches(provided, secret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const limitParam = Number(url.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 20;

  try {
    const { runDomainVerification } = await import("@/lib/domain-verification.server");

    const { data, error } = await supabaseAdmin
      .from("sending_domains")
      .select(
        "id, workspace_id, domain, dkim_selector, provider, provider_id, provider_domain_id, provider_records, stage, disabled_at",
      )
      .is("disabled_at", null)
      .neq("stage", "ready")
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) throw new Error(error.message);

    let ready = 0;
    let pending = 0;
    for (const row of data ?? []) {
      try {
        const outcome = await runDomainVerification(supabaseAdmin, row);
        if (outcome.readyToSend) ready += 1;
        else pending += 1;
      } catch (rowError) {
        pending += 1;
        console.error(`[domain-recheck] ${row.domain} failed`, rowError);
      }
    }

    return json({ ok: true, checked: (data ?? []).length, ready, pending }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Domain recheck failed";
    console.error("domain recheck failed", error);
    return json({ ok: false, error: message }, 500);
  }
}

export const Route = createFileRoute("/api/public/cron/recheck-domains")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
