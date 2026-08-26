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
import { resendEventType, resendSendStatus, sendResendEmail } from "./resend-send.server";
import { normalizeEmailEvent } from "./normalize";
import { firstProviderMessageId } from "@/lib/provider-message-id";
import { resendInboundEvent } from "./resend-inbound";
import type { EmailProvider } from "./provider";
import { capabilities, type ProviderDnsRecord, type UnifiedInboundStatus } from "./types";

/**
 * The provider only supplies the MX target, priority and TTL. MunchReach owns
 * the DNS host and always publishes root-domain receiving at `@`, so a
 * provider-side label such as `send.<domain>` (which already carries a CNAME for
 * sending) can never end up in the customer's MX instructions.
 */
function inboundRecord(domain: string, raw: ResendDnsRecord, index: number): ProviderDnsRecord {
  return buildRootInboundMxRecord({
    id: `resend-inbound-mx-${index}`,
    domain,
    target: raw.value ?? "",
    priority: raw.priority ?? null,
    ttl: typeof raw.ttl === "number" ? raw.ttl : null,
    purpose: "Routes inbound replies to MunchReach.",
  });
}

async function inboundStatus(
  creds: Record<string, string>,
  domain: string,
): Promise<UnifiedInboundStatus> {
  const found = await findResendDomain(domain, creds);
  if (!found) {
    return {
      enabled: false,
      setupMode: "api",
      records: [],
      detail: "Domain is not registered on the infrastructure.",
    };
  }
  const receiving = found.capabilities?.receiving ?? "unknown";
  const root = (found.name ?? domain).toLowerCase();
  return {
    enabled: receiving === "enabled",
    setupMode: "api",
    records: resendInboundMxRecords(found).map((r, i) => inboundRecord(root, r, i)),
    detail: `Receiving: ${receiving}`,
  };
}

const ID = "resend";

/**
 * Normalizes a provider payload. Field extraction is shared, but the event
 * *name* is interpreted with Resend's own native event table so shared code
 * never sees provider-specific event names — and unknown events stay UNKNOWN.
 */
function resendEvent(payload: unknown) {
  const generic = normalizeEmailEvent(ID, payload);
  const p = (payload ?? {}) as Record<string, unknown>;
  const data = (p["data"] ?? {}) as Record<string, unknown>;
  const raw = p["type"] ?? data["type"] ?? p["event"] ?? data["event"];
  return {
    ...generic,
    type: resendEventType(raw),
    // The provider nests the message id under `data` on webhook deliveries.
    providerMessageId: generic.providerMessageId ?? firstProviderMessageId(payload, data),
  };
}

/**
 * The legacy domain adapter reads its key from `creds.api_key`; the unified
 * layer also allows platform-level credentials. Bridge the two so readiness
 * works with either credential source.
 */
function withResolvedKey(creds: Record<string, string>): Record<string, string> {
  const key = resolveResendApiKey(creds);
  return key ? { ...creds, api_key: key } : creds;
}

export const resendEmailProvider: EmailProvider = {
  id: ID,
  label: "Resend",
  // Receiving is switched on through the provider API, so MunchReach can
  // automate it once the customer's domain exists on the infrastructure.
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
    return sendResendEmail(creds, message);
  },

  async getSendStatus(creds, providerMessageId) {
    return resendSendStatus(creds, providerMessageId);
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
    const resolved = withResolvedKey(creds);
    const state = await adapter.getDomainStatus(resolved, domain);
    return { ...state, readyToSend: await adapter.isReadyToSend(resolved, domain) };
  },

  async getDnsRequirements(creds, domain) {
    const { getDomainAdapter } = await import("@/lib/domain-providers/registry.server");
    return getDomainAdapter(ID).getDnsRecords(withResolvedKey(creds), domain);
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

  async listDomains(creds) {
    const { listResendDomains } = await import("./resend-api.server");
    const domains = await listResendDomains(creds);
    return domains.map((d) => ({
      id: String(d.id ?? ""),
      name: String(d.name ?? ""),
      status: String(d.status ?? ""),
      receiving: String(d.capabilities?.receiving ?? "unknown"),
    }));
  },

  async listWebhooks(creds) {
    const hooks = await listResendWebhooks(creds);
    return hooks.map((h) => ({
      id: String(h.id ?? ""),
      endpoint: String(h.endpoint ?? ""),
      status: String(h.status ?? ""),
      events: h.events ?? [],
    }));
  },

  async registerWebhook(creds, endpoint, events) {
    const { createResendWebhook } = await import("./resend-api.server");
    return createResendWebhook(endpoint, events, creds);
  },

  async deleteWebhook(creds, id) {
    const { deleteResendWebhook } = await import("./resend-api.server");
    return deleteResendWebhook(id, creds);
  },

  identifyWebhookRequest(request) {
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    // Strongest discriminator: this provider signs deliveries with Svix headers.
    if (headers["svix-signature"] ?? headers["webhook-signature"]) {
      return {
        provider: ID,
        matched: true,
        confidence: "exact",
        detail: "Signed delivery carrying the Svix headers this provider uses.",
      };
    }

    // Secondary discriminator for deliveries that arrive with the MunchReach
    // shared secret instead of a provider signature (existing behaviour):
    // the payload must still have this provider's envelope shape.
    const payload = (request.payload ?? {}) as Record<string, unknown>;
    const data = payload["data"];
    const source = (data && typeof data === "object" ? data : payload) as Record<string, unknown>;
    const type = String(payload["type"] ?? source["type"] ?? "").toLowerCase();
    const envelope = Boolean(source["from"] ?? source["to"] ?? source["email_id"] ?? source["email"]);
    if (type.startsWith("email.") && envelope) {
      return {
        provider: ID,
        matched: true,
        confidence: "likely",
        detail: `Payload envelope matches this provider (${type}).`,
      };
    }
    if (envelope && (source["email_id"] ?? source["headers"])) {
      return {
        provider: ID,
        matched: true,
        confidence: "likely",
        detail: "Payload carries this provider's message envelope fields.",
      };
    }

    return {
      provider: ID,
      matched: false,
      confidence: "none",
      detail: "No provider-specific headers or payload envelope found.",
    };
  },

  async verifyWebhookSignature(request) {
    // Delegates to the existing, production-verified implementation. Phase 3
    // does not change signature semantics: the Svix scheme, the active-secret
    // fallback and the shared-secret/HMAC schemes are all unchanged, and the
    // exact raw body that arrived is what gets verified.
    const { verifyInboundSignature } = await import("@/lib/webhook-verify.server");
    const original =
      request.request ??
      new Request(request.url ?? "https://munchreach.com/api/public/inbound/email", {
        method: "POST",
        headers: request.headers ?? {},
        body: request.rawBody,
      });
    const result = await verifyInboundSignature(original, request.rawBody);
    return {
      valid: result.status === "valid",
      detail: result.reason,
      verification: { status: result.status, method: result.method, reason: result.reason },
    };
  },

  parseDeliveryEvent(payload) {
    return resendEvent(payload);
  },

  parseTrackingEvent(payload) {
    return resendEvent(payload);
  },

  parseInboundEvent(payload) {
    return resendInboundEvent(payload);
  },
};
