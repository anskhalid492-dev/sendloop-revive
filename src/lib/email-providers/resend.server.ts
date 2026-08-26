/**
 * Resend adapter — a thin wrapper around the EXISTING production
 * implementation. It adds no new provider API calls and changes no existing
 * behaviour: sending, domain checks and status reads are delegated to
 * `src/lib/providers/adapter.server.ts` and
 * `src/lib/domain-providers/registry.server.ts`.
 *
 * Phase 2: this adapter is now the single provider-layer implementation for
 * Resend. Provider-API access goes through `./resend-api.server` (auth, domains,
 * DNS records, receiving capability, webhooks, `GET /emails/:id`). Existing
 * production callers (webhook route, tracking pipeline, admin ops) are migrated
 * in later phases and still call their original helpers.
 */
import {
  findResendDomain,
  getResendRfcMessageId,
  listResendWebhooks,
  resendInboundMxRecords,
  resolveResendApiKey,
  setResendReceiving,
  type ResendDnsRecord,
} from "./resend-api.server";
import { normalizeEmailEvent, normalizeInboundEvent } from "./normalize";
import type { EmailProvider } from "./provider";
import { capabilities, type ProviderDnsRecord, type UnifiedInboundStatus } from "./types";

function inboundRecord(domain: string, raw: ResendDnsRecord, index: number): ProviderDnsRecord {
  const host = raw.name && raw.name !== "@" ? raw.name : "@";
  return {
    id: `resend-inbound-mx-${index}`,
    kind: "mx",
    type: "MX",
    host,
    fqdn: host === "@" ? domain : `${host}.${domain}`,
    value: (raw.value ?? "").replace(/\.$/, ""),
    ttl: typeof raw.ttl === "number" ? raw.ttl : 3600,
    priority: raw.priority,
    required: true,
    purpose: "Routes inbound replies to MunchReach.",
  };
}

async function inboundStatus(
  creds: Record<string, string>,
  domain: string,
): Promise<UnifiedInboundStatus> {
  const found = await findResendDomain(domain, creds);
  if (!found) {
    return { enabled: false, records: [], detail: "Domain is not registered on the infrastructure." };
  }
  const receiving = found.capabilities?.receiving ?? "unknown";
  const root = (found.name ?? domain).toLowerCase();
  return {
    enabled: receiving === "enabled",
    records: resendInboundMxRecords(found).map((r, i) => inboundRecord(root, r, i)),
    detail: `Receiving: ${receiving}`,
  };
}

const ID = "resend";

export const resendEmailProvider: EmailProvider = {
  id: ID,
  label: "Resend",
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
    const { getAdapter } = await import("@/lib/providers/adapter.server");
    const result = await getAdapter(ID).sendEmail(creds, {
      ...message,
      replyTo: message.replyTo ?? null,
    });
    return {
      ok: result.ok,
      providerMessageId: result.messageId ?? null,
      rfcMessageId: result.rfcMessageId ?? null,
      statusCode: result.statusCode ?? null,
      message: result.message,
      rawMetadata: result.providerResponse ?? null,
    };
  },

  async getSendStatus(creds, providerMessageId) {
    const { getAdapter } = await import("@/lib/providers/adapter.server");
    const status = await getAdapter(ID).getDeliveryStatus(creds, providerMessageId);
    const { normalizedEventType } = await import("./normalize");
    return {
      known: status.known,
      status: status.status ? normalizedEventType(status.status) : null,
      detail: status.detail,
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

  async getRfcMessageId(creds, providerMessageId) {
    return getResendRfcMessageId(providerMessageId, creds);
  },

  async getInboundStatus(creds, domain) {
    return inboundStatus(creds, domain);
  },

  async enableInbound(creds, domain) {
    const found = await findResendDomain(domain, creds);
    if (!found?.id) {
      throw new Error("This domain is not set up on the sending infrastructure.");
    }
    const ok = await setResendReceiving(found.id, true, creds);
    if (!ok) throw new Error("The provider rejected the request to enable receiving.");
    return inboundStatus(creds, domain);
  },

  async configureWebhooks(creds, url) {
    const hooks = await listResendWebhooks(creds);
    const match = hooks.find((hook) => (hook.endpoint ?? "").includes(url));
    return {
      configured: Boolean(match),
      url: match?.endpoint ?? null,
      events: match?.events ?? [],
      detail: match ? `Webhook ${match.status ?? "registered"}.` : "No matching webhook registered.",
    };
  },

  identifyWebhookRequest(request) {
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const svix = Boolean(headers["svix-signature"] ?? headers["webhook-signature"]);
    return {
      provider: ID,
      matched: svix,
      confidence: svix ? "likely" : "none",
      detail: svix
        ? "Signed delivery carrying Svix headers, which this provider uses."
        : "No provider-specific headers found.",
    };
  },

  async verifyWebhookSignature(request) {
    // Delegates to the existing, production-verified implementation. Phase 2
    // does not change signature verification behaviour.
    const { verifyInboundSignature } = await import("@/lib/webhook-verify.server");
    const result = await verifyInboundSignature(
      new Request(request.url ?? "https://munchreach.com/api/public/inbound/email", {
        method: "POST",
        headers: request.headers ?? {},
        body: request.rawBody,
      }),
      request.rawBody,
    );
    return { valid: result.status === "valid", detail: result.reason };
  },

  parseDeliveryEvent(payload) {
    return normalizeEmailEvent(ID, payload);
  },

  parseTrackingEvent(payload) {
    return normalizeEmailEvent(ID, payload);
  },

  parseInboundEvent(payload) {
    return normalizeInboundEvent(ID, payload);
  },
};
