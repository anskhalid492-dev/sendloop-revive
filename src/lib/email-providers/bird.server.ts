/**
 * Bird (bird.com) provider adapter — the second implementation of the shared
 * `EmailProvider` interface.
 *
 * Everything Bird-specific lives here and in `./bird-api.server`:
 *  - Bird's native event names (`injection`, `delivery`, `delay`, `bounce`,
 *    `spam_complaint`, `open`, `click`, `relay_message`, ...) are translated
 *    into MunchReach's normalized vocabulary before leaving this file, so the
 *    Unified Inbox, analytics, campaigns and reply routing never see them.
 *  - Bird's DNS record values come from Bird's API only.
 *  - Root-domain inbound MX hosts are decided by MunchReach (`@`), never by
 *    Bird's own record labels.
 *
 * Capabilities are declared individually; anything Bird does not support is
 * left `false` and its method is not implemented rather than faked.
 *
 * Server-only.
 */
import { timingSafeEqual } from "node:crypto";

import {
  birdDomainState,
  birdInboundMxRecords,
  birdSendingDnsRecords,
  createBirdInboundDomain,
  createBirdSendingDomain,
  createBirdRelayWebhook,
  createBirdTransmission,
  createBirdWebhook,
  deleteBirdWebhook,
  getBirdInboundDomain,
  getBirdMessageEvents,
  getBirdSendingDomain,
  listBirdInboundDomains,
  listBirdSendingDomains,
  listBirdWebhooks,
  resolveBirdCredentials,
  verifyBirdSendingDomain,
  type BirdCredentials,
  type BirdMessageEvent,
} from "./bird-api.server";
import { normalizeDomain } from "./mx-host";
import type { EmailProvider } from "./provider";
import {
  capabilities,
  type EmailProviderCredentials,
  type InboundEmailAttachment,
  type InboundEmailEvent,
  type NormalizedEmailEvent,
  type NormalizedEmailEventType,
  type ProviderDnsRecord,
  type UnifiedDomainStatus,
  type UnifiedInboundStatus,
  type UnifiedOutboundMessage,
  type UnifiedSendResult,
  type UnifiedSendStatus,
} from "./types";

export const BIRD_PROVIDER_ID = "bird";
const ID = BIRD_PROVIDER_ID;

/* ------------------------------------------------------------------ *
 * Native event mapping (Bird-only knowledge)
 * ------------------------------------------------------------------ */

const BIRD_EVENTS: Record<string, NormalizedEmailEventType> = {
  injection: "SENT",
  delivery: "DELIVERED",
  delay: "DELAYED",
  bounce: "BOUNCED",
  out_of_band: "BOUNCED",
  spam_complaint: "COMPLAINED",
  policy_rejection: "FAILED",
  generation_failure: "FAILED",
  generation_rejection: "FAILED",
  open: "OPENED",
  initial_open: "OPENED",
  amp_open: "OPENED",
  click: "CLICKED",
  initial_click: "CLICKED",
  amp_click: "CLICKED",
  link_unsubscribe: "UNSUBSCRIBED",
  list_unsubscribe: "UNSUBSCRIBED",
  relay_message: "REPLIED",
  relay_injection: "REPLIED",
};

/** Unlisted Bird events stay UNKNOWN — never upgraded into a delivery signal. */
export function birdEventType(raw: unknown): NormalizedEmailEventType | "UNKNOWN" {
  const key = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (!key) return "UNKNOWN";
  return BIRD_EVENTS[key] ?? "UNKNOWN";
}

function bounceClass(
  event: BirdMessageEvent,
): "hard" | "soft" | "block" | "unknown" | null {
  const type = String(event.type ?? "").toLowerCase();
  if (type !== "bounce" && type !== "out_of_band") return null;
  const code = Number(event.bounce_class);
  if ([10, 30, 90].includes(code)) return "hard";
  if ([20, 21, 22, 23, 24, 25].includes(code)) return "soft";
  if ([50, 51, 52, 53, 54].includes(code)) return "block";
  return "unknown";
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/* ------------------------------------------------------------------ *
 * Payload shapes
 * ------------------------------------------------------------------ */

type BirdEnvelope = Record<string, unknown>;

/** Bird batches arrive as `[{ msys: { message_event | relay_message: {...} } }]`. */
function unwrap(payload: unknown): { kind: string; body: BirdEnvelope } | null {
  if (!payload || typeof payload !== "object") return null;
  const item = (Array.isArray(payload) ? payload[0] : payload) as BirdEnvelope;
  if (!item || typeof item !== "object") return null;
  const msys = (item["msys"] ?? item) as BirdEnvelope;
  if (!msys || typeof msys !== "object") return null;
  for (const key of [
    "relay_message",
    "message_event",
    "track_event",
    "gen_event",
    "unsubscribe_event",
  ]) {
    const body = msys[key];
    if (body && typeof body === "object") return { kind: key, body: body as BirdEnvelope };
  }
  // A bare Bird event object (as returned by the events API).
  if (item["type"] || item["event_id"]) return { kind: "message_event", body: item };
  return null;
}

function birdEvent(payload: unknown): NormalizedEmailEvent | null {
  const unwrapped = unwrap(payload);
  if (!unwrapped || unwrapped.kind === "relay_message") return null;
  const event = unwrapped.body as BirdMessageEvent & BirdEnvelope;
  return {
    type: birdEventType(event.type),
    provider: ID,
    providerEventId: str(event.event_id),
    // Bird correlates webhook events to a send through the transmission id,
    // which is exactly what `send()` returns as the provider message id.
    providerMessageId: str(event.transmission_id) ?? str(event.message_id),
    rfcMessageId: str((event as BirdEnvelope)["rfc822_message_id"]),
    recipient: str(event.rcpt_to) ?? str(event.raw_rcpt_to),
    sender: str(event.msg_from) ?? str(event.friendly_from),
    subject: str(event.subject),
    url: str(event.target_link_url),
    bounceType: bounceClass(event),
    reason: str(event.reason) ?? str(event.error_message) ?? str(event.error_code),
    occurredAt: str(event.timestamp),
    rawMetadata: payload,
  };
}

/* ------------------------------------------------------------------ *
 * Inbound (relay) normalization
 * ------------------------------------------------------------------ */

function headerMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (name: unknown, value: unknown) => {
    const key = String(name ?? "").toLowerCase().trim();
    const val = str(value);
    if (!key || !val) return;
    out[key] = out[key] ? `${out[key]}, ${val}` : val;
  };
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const pairs = Object.entries(entry as Record<string, unknown>);
      for (const [name, value] of pairs) add(name, value);
    }
  } else if (raw && typeof raw === "object") {
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) add(name, value);
  }
  return out;
}

function addresses(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => addresses(entry));
  }
  const single = str(value);
  if (!single) return [];
  return single
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function birdAttachments(value: unknown): InboundEmailAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const a = (item ?? {}) as Record<string, unknown>;
    return {
      filename: str(a["name"] ?? a["filename"]),
      contentType: str(a["type"] ?? a["content_type"]),
      size: typeof a["size"] === "number" ? (a["size"] as number) : null,
      content: str(a["data"] ?? a["content"]),
      url: str(a["url"]),
    };
  });
}

/**
 * Bird relay payload -> MunchReach's normalized `InboundEmailEvent`.
 *
 * Preserves From, To, Delivered-To, Reply-To, Message-ID, In-Reply-To,
 * References, subject, text, html and attachments. Threading itself is decided
 * by existing shared code; this only reshapes Bird's payload.
 */
export function birdInboundEvent(payload: unknown): InboundEmailEvent | null {
  const unwrapped = unwrap(payload);
  if (!unwrapped || unwrapped.kind !== "relay_message") return null;
  const relay = unwrapped.body;
  const content = (relay["content"] ?? {}) as BirdEnvelope;
  const headers = headerMap(content["headers"]);

  const from = str(relay["msg_from"]) ?? str(content["from"]) ?? str(headers["from"]);
  // Envelope recipient first: it survives plus-addressing, unlike the To header.
  const to = [
    ...addresses(relay["rcpt_to"]),
    ...addresses(headers["delivered-to"]),
    ...addresses(headers["x-original-to"]),
    ...addresses(content["to"]),
    ...addresses(headers["to"]),
  ];
  const unique = [...new Set(to.map((value) => value.trim()).filter(Boolean))];
  if (!from || unique.length === 0) return null;

  return {
    provider: ID,
    providerEventId: str(relay["webhook_id"]) ?? str(headers["message-id"]),
    providerMessageId: str(headers["message-id"]),
    from,
    to: unique,
    cc: addresses(content["cc"] ?? headers["cc"]),
    bcc: addresses(content["bcc"]),
    subject: str(content["subject"]) ?? str(headers["subject"]),
    text: str(content["text"]),
    html: str(content["html"]),
    messageId: str(headers["message-id"]),
    inReplyTo: str(headers["in-reply-to"]),
    references: str(headers["references"])?.split(/\s+/).filter(Boolean) ?? [],
    receivedAt: str(relay["timestamp"]) ?? str(headers["date"]),
    attachments: birdAttachments(content["attachments"]),
    rawMetadata: payload,
  };
}

/* ------------------------------------------------------------------ *
 * Credentials helper
 * ------------------------------------------------------------------ */

function requireCreds(creds: EmailProviderCredentials): BirdCredentials {
  const resolved = resolveBirdCredentials(creds ?? {});
  if (!resolved) throw new Error("Bird is not configured for this workspace.");
  return resolved;
}

function unknownDomain(detail: string): UnifiedDomainStatus {
  return { state: "unknown", detail, readyToSend: false, providerDomainId: null };
}

/* ------------------------------------------------------------------ *
 * Sending
 * ------------------------------------------------------------------ */

function transmissionBody(message: UnifiedOutboundMessage): Record<string, unknown> {
  const recipients = [
    { address: { email: message.to } },
    ...(message.cc ?? []).map((email) => ({ address: { email, header_to: message.to } })),
    ...(message.bcc ?? []).map((email) => ({ address: { email, header_to: message.to } })),
  ];
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(message.headers ?? {})) {
    const clean = String(value ?? "").trim();
    if (!name.trim() || !clean || /[\r\n]/.test(clean)) continue;
    if (/^(subject|from|to|reply-to)$/i.test(name.trim())) continue;
    headers[name.trim()] = clean;
  }
  const attachments = (message.attachments ?? [])
    .filter((item) => Boolean(item.content))
    .map((item) => ({ name: item.name, type: "application/octet-stream", data: item.content }));

  return {
    recipients,
    content: {
      from: { email: message.fromEmail, name: message.fromName },
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    },
    options: { open_tracking: true, click_tracking: true, transactional: true },
  };
}

async function birdSend(
  creds: EmailProviderCredentials,
  message: UnifiedOutboundMessage,
): Promise<UnifiedSendResult> {
  const resolved = resolveBirdCredentials(creds ?? {});
  if (!resolved) {
    return {
      ok: false,
      providerMessageId: null,
      rfcMessageId: null,
      statusCode: null,
      message: "Bird is not configured for this workspace.",
    };
  }
  const response = await createBirdTransmission(resolved, transmissionBody(message));
  const results = response.data?.results;
  const accepted = Number(results?.total_accepted_recipients ?? 0);
  const ok = response.ok && Boolean(results?.id) && accepted > 0;
  const headerMessageId = Object.entries(message.headers ?? {}).find(
    ([name]) => name.toLowerCase() === "message-id",
  )?.[1];
  return {
    ok,
    providerMessageId: results?.id ?? null,
    // Bird does not return the RFC Message-ID; when MunchReach supplied one as
    // a header, that value is authoritative. Otherwise it stays unknown.
    rfcMessageId: headerMessageId ?? null,
    statusCode: response.status,
    message: ok
      ? "Accepted for delivery."
      : (response.errorMessage ?? "The provider rejected the message."),
    rawMetadata: response.data,
  };
}

async function birdSendStatus(
  creds: EmailProviderCredentials,
  providerMessageId: string,
): Promise<UnifiedSendStatus> {
  const resolved = resolveBirdCredentials(creds ?? {});
  if (!resolved) return { known: false, status: null, detail: "Bird is not configured." };
  const events = await getBirdMessageEvents(resolved, providerMessageId);
  if (events.length === 0) {
    return { known: false, status: null, detail: "No events recorded for this message yet." };
  }
  const ranked: NormalizedEmailEventType[] = [
    "BOUNCED",
    "FAILED",
    "COMPLAINED",
    "CLICKED",
    "OPENED",
    "DELIVERED",
    "DELAYED",
    "SENT",
    "ACCEPTED",
  ];
  const seen = new Set(events.map((event) => birdEventType(event.type)));
  const status = ranked.find((type) => seen.has(type)) ?? "UNKNOWN";
  return { known: true, status, detail: `Latest provider state: ${status}.` };
}

/* ------------------------------------------------------------------ *
 * Domains / DNS / inbound
 * ------------------------------------------------------------------ */

async function dnsRequirements(
  creds: EmailProviderCredentials,
  domain: string,
): Promise<ProviderDnsRecord[]> {
  const resolved = resolveBirdCredentials(creds ?? {});
  if (!resolved) return [];
  const root = normalizeDomain(domain);
  const sendingDomain = await getBirdSendingDomain(resolved, root);
  const verification = await verifyBirdSendingDomain(resolved, root).catch(() => null);
  const sending = birdSendingDnsRecords({
    domain: root,
    sendingDomain,
    ...(verification?.dns ? { dns: verification.dns } : {}),
  });
  const inbound = await getBirdInboundDomain(resolved, root).catch(() => ({ exists: false }));
  // Inbound MX is only shown once receiving exists for the domain — it is a
  // separate concern from DKIM, tracking and the return-path CNAME.
  return inbound.exists ? [...sending, ...birdInboundMxRecords(root, resolved.region)] : sending;
}

async function inboundStatus(
  creds: EmailProviderCredentials,
  domain: string,
): Promise<UnifiedInboundStatus> {
  const resolved = resolveBirdCredentials(creds ?? {});
  if (!resolved) {
    return {
      enabled: false,
      setupMode: "api",
      records: [],
      detail: "Bird is not configured for this workspace.",
    };
  }
  const root = normalizeDomain(domain);
  const inbound = await getBirdInboundDomain(resolved, root);
  return {
    enabled: inbound.exists,
    setupMode: "api",
    records: inbound.exists ? birdInboundMxRecords(root, resolved.region) : [],
    detail: inbound.detail,
  };
}

/* ------------------------------------------------------------------ *
 * Webhook auth
 * ------------------------------------------------------------------ */

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function lowerHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

/* ------------------------------------------------------------------ *
 * Adapter
 * ------------------------------------------------------------------ */

export const birdEmailProvider: EmailProvider = {
  id: ID,
  label: "Bird",
  // Receiving is switched on through Bird's inbound-domains API, so MunchReach
  // can automate it; the customer only publishes the MX record.
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
    // Bird publishes the DNS values MunchReach must show; it does not edit
    // customer DNS, and neither does MunchReach.
    dns_api: true,
  }),

  async send(creds, message) {
    return birdSend(creds, message);
  },

  async getSendStatus(creds, providerMessageId) {
    return birdSendStatus(creds, providerMessageId);
  },

  async getRfcMessageId(creds, providerMessageId) {
    const resolved = resolveBirdCredentials(creds ?? {});
    if (!resolved) return null;
    const events = await getBirdMessageEvents(resolved, providerMessageId);
    // Bird exposes its own message id, not the RFC 5322 Message-ID. Only return
    // a value when Bird actually carries one — never synthesise it.
    for (const event of events) {
      const candidate = (event as Record<string, unknown>)["rfc822_message_id"];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return null;
  },

  async verifyDomain(creds, domain) {
    const resolved = resolveBirdCredentials(creds ?? {});
    if (!resolved) return unknownDomain("Bird is not configured for this workspace.");
    const root = normalizeDomain(domain);
    const existing = await getBirdSendingDomain(resolved, root);
    if (!existing) await createBirdSendingDomain(resolved, root);
    const verified = await verifyBirdSendingDomain(resolved, root);
    const state = birdDomainState(verified.status);
    return {
      state,
      detail: verified.detail,
      providerDomainId: root,
      readyToSend: state === "verified",
    };
  },

  async getDomainStatus(creds, domain) {
    const resolved = resolveBirdCredentials(creds ?? {});
    if (!resolved) return unknownDomain("Bird is not configured for this workspace.");
    const root = normalizeDomain(domain);
    const found = await getBirdSendingDomain(resolved, root);
    if (!found) {
      return {
        state: "unknown",
        detail: "Domain is not registered on the sending infrastructure.",
        providerDomainId: null,
        readyToSend: false,
      };
    }
    const state = birdDomainState(found.status);
    return {
      state,
      detail: `Ownership: ${found.status?.ownership_verified ? "verified" : "pending"}; DKIM: ${
        found.status?.dkim_status ?? "unverified"
      }; CNAME: ${found.status?.cname_status ?? "unverified"}`,
      providerDomainId: found.domain ?? root,
      readyToSend: state === "verified",
    };
  },

  async getDnsRequirements(creds, domain) {
    return dnsRequirements(creds, domain);
  },

  async getInboundStatus(creds, domain) {
    return inboundStatus(creds, domain);
  },

  async enableInbound(creds, domain) {
    const resolved = requireCreds(creds);
    const root = normalizeDomain(domain);
    const created = await createBirdInboundDomain(resolved, root);
    if (!created.ok) throw new Error(created.detail);
    return inboundStatus(creds, root);
  },

  async configureWebhooks(creds, url, events) {
    const resolved = requireCreds(creds);
    const hooks = await listBirdWebhooks(resolved);
    const match = hooks.find((hook) => (hook.target ?? "").includes(url));
    return {
      configured: Boolean(match),
      url: match?.target ?? null,
      events: match?.events ?? events ?? [],
      detail: match
        ? `Webhook ${match.active === false ? "inactive" : "active"}.`
        : "No matching webhook registered.",
    };
  },

  async listDomains(creds) {
    const resolved = requireCreds(creds);
    const [domains, inbound] = await Promise.all([
      listBirdSendingDomains(resolved),
      listBirdInboundDomains(resolved).catch(() => [] as string[]),
    ]);
    const receiving = new Set(inbound);
    return domains.map((domain) => {
      const name = normalizeDomain(domain.domain ?? "");
      return {
        id: name,
        name,
        status: birdDomainState(domain.status),
        receiving: receiving.has(name) ? "enabled" : "disabled",
      };
    });
  },

  async listWebhooks(creds) {
    const resolved = requireCreds(creds);
    const hooks = await listBirdWebhooks(resolved);
    return hooks.map((hook) => ({
      id: String(hook.id ?? ""),
      endpoint: String(hook.target ?? ""),
      status: hook.active === false ? "inactive" : "active",
      events: hook.events ?? [],
    }));
  },

  async registerWebhook(creds, endpoint, events) {
    const resolved = requireCreds(creds);
    return createBirdWebhook(resolved, { name: "MunchReach", target: endpoint, events });
  },

  async deleteWebhook(creds, id) {
    const resolved = requireCreds(creds);
    return deleteBirdWebhook(resolved, id);
  },

  identifyWebhookRequest(request) {
    const headers = lowerHeaders(request.headers);
    // Bird batches always carry the batch id header.
    if (headers["x-messagesystems-batch-id"]) {
      return {
        provider: ID,
        matched: true,
        confidence: "exact",
        detail: "Batch delivery carrying this provider's batch header.",
      };
    }
    const unwrapped = unwrap(request.payload);
    if (unwrapped) {
      return {
        provider: ID,
        matched: true,
        confidence: "likely",
        detail: `Payload uses this provider's batch envelope (${unwrapped.kind}).`,
      };
    }
    return {
      provider: ID,
      matched: false,
      confidence: "none",
      detail: "No provider-specific headers or batch envelope found.",
    };
  },

  verifyWebhookSignature(request, secret) {
    const headers = lowerHeaders(request.headers);
    if (!secret) {
      return {
        valid: false,
        detail: "No signing secret is configured for this endpoint.",
        verification: { status: "unverified", method: "token", reason: "missing_secret" },
      };
    }
    const token = headers["x-messagesystems-webhook-token"] ?? "";
    if (token && equal(token, secret)) {
      return {
        valid: true,
        detail: "Batch token matches the configured secret.",
        verification: { status: "valid", method: "token", reason: "token_match" },
      };
    }
    // Bird also supports HTTP basic auth on the webhook target.
    const basic = headers["authorization"] ?? "";
    if (basic.toLowerCase().startsWith("basic ")) {
      const decoded = Buffer.from(basic.slice(6).trim(), "base64").toString("utf8");
      const password = decoded.slice(decoded.indexOf(":") + 1);
      if (password && equal(password, secret)) {
        return {
          valid: true,
          detail: "Basic credentials match the configured secret.",
          verification: { status: "valid", method: "basic", reason: "basic_match" },
        };
      }
    }
    return {
      valid: false,
      detail: "Batch token did not match the configured secret.",
      verification: { status: "invalid", method: "token", reason: "token_mismatch" },
    };
  },

  parseDeliveryEvent(payload) {
    return birdEvent(payload);
  },

  parseTrackingEvent(payload) {
    return birdEvent(payload);
  },

  parseInboundEvent(payload) {
    return birdInboundEvent(payload);
  },
};

/** Registers Bird's relay webhook for a domain (inbound receiving target). */
export async function registerBirdRelayWebhook(
  creds: EmailProviderCredentials,
  input: { target: string; domain: string; authToken?: string },
): Promise<{ ok: boolean; id: string | null; detail: string }> {
  const resolved = requireCreds(creds);
  return createBirdRelayWebhook(resolved, {
    name: `MunchReach inbound ${normalizeDomain(input.domain)}`,
    target: input.target,
    domain: input.domain,
    ...(input.authToken ? { authToken: input.authToken } : {}),
  });
}
