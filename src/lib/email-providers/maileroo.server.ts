/**
 * Maileroo provider adapter (unified layer).
 *
 * Maileroo has TWO APIs and TWO credentials, both documented:
 *   sending  — https://smtp.maileroo.com/api/v2  with a per-domain sending key
 *              (`X-Api-Key`)
 *   account  — https://api.maileroo.com/v1       with an account key `roo_…`
 *              (`Authorization: Bearer`) for domains, DNS and webhooks
 *
 * Maileroo's docs describe a webhook "shared secret" but publish neither the
 * header name nor the algorithm, so no signature scheme is guessed here: the
 * shared inbound pipeline applies MunchReach's own endpoint secret instead.
 */
import {
  MAILEROO_ACCOUNT_API,
  MAILEROO_EMAIL_API,
  findMailerooDomain,
  mailerooHeaders,
} from "@/lib/domain-providers/maileroo.server";
import type { EmailProvider } from "./provider";
import {
  capabilities,
  type NormalizedEmailEvent,
  type NormalizedEmailEventType,
  type UnifiedSendResult,
} from "./types";

const ID = "maileroo";

const EVENT_MAP: Record<string, NormalizedEmailEventType> = {
  accepted: "ACCEPTED",
  delivered: "DELIVERED",
  deferred: "DELAYED",
  opened: "OPENED",
  clicked: "CLICKED",
  rejected: "BOUNCED",
  failed: "FAILED",
  complained: "COMPLAINED",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * The email API only accepts a per-domain sending key. MunchReach provisions
 * that key itself through the account API — the account key is never used as a
 * sending credential, because Maileroo rejects it.
 */
function sendingHeaders(sendingKey: string) {
  return {
    "X-Api-Key": sendingKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function mailerooEvent(payload: unknown): NormalizedEmailEvent | null {
  const p = asRecord(payload);
  const type = (str(p["event_type"]) ?? "").toLowerCase();
  if (!type) return null;
  const d = asRecord(p["event_data"]);
  const time = Number(p["event_time"]);
  return {
    type: EVENT_MAP[type] ?? "UNKNOWN",
    provider: ID,
    providerEventId: str(p["event_id"]),
    // `message_reference_id` is the id returned by the send call.
    providerMessageId: str(p["message_reference_id"]),
    rfcMessageId: str(p["message_id"]),
    recipient: str(d["to"]) ?? str(d["recipient"]),
    sender: str(d["from"]),
    subject: str(d["subject"]),
    url: str(d["original_url"]),
    bounceType: type === "rejected" ? "unknown" : null,
    reason: str(d["reason"]),
    occurredAt: Number.isFinite(time) && time > 0 ? new Date(time * 1000).toISOString() : str(p["inserted_at"]),
    rawMetadata: payload,
  };
}

async function sendMaileroo(
  creds: Record<string, string>,
  message: Parameters<NonNullable<EmailProvider["send"]>>[1],
): Promise<UnifiedSendResult> {
  const { resolveMailerooSendingKey } = await import(
    "@/lib/email-providers/maileroo-sending-keys.server"
  );
  const domain = (message.fromEmail.split("@")[1] ?? "").toLowerCase();
  const resolved = await resolveMailerooSendingKey(creds, domain);
  if (!resolved.key) {
    return {
      ok: false,
      statusCode: 0,
      // Internal detail only — the customer-facing layer scrubs provider names.
      message: `Sending is not configured for this domain: ${resolved.detail}`,
      rawMetadata: null,
    };
  }
  const res = await fetch(`${MAILEROO_EMAIL_API}/emails`, {
    method: "POST",
    headers: sendingHeaders(resolved.key),
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      from: { address: message.fromEmail, display_name: message.fromName },
      to: { address: message.to },
      ...(message.cc?.length ? { cc: message.cc.map((address) => ({ address })) } : {}),
      ...(message.bcc?.length ? { bcc: message.bcc.map((address) => ({ address })) } : {}),
      ...(message.replyTo ? { reply_to: [{ address: message.replyTo }] } : {}),
      subject: message.subject,
      plain: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.headers && Object.keys(message.headers).length
        ? { headers: message.headers }
        : {}),
      tracking: true,
    }),
  });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  const envelope = asRecord(json);
  const data = asRecord(envelope["data"]);
  const ok = res.ok && envelope["success"] !== false;
  return {
    ok,
    providerMessageId: str(data["reference_id"]),
    statusCode: res.status,
    message: ok
      ? `Provider accepted the email for ${message.to}.`
      : `Provider refused the send [${res.status}]: ${str(envelope["message"]) ?? raw.slice(0, 300)}`,
    rawMetadata: json,
  };
}

export const mailerooEmailProvider: EmailProvider = {
  id: ID,
  label: "Maileroo",
  // Receiving uses inbound routes created through the account API.
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
    return sendMaileroo(creds, message);
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
    const found = await findMailerooDomain(creds, domain);
    if (!found?.id) {
      return {
        enabled: false,
        setupMode: "api",
        records: [],
        detail: "Domain is not registered on the infrastructure.",
      };
    }
    const res = await fetch(`${MAILEROO_ACCOUNT_API}/domains/${found.id}/inbound-routes`, {
      headers: mailerooHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = res.ok ? asRecord((await res.json().catch(() => null)) as unknown) : {};
    const list = payload["data"];
    const routes = Array.isArray(list) ? list : (asRecord(list)["routes"] as unknown[] | undefined) ?? [];
    const { mapMailerooRecords } = await import("@/lib/domain-providers/maileroo.server");
    return {
      enabled: routes.length > 0 && found.dns_records?.["mx_record"]?.created === true,
      setupMode: "api",
      records: mapMailerooRecords(domain, found).filter((r) => r.kind === "mx"),
      detail: `${routes.length} inbound route(s) configured; MX ${
        found.dns_records?.["mx_record"]?.created === true ? "verified" : "pending"
      }.`,
    };
  },

  async enableInbound(creds, domain) {
    const found = await findMailerooDomain(creds, domain);
    if (!found?.id) throw new Error("This domain is not set up on the sending infrastructure.");
    const res = await fetch(`${MAILEROO_ACCOUNT_API}/domains/${found.id}/inbound-routes`, {
      method: "POST",
      headers: mailerooHeaders(creds),
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        description: "MunchReach replies",
        expression_type: "catch_all",
        forward_list: ["https://munchreach.com/api/public/inbound/email"],
      }),
    });
    if (!res.ok) throw new Error(`The provider rejected the inbound route [${res.status}].`);
    return this.getInboundStatus!(creds, domain);
  },

  async listDomains(creds) {
    const res = await fetch(`${MAILEROO_ACCOUNT_API}/domains?per_page=100`, {
      headers: mailerooHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const payload = asRecord((await res.json().catch(() => null)) as unknown)["data"];
    const items = Array.isArray(payload)
      ? (payload as Record<string, unknown>[])
      : ((asRecord(payload)["domains"] as Record<string, unknown>[] | undefined) ?? []);
    return items.map((d) => ({
      id: String(d["id"] ?? ""),
      name: String(d["domain_name"] ?? ""),
      status: String(d["status"] ?? ""),
      receiving: "unknown",
    }));
  },

  async listWebhooks(creds) {
    const res = await fetch(`${MAILEROO_ACCOUNT_API}/webhooks`, {
      headers: mailerooHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const payload = asRecord((await res.json().catch(() => null)) as unknown)["data"];
    const items = Array.isArray(payload)
      ? (payload as Record<string, unknown>[])
      : ((asRecord(payload)["webhooks"] as Record<string, unknown>[] | undefined) ?? []);
    return items.map((h) => ({
      id: String(h["id"] ?? ""),
      endpoint: String(h["callback_url"] ?? ""),
      status: "enabled",
      events: Array.isArray(h["event_types"]) ? (h["event_types"] as string[]) : [],
    }));
  },

  async registerWebhook(creds, endpoint, events) {
    const res = await fetch(`${MAILEROO_ACCOUNT_API}/webhooks`, {
      method: "POST",
      headers: mailerooHeaders(creds),
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        callback_url: endpoint,
        domains: [],
        event_types: events.length
          ? events
          : ["accepted", "delivered", "rejected", "deferred", "failed", "opened", "clicked", "complained"],
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
    const created = asRecord(asRecord(json)["data"]);
    return { ok: true, id: created["id"] ? String(created["id"]) : null, detail: "Webhook created." };
  },

  async deleteWebhook(creds, id) {
    const res = await fetch(`${MAILEROO_ACCOUNT_API}/webhooks/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: mailerooHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok
      ? { ok: true, detail: "Webhook removed." }
      : { ok: false, detail: `Provider responded ${res.status}.` };
  },

  identifyWebhookRequest(request) {
    const p = asRecord(request.payload);
    // Inbound messages use a different envelope from delivery events.
    if (isMailerooInboundPayload(p)) {
      return {
        provider: ID,
        matched: true,
        confidence: "exact",
        detail: "Payload carries this provider's inbound-message envelope.",
      };
    }
    const type = String(p["event_type"] ?? "").toLowerCase();
    if (Object.hasOwn(EVENT_MAP, type) && (p["message_reference_id"] ?? p["domain_id"])) {
      return {
        provider: ID,
        matched: true,
        confidence: "likely",
        detail: `Payload carries this provider's event envelope (${type}).`,
      };
    }
    return {
      provider: ID,
      matched: false,
      confidence: "none",
      detail: "No provider-specific payload envelope found.",
    };
  },

  /**
   * Inbound deliveries authenticate through the payload's one-time validation
   * URL (this provider publishes no signature header). Delivery/tracking events
   * carry no authenticity mechanism at all, so they keep the shared endpoint
   * secret as their only proof.
   */
  async verifyWebhookSignature(request, secret) {
    const payload = asRecord(request.payload);
    if (isMailerooInboundPayload(payload)) {
      const { verifyMailerooInbound } = await import("./maileroo-inbound.server");
      return verifyMailerooInbound(payload);
    }
    const supplied = request.query?.["token"] ?? request.headers["x-munchreach-secret"] ?? "";
    if (secret && supplied && supplied === secret) {
      return {
        valid: true,
        detail: "Endpoint secret matches.",
        verification: { status: "valid", method: "token", reason: "token_match" },
      };
    }
    return {
      valid: false,
      detail: "This provider publishes no signature scheme for event webhooks.",
      verification: { status: "unverified", method: "none", reason: "no_signature_scheme" },
    };
  },

  // Inbound messages are reshaped into the shared flat payload; event webhooks
  // are already flat.
  normalizeWebhookPayload(payload) {
    return mailerooFlattenInboundPayload(payload) ?? payload;
  },

  parseInboundEvent: mailerooInboundEvent,
  parseDeliveryEvent: mailerooEvent,
  parseTrackingEvent: mailerooEvent,
};
