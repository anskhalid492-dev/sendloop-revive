/**
 * Courier provider adapter (unified layer).
 *
 * Courier is a delivery orchestration API. Documented surface used here:
 *   POST https://api.courier.com/send            send a message
 *   GET  https://api.courier.com/messages/{id}   message status
 *   GET  https://api.courier.com/profiles/{id}   read-only credential check
 *   webhook signature: `courier-signature: t=<ms>,signature=<hex>` over
 *                      `${t}.${rawBody}` with the per-webhook secret.
 *
 * Courier publishes NO domain, DNS or inbound-email API — those are handled by
 * whichever provider sits behind Courier, so this adapter deliberately declares
 * them unsupported instead of inventing endpoints. Webhook subscriptions are
 * created in the Courier dashboard; there is no management API for them.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { EmailProvider } from "./provider";
import {
  capabilities,
  type NormalizedEmailEvent,
  type NormalizedEmailEventType,
  type UnifiedSendResult,
} from "./types";

const API = "https://api.courier.com";
const ID = "courier";

const STATUS_MAP: Record<string, NormalizedEmailEventType> = {
  ENQUEUED: "ACCEPTED",
  ROUTED: "ACCEPTED",
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  DELAYED: "DELAYED",
  OPENED: "OPENED",
  CLICKED: "CLICKED",
  UNDELIVERABLE: "BOUNCED",
  UNROUTABLE: "FAILED",
  UNMAPPED: "FAILED",
  FILTERED: "FAILED",
  CANCELED: "FAILED",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function courierHeaders(creds: Record<string, string>) {
  return {
    Authorization: `Bearer ${creds["api_key"] ?? ""}`,
    "Content-Type": "application/json",
  };
}

export function courierEvent(payload: unknown): NormalizedEmailEvent | null {
  const p = asRecord(payload);
  const type = str(p["type"]);
  const d = asRecord(p["data"] ?? p);
  const status = String(d["status"] ?? "").toUpperCase();
  if (!status && !type) return null;
  return {
    type: STATUS_MAP[status] ?? "UNKNOWN",
    provider: ID,
    providerEventId: str(d["trace_id"]) ?? str(d["event"]),
    providerMessageId: str(d["id"]),
    recipient: str(d["recipient"]) ?? str(d["recipientId"]),
    reason: str(d["error"]) ?? str(d["reason"]),
    bounceType: status === "UNDELIVERABLE" ? "unknown" : null,
    occurredAt:
      typeof d["delivered"] === "number"
        ? new Date(d["delivered"] as number).toISOString()
        : typeof d["sent"] === "number"
          ? new Date(d["sent"] as number).toISOString()
          : null,
    rawMetadata: payload,
  };
}

async function sendCourier(
  creds: Record<string, string>,
  message: Parameters<NonNullable<EmailProvider["send"]>>[1],
): Promise<UnifiedSendResult> {
  const res = await fetch(`${API}/send`, {
    method: "POST",
    headers: courierHeaders(creds),
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      message: {
        to: { email: message.to },
        content: { title: message.subject, body: message.text },
        routing: { method: "single", channels: ["email"] },
        channels: {
          email: {
            override: {
              subject: message.subject,
              from: `${message.fromName} <${message.fromEmail}>`,
              ...(message.replyTo ? { reply_to: message.replyTo } : {}),
              ...(message.cc?.length ? { cc: message.cc.join(",") } : {}),
              ...(message.bcc?.length ? { bcc: message.bcc.join(",") } : {}),
              ...(message.html ? { html: message.html } : {}),
              text: message.text,
            },
          },
        },
      },
    }),
  });
  const body = await res.text();
  let json: unknown = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }
  const requestId = str(asRecord(json)["requestId"]);
  return {
    ok: res.ok,
    // Courier returns only a requestId; it is also the id used by /messages/{id}.
    providerMessageId: requestId,
    statusCode: res.status,
    message: res.ok
      ? `Provider accepted the email for ${message.to}.`
      : `Provider refused the send [${res.status}]: ${body.slice(0, 300)}`,
    rawMetadata: json,
  };
}

export const courierEmailProvider: EmailProvider = {
  id: ID,
  label: "Courier",
  // Courier has no email-receiving product at all.
  inboundSetupMode: "unsupported",
  capabilities: capabilities({
    sending: true,
    delivery_tracking: true,
    open_tracking: true,
    click_tracking: true,
    bounce_tracking: true,
    webhooks: true,
  }),

  async send(creds, message) {
    return sendCourier(creds, message);
  },

  async getSendStatus(creds, providerMessageId) {
    const res = await fetch(`${API}/messages/${providerMessageId}`, {
      headers: courierHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { known: false, status: null, detail: `Provider responded ${res.status}.` };
    }
    const json = (await res.json().catch(() => null)) as unknown;
    const status = String(asRecord(json)["status"] ?? "").toUpperCase();
    return {
      known: status !== "",
      status: STATUS_MAP[status] ?? "UNKNOWN",
      detail: status ? `Provider status "${status}".` : "Provider returned no status.",
    };
  },

  identifyWebhookRequest(request) {
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    if (headers["courier-signature"]) {
      return {
        provider: ID,
        matched: true,
        confidence: "exact",
        detail: "Delivery carries this provider's signature header.",
      };
    }
    const type = String(asRecord(request.payload)["type"] ?? "");
    if (type.startsWith("message:") || type.startsWith("notification:")) {
      return {
        provider: ID,
        matched: true,
        confidence: "likely",
        detail: `Payload carries this provider's event name "${type}".`,
      };
    }
    return {
      provider: ID,
      matched: false,
      confidence: "none",
      detail: "No provider-specific header or event name found.",
    };
  },

  verifyWebhookSignature(request, secret) {
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const header = headers["courier-signature"];
    if (!secret) return { valid: false, detail: "No signing secret is configured." };
    if (!header) return { valid: false, detail: "Delivery carried no courier-signature header." };
    const parts = Object.fromEntries(
      header
        .split(",")
        .map((piece) => piece.trim().split("="))
        .filter((pair): pair is [string, string] => pair.length === 2),
    );
    const timestamp = parts["t"];
    const signature = parts["signature"];
    if (!timestamp || !signature) {
      return { valid: false, detail: "Signature header was not in the documented format." };
    }
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${request.rawBody}`)
      .digest("hex");
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    const valid = a.length === b.length && timingSafeEqual(a, b);
    return {
      valid,
      detail: valid ? "Signature verified." : "Signature did not match the signing secret.",
      verification: {
        status: valid ? "valid" : "invalid",
        method: "hmac_sha256",
        reason: valid ? "Signature verified." : "Signature mismatch.",
      },
    };
  },

  parseDeliveryEvent: courierEvent,
  parseTrackingEvent: courierEvent,
};

export const COURIER_API = API;
