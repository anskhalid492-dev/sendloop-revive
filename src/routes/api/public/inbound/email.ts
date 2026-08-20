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
      POST: async ({ request }) => {
        const rawBody = await request.text();

        const { verifyInboundSignature, recordWebhookVerification } = await import(
          "@/lib/webhook-verify.server"
        );
        const verification = await verifyInboundSignature(request, rawBody);
        try {
          await recordWebhookVerification(verification);
        } catch {
          // Status reporting must never block a legitimate delivery.
        }
        if (verification.status !== "valid") {
          try {
            const { notifyAdmins, resolveInboundAlertContext } = await import(
              "@/lib/inbound-ops.server"
            );
            const alertContext = await resolveInboundAlertContext(rawBody);
            await notifyAdmins("signature_failure", "Inbound webhook failed signature verification", {
              signature: verification.status,
              method: verification.method,
              reason: verification.reason,
              origin: request.headers.get("user-agent") ?? "unknown",
              ...alertContext,
            });
          } catch {
            // Alerting must never change the response to the provider.
          }
          const status = verification.status === "failed" ? 503 : 401;
          return json({ error: verification.reason, signature: verification.status }, status);
        }


        let raw: Record<string, unknown>;
        try {
          const contentType = request.headers.get("content-type") ?? "";
          if (contentType.includes("application/json") || rawBody.trimStart().startsWith("{")) {
            raw = JSON.parse(rawBody) as Record<string, unknown>;
          } else {
            raw = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, unknown>;
          }
        } catch {
          return json({ error: "Invalid body" }, 400);
        }

        try {
          const { handleWebhookDelivery } = await import("@/lib/email-events.server");
          const result = await handleWebhookDelivery(raw, "resend", {
            signatureStatus: verification.status,
            signatureDetail: `${verification.method}: ${verification.reason}`,
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
