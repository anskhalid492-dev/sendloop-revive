/**
 * Inbound email + delivery event endpoint.
 *
 * Every delivery must carry a valid signature (provider Svix signature, HMAC
 * of the raw body, or the MunchReach shared secret). The verdict is recorded so
 * Admin can see live webhook status, every event is logged before processing,
 * and processing is idempotent so retries never duplicate anything.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/inbound/email")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, endpoint: "inbound-email-webhook", method: "POST" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      POST: async ({ request }) => {
        const rawBody = await request.text();

        // Provider-agnostic ingestion: identify -> verify signature -> parse.
        // No provider is assumed; unidentified senders are rejected.
        const { ingestProviderWebhook } = await import("@/lib/email-providers/ingest.server");
        const ingest = await ingestProviderWebhook(request, rawBody);

        const { recordWebhookVerification } = await import("@/lib/webhook-verify.server");
        if (ingest.verification) {
          try {
            await recordWebhookVerification({
              status: ingest.verification.status as never,
              method: ingest.verification.method as never,
              reason: ingest.verification.reason,
            });
          } catch {
            // Status reporting must never block a legitimate delivery.
          }
        }

        if (!ingest.ok) {
          const signature = ingest.verification?.status ?? "missing";
          if (signature !== "valid") {
            try {
              const { notifyAdmins, resolveInboundAlertContext } = await import(
                "@/lib/inbound-ops.server"
              );
              const alertContext = await resolveInboundAlertContext(rawBody);
              await notifyAdmins(
                "signature_failure",
                "Inbound webhook failed signature verification",
                {
                  signature,
                  method: ingest.verification?.method ?? "none",
                  reason: ingest.error,
                  origin: request.headers.get("user-agent") ?? "unknown",
                  ...alertContext,
                },
              );
            } catch {
              // Alerting must never change the response to the provider.
            }
          }
          return json({ error: ingest.error, signature }, ingest.status);
        }

        try {
          const { handleWebhookDelivery } = await import("@/lib/email-events.server");
          const { enrichInboundPayload } = await import("@/lib/email-providers/inbound-content.server");
          const enrichedPayload = await enrichInboundPayload(
            ingest.provider,
            ingest.payload,
            ingest.inbound ?? null,
          );
          const result = await handleWebhookDelivery(enrichedPayload, ingest.provider.id, {
            signatureStatus: ingest.verification.status,
            signatureDetail: `${ingest.verification.method}: ${ingest.verification.reason}`,
            ...(ingest.inbound ? { normalizedInbound: ingest.inbound } : {}),
          });
          // Unmatched mail is acknowledged so the sender does not retry forever.
          return json(result, 200);
        } catch {
          // A logging/infrastructure failure returns 500 so the provider retries;
          // processing is idempotent, so the retry cannot duplicate anything.
          return json({ error: "Processing failed" }, 500);
        }
      },
    },
  },
});
