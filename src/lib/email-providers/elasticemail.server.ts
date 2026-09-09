/**
 * Elastic Email provider adapter (unified layer).
 *
 * Documented v4 API surface used here:
 *   POST   /emails/transactional          send
 *   GET    /emails/{transactionid}/status delivery status
 *   GET    /security/apikeys              read-only credential check
 *   GET/POST/DELETE /webhook              webhook subscriptions
 *   GET/POST /inboundroute                inbound routing rules
 *   domains + DKIM record: see `@/lib/domain-providers/elasticemail.server`
 *
 * Elastic Email documents no signature on its outgoing webhook deliveries, so
 * this adapter deliberately implements no signature verification and lets the
 * shared inbound pipeline apply MunchReach's own endpoint secret instead.
 */
import {
  ELASTIC_EMAIL_API as API,
  elasticHeaders,
  findElasticDomain,
} from "@/lib/domain-providers/elasticemail.server";
import type { EmailProvider } from "./provider";
import {
  capabilities,
  type NormalizedEmailEvent,
  type NormalizedEmailEventType,
  type UnifiedSendResult,
} from "./types";

const ID = "elasticemail";

const EVENT_MAP: Record<string, NormalizedEmailEventType> = {
  sent: "SENT",
  delivered: "DELIVERED",
  opened: "OPENED",
  open: "OPENED",
  clicked: "CLICKED",
  click: "CLICKED",
  bounced: "BOUNCED",
  error: "FAILED",
  abusereport: "COMPLAINED",
  abuse_report: "COMPLAINED",
  spam: "COMPLAINED",
  unsubscribed: "UNSUBSCRIBED",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function elasticEmailEvent(payload: unknown): NormalizedEmailEvent | null {
  const p = asRecord(payload);
  const raw = (
    str(p["status"]) ??
    str(p["eventType"]) ??
    str(p["event"]) ??
    str(p["category"]) ??
    ""
  )
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!raw) return null;
  return {
    type: EVENT_MAP[raw] ?? "UNKNOWN",
    provider: ID,
    providerEventId: str(p["transactionid"]) ?? str(p["TransactionID"]),
    providerMessageId: str(p["messageid"]) ?? str(p["MessageID"]) ?? str(p["msgid"]),
    recipient: str(p["to"]) ?? str(p["email"]) ?? str(p["recipient"]),
    sender: str(p["from"]),
    subject: str(p["subject"]),
    url: str(p["targeturl"]) ?? str(p["url"]),
    bounceType: raw === "bounced" ? "unknown" : null,
    reason: str(p["statusdetails"]) ?? str(p["errormessage"]) ?? str(p["reason"]),
    occurredAt: str(p["date"]) ?? str(p["eventdate"]),
    rawMetadata: payload,
  };
}

async function sendElasticEmail(
  creds: Record<string, string>,
  message: Parameters<NonNullable<EmailProvider["send"]>>[1],
): Promise<UnifiedSendResult> {
  const body: {
    ContentType: string;
    Content: string;
    Charset: string;
  }[] = [{ ContentType: "PlainText", Content: message.text, Charset: "utf-8" }];
  if (message.html) {
    body.unshift({ ContentType: "HTML", Content: message.html, Charset: "utf-8" });
  }

  const res = await fetch(`${API}/emails/transactional`, {
    method: "POST",
    headers: elasticHeaders(creds),
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      Recipients: {
        To: [message.to],
        ...(message.cc?.length ? { CC: message.cc } : {}),
        ...(message.bcc?.length ? { BCC: message.bcc } : {}),
      },
      Content: {
        From: `${message.fromName} <${message.fromEmail}>`,
        ...(message.replyTo ? { ReplyTo: message.replyTo } : {}),
        Subject: message.subject,
        Body: body,
        ...(message.headers && Object.keys(message.headers).length
          ? { Headers: message.headers }
          : {}),
      },
      Options: { TrackOpens: true, TrackClicks: true },
    }),
  });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  const payload = asRecord(json);
  return {
    ok: res.ok,
    providerMessageId: str(payload["MessageID"]) ?? str(payload["TransactionID"]),
    statusCode: res.status,
    message: res.ok
      ? `Provider accepted the email for ${message.to}.`
      : `Provider refused the send [${res.status}]: ${raw.slice(0, 300)}`,
    rawMetadata: json,
  };
}

export const elasticEmailProvider: EmailProvider = {
  id: ID,
  label: "Elastic Email",
  // Receiving is switched on with inbound routes through the provider API.
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
    return sendElasticEmail(creds, message);
  },

  async getSendStatus(creds, providerMessageId) {
    const res = await fetch(`${API}/emails/${encodeURIComponent(providerMessageId)}/status`, {
      headers: elasticHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { known: false, status: null, detail: `Provider responded ${res.status}.` };
    }
    const json = (await res.json().catch(() => null)) as unknown;
    const raw = (str(asRecord(json)["Status"]) ?? "").toLowerCase();
    return {
      known: raw !== "",
      status: EVENT_MAP[raw] ?? "UNKNOWN",
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
    const found = await findElasticDomain(creds, domain);
    const res = await fetch(`${API}/inboundroute`, {
      headers: elasticHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    const routes = res.ok ? ((await res.json().catch(() => [])) as Record<string, unknown>[]) : [];
    const matching = Array.isArray(routes)
      ? routes.filter((r) => String(r["Filter"] ?? "").toLowerCase().includes(domain.toLowerCase()))
      : [];
    return {
      enabled: found?.MX === true && matching.length > 0,
      setupMode: "api",
      // The provider reports only whether MX is verified; it never returns the
      // MX host/priority, so no record is fabricated here.
      records: [],
      detail:
        found?.MX === true
          ? `Inbound MX verified; ${matching.length} inbound route(s) configured.`
          : "Inbound MX is not verified for this domain at the provider. Publish the MX value shown in the provider dashboard — it is not exposed through the API.",
    };
  },

  async enableInbound(creds, domain) {
    const res = await fetch(`${API}/inboundroute`, {
      method: "POST",
      headers: elasticHeaders(creds),
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        Name: `MunchReach ${domain}`,
        FilterType: "EmailAddress",
        Filter: `@${domain}`,
        ActionType: "NotifyViaHttp",
        HttpAddress: "https://munchreach.com/api/public/inbound/email",
      }),
    });
    if (!res.ok) {
      throw new Error(`The provider rejected the inbound route [${res.status}].`);
    }
    return this.getInboundStatus!(creds, domain);
  },

  async listDomains(creds) {
    const res = await fetch(`${API}/domains`, {
      headers: elasticHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const items = ((await res.json().catch(() => [])) as Record<string, unknown>[]) ?? [];
    return (Array.isArray(items) ? items : []).map((d) => ({
      id: String(d["Domain"] ?? ""),
      name: String(d["Domain"] ?? ""),
      status: d["Verify"] === true ? "verified" : "pending",
      receiving: d["MX"] === true ? "enabled" : "disabled",
    }));
  },

  async listWebhooks(creds) {
    const res = await fetch(`${API}/webhook?limit=100&offset=0`, {
      headers: elasticHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const items = ((await res.json().catch(() => [])) as Record<string, unknown>[]) ?? [];
    return (Array.isArray(items) ? items : []).map((h) => ({
      id: String(h["WebhookID"] ?? ""),
      endpoint: String(h["URL"] ?? ""),
      status: h["IsEnabled"] === false ? "disabled" : "enabled",
      events: [
        ["sent", h["NotificationForSent"]],
        ["opened", h["NotificationForOpened"]],
        ["clicked", h["NotificationForClicked"]],
        ["unsubscribed", h["NotificationForUnsubscribed"]],
        ["abuse_report", h["NotificationForAbuseReport"]],
        ["error", h["NotificationForError"]],
      ]
        .filter(([, on]) => on === true)
        .map(([name]) => String(name)),
    }));
  },

  async registerWebhook(creds, endpoint) {
    const res = await fetch(`${API}/webhook`, {
      method: "POST",
      headers: elasticHeaders(creds),
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        Name: "MunchReach",
        URL: endpoint,
        NotifyOncePerEmail: true,
        NotificationForSent: true,
        NotificationForOpened: true,
        NotificationForClicked: true,
        NotificationForUnsubscribed: true,
        NotificationForAbuseReport: true,
        NotificationForError: true,
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
    return { ok: true, id: str(asRecord(json)["WebhookID"]), detail: "Webhook created." };
  },

  async deleteWebhook(creds, id) {
    const res = await fetch(`${API}/webhook/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: elasticHeaders(creds),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok
      ? { ok: true, detail: "Webhook removed." }
      : { ok: false, detail: `Provider responded ${res.status}.` };
  },

  identifyWebhookRequest(request) {
    const p = asRecord(request.payload);
    const hasEnvelope = Boolean(p["transactionid"] ?? p["TransactionID"]);
    const status = String(p["status"] ?? p["eventType"] ?? "").toLowerCase();
    if (hasEnvelope && Object.hasOwn(EVENT_MAP, status.replace(/\s+/g, ""))) {
      return {
        provider: ID,
        matched: true,
        confidence: "likely",
        detail: `Payload carries this provider's transaction envelope (${status}).`,
      };
    }
    return {
      provider: ID,
      matched: false,
      confidence: "none",
      detail: "No provider-specific payload envelope found.",
    };
  },

  parseDeliveryEvent: elasticEmailEvent,
  parseTrackingEvent: elasticEmailEvent,
};
