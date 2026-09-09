/**
 * Nuntly provider adapter (unified layer).
 *
 * Documented API surface used here — nothing else is assumed:
 *   POST   https://api.nuntly.com/emails         send
 *   GET    https://api.nuntly.com/emails/{id}    retrieve a sent email
 *   domains + DNS: see `@/lib/domain-providers/nuntly.server`
 *   POST/GET/PATCH /webhooks                     webhook subscriptions
 *   signature: `webhook-signature: t=<unix>,v0=<hex>` over `${t}.${rawBody}`
 *              with the `whsec_` prefix stripped from the signing secret.
 */
import { createHmac, timingSafeEqual } from "crypto";
import {
  NUNTLY_API,
  findNuntlyDomain,
  nuntlyHeaders,
  mapNuntlyRecords,
} from "@/lib/domain-providers/nuntly.server";
import type { EmailProvider } from "./provider";
import {
  capabilities,
  type NormalizedEmailEvent,
  type NormalizedEmailEventType,
  type UnifiedSendResult,
} from "./types";

const ID = "nuntly";

const EVENT_MAP: Record<string, NormalizedEmailEventType> = {
  "email.queued": "ACCEPTED",
  "email.scheduled": "ACCEPTED",
  "email.processed": "ACCEPTED",
  "email.sending": "SENT",
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.deliveryDelayed": "DELAYED",
  "email.opened": "OPENED",
  "email.clicked": "CLICKED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
  "email.rejected": "FAILED",
  "email.failed": "FAILED",
  "email.renderingFailed": "FAILED",
  "email.unsubscribed": "UNSUBSCRIBED",
  "message.received": "REPLIED",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function nuntlyEvent(payload: unknown): NormalizedEmailEvent | null {
  const p = asRecord(payload);
  const type = str(p["type"]);
  if (!type) return null;
  const d = asRecord(p["data"]);
  const to = d["to"];
  return {
    type: EVENT_MAP[type] ?? "UNKNOWN",
    provider: ID,
    providerEventId: str(p["id"]) ?? str(d["eventId"]),
    providerMessageId: str(d["id"]) ?? str(d["emailId"]),
    rfcMessageId: str(d["messageId"]),
    recipient: Array.isArray(to) ? (str(to[0]) ?? null) : str(to),
    sender: str(d["from"]),
    subject: str(d["subject"]),
    url: str(d["url"]) ?? str(d["link"]),
    bounceType:
      type === "email.bounced"
        ? ((str(d["bounceType"]) ?? "").toLowerCase() === "soft" ? "soft" : "hard")
        : null,
    reason: str(d["statusReason"]) ?? str(d["reason"]),
    occurredAt: str(d["createdAt"]) ?? str(p["createdAt"]),
    rawMetadata: payload,
  };
}

async function sendNuntly(
  creds: Record<string, string>,
  message: Parameters<NonNullable<EmailProvider["send"]>>[1],
): Promise<UnifiedSendResult> {
  const res = await fetch(`${NUNTLY_API}/emails`, {
    method: "POST",
    headers: nuntlyHeaders(creds),
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      from: `${message.fromName} <${message.fromEmail}>`,
      to: message.to,
      ...(message.cc?.length ? { cc: message.cc } : {}),
      ...(message.bcc?.length ? { bcc: message.bcc } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.headers && Object.keys(message.headers).length
        ? { headers: message.headers }
        : {}),
    }),
  });
  const body = await res.text();
  let json: unknown = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }
  const payload = asRecord(asRecord(json)["data"] ?? json);
  return {
    ok: res.ok,
    providerMessageId: str(payload["id"]),
    rfcMessageId: str(payload["messageId"]),
    statusCode: res.status,
    message: res.ok
      ? `Provider accepted the email for ${message.to}.`
      : `Provider refused the send [${res.status}]: ${body.slice(0, 300)}`,
    rawMetadata: json,
  };
}

const STATUS_MAP: Record<string, NormalizedEmailEventType> = {
  queued: "ACCEPTED",
  scheduled: "ACCEPTED",
  processed: "ACCEPTED",
  sending: "SENT",
  sent: "SENT",
  delivered: "DELIVERED",
  opened: "OPENED",
  clicked: "CLICKED",
  bounced: "BOUNCED",
  complained: "COMPLAINED",
  failed: "FAILED",
  rejected: "FAILED",
};

export const nuntlyEmailProvider: EmailProvider = {
  id: ID,
  label: "Nuntly",
  inboundSetupMode: "api",
  capabilities: capabilities({
    sending: true,
    inbound: true,
    delivery_tracking: true,
    open_tracking: true,
    click_tracking: true,
    bounce_tracking: true,
    webhooks: true,
    domain_api: true,
    dns_api: true,
  }),

  async send(creds, message) {
    return sendNuntly(creds, message);
  },

  async getSendStatus(creds, providerMessageId) {
    const res = await fetch(`${NUNTLY_API}/emails/${providerMessageId}`, {
      headers: nuntlyHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { known: false, status: null, detail: `Provider responded ${res.status}.` };
    }
    const json = (await res.json().catch(() => null)) as unknown;
    const payload = asRecord(asRecord(json)["data"] ?? json);
    const raw = (str(payload["status"]) ?? "").toLowerCase();
    return {
      known: raw !== "",
      status: STATUS_MAP[raw] ?? "UNKNOWN",
      detail: raw ? `Provider status "${raw}".` : "Provider returned no status.",
    };
  },

  async verifyDomain(creds, domain) {
    const { getDomainAdapter } = await import("@/lib/domain-providers/registry.server");
    const adapter = getDomainAdapter(ID);
    const state = await adapter.authorizeDomain(creds, domain);
    return { ...state, readyToSend: state.state === "verified" };
  },

  async getDomainStatus(creds, domain) {
    const { getDomainAdapter } = await import("@/lib/domain-providers/registry.server");
    const adapter = getDomainAdapter(ID);
    const state = await adapter.getDomainStatus(creds, domain);
    return { ...state, readyToSend: await adapter.isReadyToSend(creds, domain) };
  },

  async getDnsRequirements(creds, domain) {
    const { getDomainAdapter } = await import("@/lib/domain-providers/registry.server");
    return getDomainAdapter(ID).getDnsRecords(creds, domain);
  },

  async getInboundStatus(creds, domain) {
    const found = await findNuntlyDomain(creds, domain);
    if (!found) {
      return {
        enabled: false,
        setupMode: "api",
        records: [],
        detail: "Domain is not registered on the infrastructure.",
      };
    }
    const receiving = (found.receivingStatus ?? "").toLowerCase();
    return {
      enabled: found.receiving === true && receiving !== "disabled",
      setupMode: "api",
      records: mapNuntlyRecords(domain, found.records ?? []).filter((r) => r.kind === "mx"),
      detail: `Receiving: ${found.receivingStatus ?? (found.receiving ? "enabled" : "disabled")}`,
    };
  },

  async listDomains(creds) {
    const res = await fetch(`${NUNTLY_API}/domains`, {
      headers: nuntlyHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as unknown;
    const payload = asRecord(json)["data"] ?? json;
    const items = Array.isArray(payload) ? (payload as Record<string, unknown>[]) : [];
    return items.map((d) => ({
      id: String(d["id"] ?? ""),
      name: String(d["name"] ?? ""),
      status: String(d["status"] ?? ""),
      receiving: String(d["receivingStatus"] ?? (d["receiving"] ? "enabled" : "disabled")),
    }));
  },

  async listWebhooks(creds) {
    const res = await fetch(`${NUNTLY_API}/webhooks`, {
      headers: nuntlyHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as unknown;
    const payload = asRecord(json)["data"] ?? json;
    const items = Array.isArray(payload) ? (payload as Record<string, unknown>[]) : [];
    return items.map((h) => ({
      id: String(h["id"] ?? ""),
      endpoint: String(h["endpointUrl"] ?? ""),
      status: String(h["status"] ?? ""),
      events: Array.isArray(h["events"]) ? (h["events"] as string[]) : [],
    }));
  },

  async registerWebhook(creds, endpoint, events) {
    const res = await fetch(`${NUNTLY_API}/webhooks`, {
      method: "POST",
      headers: nuntlyHeaders(creds),
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        name: "MunchReach",
        endpointUrl: endpoint,
        events,
        status: "enabled",
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, id: null, detail: `Provider responded [${res.status}]: ${body.slice(0, 200)}` };
    }
    let json: unknown = null;
    try {
      json = JSON.parse(body);
    } catch {
      json = null;
    }
    const created = asRecord(asRecord(json)["data"] ?? json);
    return {
      ok: true,
      id: str(created["id"]),
      // signingSecret is only returned once, at creation.
      detail: created["signingSecret"]
        ? "Webhook created. Store the signing secret now — the provider only returns it once."
        : "Webhook created.",
    };
  },

  async deleteWebhook(creds, id) {
    const res = await fetch(`${NUNTLY_API}/webhooks/${id}`, {
      method: "DELETE",
      headers: nuntlyHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok
      ? { ok: true, detail: "Webhook removed." }
      : { ok: false, detail: `Provider responded ${res.status}.` };
  },

  identifyWebhookRequest(request) {
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const payload = asRecord(request.payload);
    const type = String(payload["type"] ?? "");
    const known = Object.hasOwn(EVENT_MAP, type);
    if (known && headers["webhook-signature"] && headers["webhook-timestamp"]) {
      return {
        provider: ID,
        matched: true,
        confidence: "exact",
        detail: `Signed delivery carrying this provider's event "${type}".`,
      };
    }
    if (known) {
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
      detail: "No provider-specific event name found.",
    };
  },

  verifyWebhookSignature(request, secret) {
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const header = headers["webhook-signature"];
    if (!secret) return { valid: false, detail: "No signing secret is configured." };
    if (!header) return { valid: false, detail: "Delivery carried no webhook-signature header." };

    const parts = Object.fromEntries(
      header
        .split(",")
        .map((piece) => piece.trim().split("="))
        .filter((pair): pair is [string, string] => pair.length === 2),
    );
    const timestamp = parts["t"];
    if (!timestamp) return { valid: false, detail: "Signature header carried no timestamp." };
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
      return { valid: false, detail: "Signature timestamp is outside the 5 minute window." };
    }

    const key = secret.replace(/^whsec_/, "");
    const expected = createHmac("sha256", key)
      .update(`${timestamp}.${request.rawBody}`)
      .digest("hex");
    // Two v0 signatures can be present while a secret is being rotated.
    const provided = header
      .split(",")
      .map((piece) => piece.trim())
      .filter((piece) => piece.startsWith("v0="))
      .map((piece) => piece.slice(3));
    const valid = provided.some((candidate) => {
      const a = Buffer.from(candidate, "hex");
      const b = Buffer.from(expected, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    });
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

  parseDeliveryEvent: nuntlyEvent,
  parseTrackingEvent: nuntlyEvent,
};
