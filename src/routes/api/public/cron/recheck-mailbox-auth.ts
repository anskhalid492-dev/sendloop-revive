/**
 * Daily re-check of every connected mailbox's domain authentication.
 *
 * A customer's DNS can break after they connect, so this runner re-reads public
 * DNS for the oldest-checked mailboxes (one DNS result reused per domain) and
 * stores the verdict. A mailbox is only switched off on a SECOND consecutive
 * hard failure, so a first sweep over existing mailboxes reports without
 * interrupting anything.
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
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

  try {
    const { runMailboxAuthSweep } = await import("@/lib/mailbox-auth-check.server");
    const result = await runMailboxAuthSweep(supabaseAdmin, limit);
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox auth recheck failed";
    console.error("mailbox auth recheck failed", error);
    return json({ ok: false, error: message }, 500);
  }
}

export const Route = createFileRoute("/api/public/cron/recheck-mailbox-auth")({
  server: {
    handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) },
  },
});
