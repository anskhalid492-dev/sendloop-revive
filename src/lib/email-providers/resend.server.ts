/**
 * Phase 1 Resend adapter — a thin wrapper around the EXISTING production
 * implementation. It adds no new provider API calls and changes no existing
 * behaviour: sending, domain checks and status reads are delegated to
 * `src/lib/providers/adapter.server.ts` and
 * `src/lib/domain-providers/registry.server.ts`.
 *
 * Nothing in production imports this yet (Phase 2 migrates the callers).
 */
import { normalizeEmailEvent, normalizeInboundEvent } from "./normalize";
import type { EmailProvider } from "./provider";
import { capabilities } from "./types";

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
