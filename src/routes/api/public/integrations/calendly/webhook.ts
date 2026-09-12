/**
 * Calendly webhook receiver (`invitee.created` / `invitee.canceled`).
 *
 * Security: every call is HMAC-verified against the per-connection signing key
 * that MunchReach generated when the subscription was created, so only Calendly
 * can write here. Repeated deliveries are de-duplicated on
 * `integration_events.idempotency_key`, so a retry can never count a meeting
 * twice.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Payload = {
  event?: string;
  created_at?: string;
  payload?: {
    email?: string;
    name?: string;
    uri?: string;
    rescheduled?: boolean;
    cancel_url?: string;
    scheduled_event?: {
      uri?: string;
      name?: string;
      start_time?: string;
    };
  };
};

export const Route = createFileRoute("/api/public/integrations/calendly/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 200_000) return json({ error: "Payload too large" }, 413);

        const { verifyWebhookSignature, readCalendlyCredentials, CALENDLY_SLUG } = await import(
          "@/lib/calendly.server"
        );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: Payload;
        try {
          body = JSON.parse(raw) as Payload;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const eventType = body.event ?? "";
        if (!["invitee.created", "invitee.canceled"].includes(eventType)) {
          return json({ ok: true, ignored: eventType || "unknown" });
        }

        const signature = request.headers.get("calendly-webhook-signature");
        if (!signature) return json({ error: "Missing signature" }, 401);

        // The signature identifies the connection: only the holder of the
        // matching per-connection signing key can ever verify.
        const { data: connections } = await supabaseAdmin
          .from("integration_connections")
          .select("id, workspace_id, status")
          .eq("slug", CALENDLY_SLUG)
          .neq("status", "disabled");

        let matchedConnection: { id: string; workspace_id: string } | null = null;
        for (const row of (connections ?? []) as Array<{ id: string; workspace_id: string }>) {
          const creds = await readCalendlyCredentials(row.id);
          const key = creds?.webhook_signing_key;
          if (!key) continue;
          if (verifyWebhookSignature(signature, raw, key)) {
            matchedConnection = { id: row.id, workspace_id: row.workspace_id };
            break;
          }
        }
        if (!matchedConnection) return json({ error: "Invalid signature" }, 401);

        const inviteeUri = body.payload?.uri ?? body.payload?.scheduled_event?.uri ?? "";
        const idempotencyKey = `calendly:${eventType}:${inviteeUri || body.created_at || raw.length}`;

        const { data: seen } = await supabaseAdmin
          .from("integration_events")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (seen) return json({ ok: true, deduplicated: true });

        const email = (body.payload?.email ?? "").trim().toLowerCase();
        if (!email) {
          await supabaseAdmin.from("integration_events").insert({
            workspace_id: matchedConnection.workspace_id,
            connection_id: matchedConnection.id,
            slug: CALENDLY_SLUG,
            direction: "inbound",
            event_type: eventType,
            status: "failed",
            message: "Calendly sent no invitee email.",
            payload: { event: eventType } as never,
            idempotency_key: idempotencyKey,
          });
          return json({ ok: true, unmatched: true });
        }

        const { applyCalendlyMeeting } = await import("@/lib/calendly-attribution.server");
        let result;
        try {
          result = await applyCalendlyMeeting(matchedConnection.workspace_id, {
            kind: eventType === "invitee.canceled" ? "canceled" : "booked",
            inviteeEmail: email,
            inviteeName: body.payload?.name ?? null,
            eventName: body.payload?.scheduled_event?.name ?? null,
            startTime: body.payload?.scheduled_event?.start_time ?? null,
            eventUri: inviteeUri || null,
            reschedule: Boolean(body.payload?.rescheduled),
          });
        } catch (error) {
          await supabaseAdmin.from("integration_events").insert({
            workspace_id: matchedConnection.workspace_id,
            connection_id: matchedConnection.id,
            slug: CALENDLY_SLUG,
            direction: "inbound",
            event_type: eventType,
            status: "failed",
            message: (error as Error).message.slice(0, 400),
            payload: { event: eventType, email } as never,
            idempotency_key: idempotencyKey,
          });
          return json({ error: "Processing failed" }, 500);
        }

        await supabaseAdmin.from("integration_events").insert({
          workspace_id: matchedConnection.workspace_id,
          connection_id: matchedConnection.id,
          slug: CALENDLY_SLUG,
          direction: "inbound",
          event_type: eventType,
          status: result.matched ? "success" : "unmatched",
          message: result.message.slice(0, 400),
          payload: {
            event: eventType,
            email,
            campaign_id: result.campaignId,
            step_order: result.stepOrder,
          } as never,
          idempotency_key: idempotencyKey,
        });

        await supabaseAdmin
          .from("integration_connections")
          .update({ last_event_at: new Date().toISOString() })
          .eq("id", matchedConnection.id);

        return json({ ok: true, matched: result.matched });
      },
    },
  },
});
