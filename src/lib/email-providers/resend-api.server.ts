/**
 * Canonical Resend REST client for the unified provider layer.
 *
 * This is the ONE place inside `src/lib/email-providers/` that knows the Resend
 * API shape: authentication, domains, DNS records, receiving capability,
 * webhooks and single-message reads (`GET /emails/:id`).
 *
 * Behaviour note (Phase 2): the request semantics here are copied verbatim from
 * the existing production helpers (`src/lib/ops.server.ts` resendFetch,
 * `src/lib/provider-credentials.server.ts` RFC message-id read) so callers can
 * be migrated one at a time with zero behaviour change. Legacy call sites still
 * exist and are scheduled for later phases — see PHASE-2 notes in the response.
 *
 * Server-only. Never import from client code.
 */

const API = "https://api.resend.com";

/** Platform-level Resend key (managed infrastructure). */
export function platformResendApiKey(): string | undefined {
  return process.env["RESEND_API_KEY"];
}

export function resolveResendApiKey(creds?: Record<string, string> | null): string | undefined {
  const explicit = creds?.["api_key"];
  return explicit && explicit.trim() ? explicit.trim() : platformResendApiKey();
}

/**
 * Raw Resend request. Returns `null` for any non-OK response or missing key —
 * identical to the existing production helper, which treats provider outages as
 * "unknown" rather than throwing.
 */
export async function resendFetch<T>(
  path: string,
  init?: RequestInit,
  creds?: Record<string, string> | null,
): Promise<T | null> {
  const key = resolveResendApiKey(creds);
  if (!key) return null;
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ *
 * Provider payload shapes (internal only)
 * ------------------------------------------------------------------ */

export type ResendDnsRecord = {
  record?: string;
  type?: string;
  name?: string;
  value?: string;
  ttl?: string | number;
  priority?: number;
  status?: string;
};

export type ResendDomain = {
  id: string;
  name: string;
  status?: string;
  capabilities?: { sending?: string; receiving?: string };
  records?: ResendDnsRecord[];
};

export type ResendWebhook = {
  id?: string;
  endpoint?: string;
  events?: string[];
  status?: string;
};

/* ------------------------------------------------------------------ *
 * Domains
 * ------------------------------------------------------------------ */

export async function listResendDomains(
  creds?: Record<string, string> | null,
): Promise<ResendDomain[]> {
  const list = await resendFetch<{ data?: ResendDomain[] }>("/domains", undefined, creds);
  return list?.data ?? [];
}

/** Finds the registered domain that owns `domain` (handles subdomains). */
export async function findResendDomain(
  domain: string,
  creds?: Record<string, string> | null,
): Promise<ResendDomain | null> {
  const needle = domain.toLowerCase();
  const match = (await listResendDomains(creds)).find((d) =>
    needle.endsWith((d.name ?? "").toLowerCase()),
  );
  if (!match?.id) return null;
  return (await resendFetch<ResendDomain>(`/domains/${match.id}`, undefined, creds)) ?? match;
}

export async function setResendReceiving(
  domainId: string,
  enabled: boolean,
  creds?: Record<string, string> | null,
): Promise<boolean> {
  const updated = await resendFetch<{ id?: string }>(
    `/domains/${domainId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ capabilities: { receiving: enabled ? "enabled" : "disabled" } }),
    },
    creds,
  );
  return Boolean(updated);
}

/** The MX record Resend publishes for inbound receiving, if any. */
export function resendInboundMxRecords(domain: ResendDomain | null): ResendDnsRecord[] {
  return (domain?.records ?? []).filter(
    (r) => (r.type ?? "").toUpperCase() === "MX" && (r.record ?? "").toLowerCase() === "receiving",
  );
}

/* ------------------------------------------------------------------ *
 * Webhooks (read-only in this phase)
 * ------------------------------------------------------------------ */

export async function listResendWebhooks(
  creds?: Record<string, string> | null,
): Promise<ResendWebhook[]> {
  const list = await resendFetch<{ data?: ResendWebhook[] }>("/webhooks", undefined, creds);
  return list?.data ?? [];
}

/* ------------------------------------------------------------------ *
 * Single message reads
 * ------------------------------------------------------------------ */

export async function getResendEmail(
  providerMessageId: string,
  creds?: Record<string, string> | null,
): Promise<Record<string, unknown> | null> {
  if (!providerMessageId) return null;
  const key = resolveResendApiKey(creds);
  if (!key) return null;
  try {
    const res = await fetch(`${API}/emails/${providerMessageId}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Depth-first search for an RFC 5322 Message-ID in a provider payload. */
export function extractRfcMessageId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractRfcMessageId(item);
      if (found) return found;
    }
    return undefined;
  }

  const object = value as Record<string, unknown>;
  const direct =
    object["message_id"] ??
    object["messageId"] ??
    object["Message-ID"] ??
    object["Message-Id"] ??
    object["message-id"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const headerName = object["name"] ?? object["key"];
  if (typeof headerName === "string" && headerName.toLowerCase() === "message-id") {
    const headerValue = object["value"] ?? object["Value"];
    if (typeof headerValue === "string" && headerValue.trim()) return headerValue.trim();
  }

  return extractRfcMessageId(object["headers"] ?? object["Headers"] ?? object["data"]);
}

export async function getResendRfcMessageId(
  providerMessageId: string,
  creds?: Record<string, string> | null,
): Promise<string | null> {
  const body = await getResendEmail(providerMessageId, creds);
  return body ? (extractRfcMessageId(body) ?? null) : null;
}
