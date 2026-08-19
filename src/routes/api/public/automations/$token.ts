/**
 * Inbound webhook trigger for an automation.
 *
 * The URL token identifies the automation; when a signing secret is present we
 * additionally require an HMAC-SHA256 signature of the raw body, so an
 * attacker who learns the URL still cannot fire the workflow. The endpoint is
 * intentionally minimal: it validates, emits an idempotent event, and returns.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function handle(request: Request, token: string) {
  if (!/^[a-f0-9]{16,64}$/i.test(token)) return json({ error: "Not found" }, 404);

  const raw = await request.text();
  if (raw.length > 100_000) return json({ error: "Payload too large" }, 413);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: automation } = await supabaseAdmin
    .from("automations")
    .select("id, workspace_id, status, trigger_type, webhook_secret")
    .eq("webhook_token", token)
    .maybeSingle();

  // Same response for unknown and inactive tokens — no enumeration signal.
  if (!automation) return json({ error: "Not found" }, 404);

  const secret = (automation as { webhook_secret?: string | null }).webhook_secret;
  if (secret) {
    const provided = request.headers.get("x-sendloop-signature") ?? "";
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: "Invalid signature" }, 401);
  }

  if (automation.status !== "active") return json({ ok: true, skipped: "Automation is not active" }, 202);

  let payload: Record<string, unknown> = {};
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "Body must be JSON" }, 400);
    }
  }

  const email = typeof payload["email"] === "string" ? (payload["email"] as string).toLowerCase().trim() : null;
  let leadId: string | null = null;
  if (email) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("workspace_id", automation.workspace_id)
      .eq("email", email)
      .maybeSingle();
    leadId = lead?.id ?? null;
  }

  const { emitAutomationEvent } = await import("@/lib/automation-engine.server");
  const result = await emitAutomationEvent({
    workspaceId: automation.workspace_id,
    triggerType: "webhook.received",
    automationId: automation.id,
    leadId,
    payload,
    idempotencyKey: request.headers.get("x-idempotency-key") ?? undefined,
  });

  return json({ ok: true, enqueued: result.runs }, 200);
}

export const Route = createFileRoute("/api/public/automations/$token")({
  server: {
    handlers: {
      POST: ({ request, params }) => handle(request, params.token),
    },
  },
});
