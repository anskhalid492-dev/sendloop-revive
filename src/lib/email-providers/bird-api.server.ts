/**
 * Bird (bird.com) Email API client — the ONLY place in MunchReach that knows
 * how Bird's HTTP API is shaped.
 *
 * Bird's Email API is workspace- and region-scoped:
 *   https://email.us-west-1.api.bird.com/api/workspaces/{workspaceId}/reach/...
 *   https://email.eu-west-1.api.bird.com/api/workspaces/{workspaceId}/reach/...
 *
 * Endpoints used here (all documented by Bird):
 *   GET/POST   /reach/sending-domains
 *   GET        /reach/sending-domains/{domain}
 *   POST       /reach/sending-domains/{domain}/verify
 *   GET/POST   /reach/inbound-domains
 *   GET/POST   /reach/relay-webhooks
 *   GET/POST/DELETE /reach/webhooks
 *   POST       /reach/transmissions
 *   GET        /reach/events/message
 *
 * Rules honoured here:
 *  - Sending-domain DNS values (DKIM, return-path CNAME) come ONLY from Bird's
 *    API response (`dns.dkim_record`, `dns.cname_record`, `dkim.selector`).
 *  - The inbound MX *targets* are Bird's fixed regional receiving hosts; they
 *    are Bird-specific knowledge and stay inside this adapter — never in the
 *    generic DNS layer. Bird's inbound-domains API returns only the domain, so
 *    the targets cannot be read back from it.
 *  - Return-path/bounce, tracking, DKIM and inbound MX are kept strictly apart.
 *
 * Server-only.
 */
import { buildRootInboundMxRecord, normalizeDomain } from "./mx-host";
import type { ProviderDnsRecord } from "./types";

export type BirdRegion = "us" | "eu";

export type BirdCredentials = {
  key: string;
  workspaceId: string;
  region: BirdRegion;
};

export type BirdDkimConfiguration = {
  signing_domain?: string;
  public?: string;
  selector?: string;
  headers?: string;
};

export type BirdSendingDomainStatus = {
  ownership_verified?: boolean;
  dkim_status?: string;
  cname_status?: string;
  mx_status?: string;
  abuse_at_status?: string;
  postmaster_at_status?: string;
  verification_mailbox_status?: string;
  compliance_status?: string;
};

export type BirdSendingDomain = {
  domain?: string;
  tracking_domain?: string;
  status?: BirdSendingDomainStatus;
  dkim?: BirdDkimConfiguration;
  is_default_bounce_domain?: boolean;
  creation_time?: string;
};

/** Bird's `dns` block, returned by the verify endpoint. */
export type BirdDnsVerification = {
  dkim_record?: string;
  cname_record?: string;
  dkim_error?: string;
  cname_error?: string;
};

export type BirdWebhook = {
  id?: string;
  name?: string;
  target?: string;
  events?: string[];
  active?: boolean;
  auth_token?: string;
};

export type BirdRelayWebhook = {
  id?: string;
  name?: string;
  target?: string;
  auth_token?: string;
  match?: { protocol?: string; domain?: string };
};

export type BirdMessageEvent = {
  type?: string;
  event_id?: string;
  message_id?: string;
  transmission_id?: string;
  rcpt_to?: string;
  raw_rcpt_to?: string;
  friendly_from?: string;
  msg_from?: string;
  subject?: string;
  timestamp?: string;
  target_link_url?: string;
  bounce_class?: string;
  reason?: string;
  error_code?: string;
  error_message?: string;
  campaign_id?: string;
};

/* ------------------------------------------------------------------ *
 * Credentials
 * ------------------------------------------------------------------ */

function pick(creds: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = (creds[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function birdRegion(raw: string): BirdRegion {
  return raw.toLowerCase().startsWith("eu") ? "eu" : "us";
}

/**
 * Resolves credentials from the stored provider record first, then from
 * platform-level environment secrets. Returns `null` when Bird is not
 * configured, so callers can report "not configured" instead of throwing.
 */
export function resolveBirdCredentials(creds: Record<string, string>): BirdCredentials | null {
  const key = pick(creds, "api_key", "bird_api_key", "access_key") || envValue("BIRD_API_KEY");
  const workspaceId =
    pick(creds, "workspace_id", "bird_workspace_id") || envValue("BIRD_WORKSPACE_ID");
  if (!key || !workspaceId) return null;
  const region = birdRegion(pick(creds, "region", "bird_region") || envValue("BIRD_REGION") || "us");
  return { key, workspaceId, region };
}

export function birdApiBase(region: BirdRegion): string {
  return region === "eu"
    ? "https://email.eu-west-1.api.bird.com/api"
    : "https://email.us-west-1.api.bird.com/api";
}

export function birdWorkspacePath(creds: BirdCredentials, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${birdApiBase(creds.region)}/workspaces/${creds.workspaceId}/reach${suffix}`;
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

export type BirdResponse<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string | null;
  raw: string;
};

export async function birdFetch<T>(
  creds: BirdCredentials,
  path: string,
  init: RequestInit = {},
): Promise<BirdResponse<T>> {
  const response = await fetch(birdWorkspacePath(creds, path), {
    ...init,
    headers: {
      Authorization: `AccessKey ${creds.key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const raw = await response.text();
  let data: T | null = null;
  let errorMessage: string | null = null;
  try {
    const json = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    data = (json ?? null) as T | null;
    const errors = json?.["errors"];
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as Record<string, unknown>;
      errorMessage =
        [first["message"], first["description"]].filter(Boolean).join(" — ") || "Request failed";
    }
  } catch {
    errorMessage = response.ok ? null : raw.slice(0, 300);
  }
  return {
    ok: response.ok && !errorMessage,
    status: response.status,
    data,
    errorMessage: response.ok ? errorMessage : (errorMessage ?? `HTTP ${response.status}`),
    raw,
  };
}

/* ------------------------------------------------------------------ *
 * Sending domains
 * ------------------------------------------------------------------ */

export async function listBirdSendingDomains(
  creds: BirdCredentials,
): Promise<BirdSendingDomain[]> {
  const result = await birdFetch<{ results?: BirdSendingDomain[] }>(creds, "/sending-domains");
  return result.data?.results ?? [];
}

export async function getBirdSendingDomain(
  creds: BirdCredentials,
  domain: string,
): Promise<BirdSendingDomain | null> {
  const name = normalizeDomain(domain);
  const result = await birdFetch<{ results?: BirdSendingDomain }>(
    creds,
    `/sending-domains/${encodeURIComponent(name)}`,
  );
  return result.data?.results ?? null;
}

export async function createBirdSendingDomain(
  creds: BirdCredentials,
  domain: string,
): Promise<{ ok: boolean; detail: string }> {
  const result = await birdFetch<{ results?: BirdSendingDomain }>(creds, "/sending-domains", {
    method: "POST",
    body: JSON.stringify({ domain: normalizeDomain(domain), generate_dkim: true }),
  });
  // 409 means the domain already exists on the workspace — not a failure.
  if (result.status === 409) return { ok: true, detail: "Domain already registered." };
  return { ok: result.ok, detail: result.errorMessage ?? "Domain registered." };
}

/** Asks Bird to re-check the published DKIM and CNAME records. */
export async function verifyBirdSendingDomain(
  creds: BirdCredentials,
  domain: string,
): Promise<{ status: BirdSendingDomainStatus; dns: BirdDnsVerification; detail: string }> {
  const result = await birdFetch<{
    results?: BirdSendingDomainStatus & { dns?: BirdDnsVerification };
  }>(creds, `/sending-domains/${encodeURIComponent(normalizeDomain(domain))}/verify`, {
    method: "POST",
    body: JSON.stringify({ dkim_verify: true, cname_verify: true }),
  });
  const results = result.data?.results ?? {};
  const { dns, ...status } = results as BirdSendingDomainStatus & { dns?: BirdDnsVerification };
  return {
    status,
    dns: dns ?? {},
    detail: result.errorMessage ?? "Verification requested.",
  };
}

/** Bird's normalized ownership state, as Bird reports it. */
export function birdDomainState(
  status: BirdSendingDomainStatus | undefined,
): "unknown" | "pending" | "verified" | "failed" {
  if (!status) return "unknown";
  if (status.ownership_verified === true) return "verified";
  const values = [status.dkim_status, status.cname_status, status.mx_status].filter(
    (value): value is string => typeof value === "string",
  );
  if (values.includes("valid")) return "verified";
  if (values.includes("invalid")) return "failed";
  if (values.includes("pending")) return "pending";
  return values.length > 0 ? "pending" : "unknown";
}

/* ------------------------------------------------------------------ *
 * DNS records (values come ONLY from Bird's API)
 * ------------------------------------------------------------------ */

/** Host label of `name` relative to `root`; `@` when they are the same. */
function relativeHost(name: string, root: string): string {
  const n = normalizeDomain(name);
  const r = normalizeDomain(root);
  if (!n || n === r) return "@";
  return n.endsWith(`.${r}`) ? n.slice(0, -(r.length + 1)) : n;
}

/**
 * Builds the customer-facing sending records from Bird's own response.
 *
 * - DKIM        -> TXT at `<selector>._domainkey`, value from Bird
 * - Return path -> CNAME at the sending/bounce host, value from Bird
 * - Tracking    -> CNAME, only when Bird returns a tracking target
 *
 * Nothing is invented: when Bird has not published a value yet, the record is
 * omitted rather than guessed. SPF is never derived from these records.
 */
export function birdSendingDnsRecords(input: {
  domain: string;
  sendingDomain: BirdSendingDomain | null;
  dns?: BirdDnsVerification;
}): ProviderDnsRecord[] {
  const root = normalizeDomain(input.domain);
  const sd = input.sendingDomain ?? {};
  const dns = input.dns ?? {};
  const records: ProviderDnsRecord[] = [];

  const selector = (sd.dkim?.selector ?? "").trim();
  const dkimValue = (dns.dkim_record ?? "").trim() || dkimRecordValue(sd.dkim);
  if (selector && dkimValue) {
    const host = `${selector}._domainkey`;
    records.push({
      id: "bird-dkim",
      kind: "dkim",
      type: "TXT",
      host,
      fqdn: `${host}.${root}`,
      value: dkimValue,
      ttl: 3600,
      required: true,
      purpose: "Signs your outgoing email so mailbox providers can authenticate it (DKIM).",
    });
  }

  const cnameValue = (dns.cname_record ?? "").trim();
  if (cnameValue) {
    const host = relativeHost(sd.domain ?? root, root);
    records.push({
      id: "bird-return-path",
      kind: "verification",
      type: "CNAME",
      host,
      fqdn: host === "@" ? root : `${host}.${root}`,
      value: cnameValue.replace(/\.$/, ""),
      ttl: 3600,
      required: true,
      purpose:
        "Return path / bounce address for your sending domain. This is not an SPF record and not an inbound receiving record.",
    });
  }

  const trackingHost = (sd.tracking_domain ?? "").trim();
  const trackingTarget = trackingTargetOf(sd);
  if (trackingHost && trackingTarget) {
    const host = relativeHost(trackingHost, root);
    records.push({
      id: "bird-tracking",
      kind: "tracking",
      type: "CNAME",
      host,
      fqdn: host === "@" ? root : `${host}.${root}`,
      value: trackingTarget,
      ttl: 3600,
      required: false,
      purpose: "Branded link tracking for opens and clicks. Separate from DKIM and return path.",
    });
  }

  return records;
}

/** Bird returns the DKIM public key; the record wrapper is standard DKIM syntax. */
function dkimRecordValue(dkim: BirdDkimConfiguration | undefined): string {
  const publicKey = (dkim?.public ?? "").trim();
  if (!publicKey) return "";
  if (publicKey.toLowerCase().startsWith("v=dkim1")) return publicKey;
  return `v=DKIM1; k=rsa; h=sha256; p=${publicKey}`;
}

function trackingTargetOf(sd: BirdSendingDomain): string {
  const record = sd as unknown as Record<string, unknown>;
  const candidate =
    record["tracking_domain_cname"] ?? record["tracking_cname"] ?? record["tracking_target"];
  return typeof candidate === "string" ? candidate.trim().replace(/\.$/, "") : "";
}

/* ------------------------------------------------------------------ *
 * Inbound domains + relay webhooks
 * ------------------------------------------------------------------ */

/**
 * Bird's fixed regional inbound (receiving) hosts. Bird's inbound-domains API
 * returns only the domain name, so these targets cannot be read back from it —
 * they are Bird-specific knowledge and stay inside this adapter.
 */
const BIRD_INBOUND_MX_HOSTS: Record<BirdRegion, string[]> = {
  us: ["rx1.sparkpostmail.com", "rx2.sparkpostmail.com", "rx3.sparkpostmail.com"],
  eu: ["rx1.eu.sparkpostmail.com", "rx2.eu.sparkpostmail.com", "rx3.eu.sparkpostmail.com"],
};

export function birdInboundMxTargets(region: BirdRegion): { host: string; priority: number }[] {
  return (BIRD_INBOUND_MX_HOSTS[region] ?? []).map((host) => ({ host, priority: 10 }));
}

/**
 * Inbound MX records for ROOT-DOMAIN receiving. The host is always `@` —
 * decided by MunchReach, never by Bird — so a sending or tracking CNAME can
 * never collide with it.
 */
export function birdInboundMxRecords(domain: string, region: BirdRegion): ProviderDnsRecord[] {
  return birdInboundMxTargets(region).map((target, index) =>
    buildRootInboundMxRecord({
      id: `bird-inbound-mx-${index}`,
      domain,
      target: target.host,
      priority: target.priority,
      ttl: 3600,
      purpose: "Delivers replies to your campaigns back into MunchReach (inbound receiving).",
    }),
  );
}

export async function listBirdInboundDomains(creds: BirdCredentials): Promise<string[]> {
  const result = await birdFetch<{ results?: { domain?: string }[] }>(creds, "/inbound-domains");
  return (result.data?.results ?? [])
    .map((row) => normalizeDomain(row.domain ?? ""))
    .filter(Boolean);
}

export async function getBirdInboundDomain(
  creds: BirdCredentials,
  domain: string,
): Promise<{ exists: boolean; detail: string }> {
  const result = await birdFetch<{ results?: { domain?: string } }>(
    creds,
    `/inbound-domains/${encodeURIComponent(normalizeDomain(domain))}`,
  );
  if (result.status === 404) return { exists: false, detail: "Receiving is not enabled." };
  return {
    exists: Boolean(result.data?.results?.domain),
    detail: result.errorMessage ?? "Receiving is enabled.",
  };
}

export async function createBirdInboundDomain(
  creds: BirdCredentials,
  domain: string,
): Promise<{ ok: boolean; detail: string }> {
  const result = await birdFetch(creds, "/inbound-domains", {
    method: "POST",
    body: JSON.stringify({ domain: normalizeDomain(domain) }),
  });
  if (result.status === 409) return { ok: true, detail: "Receiving already enabled." };
  return { ok: result.ok, detail: result.errorMessage ?? "Receiving enabled." };
}

export async function listBirdRelayWebhooks(
  creds: BirdCredentials,
): Promise<BirdRelayWebhook[]> {
  const result = await birdFetch<{ results?: BirdRelayWebhook[] }>(creds, "/relay-webhooks");
  return result.data?.results ?? [];
}

export async function createBirdRelayWebhook(
  creds: BirdCredentials,
  input: { name: string; target: string; domain: string; authToken?: string },
): Promise<{ ok: boolean; id: string | null; detail: string }> {
  const result = await birdFetch<{ results?: { id?: string } }>(creds, "/relay-webhooks", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      target: input.target,
      ...(input.authToken ? { auth_token: input.authToken } : {}),
      match: { protocol: "SMTP", domain: normalizeDomain(input.domain) },
    }),
  });
  return {
    ok: result.ok,
    id: result.data?.results?.id ?? null,
    detail: result.errorMessage ?? "Relay webhook created.",
  };
}

/* ------------------------------------------------------------------ *
 * Event webhooks
 * ------------------------------------------------------------------ */

export async function listBirdWebhooks(creds: BirdCredentials): Promise<BirdWebhook[]> {
  const result = await birdFetch<{ results?: BirdWebhook[] }>(creds, "/webhooks");
  return result.data?.results ?? [];
}

export async function createBirdWebhook(
  creds: BirdCredentials,
  input: { name: string; target: string; events: string[]; authToken?: string },
): Promise<{ ok: boolean; id: string | null; detail: string }> {
  const result = await birdFetch<{ results?: { id?: string } }>(creds, "/webhooks", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      target: input.target,
      events: input.events,
      ...(input.authToken ? { auth_token: input.authToken } : {}),
    }),
  });
  return {
    ok: result.ok,
    id: result.data?.results?.id ?? null,
    detail: result.errorMessage ?? "Webhook created.",
  };
}

export async function deleteBirdWebhook(
  creds: BirdCredentials,
  id: string,
): Promise<{ ok: boolean; detail: string }> {
  const result = await birdFetch(creds, `/webhooks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return { ok: result.ok, detail: result.errorMessage ?? "Webhook deleted." };
}

/* ------------------------------------------------------------------ *
 * Transmissions + events
 * ------------------------------------------------------------------ */

export async function createBirdTransmission(
  creds: BirdCredentials,
  body: Record<string, unknown>,
): Promise<
  BirdResponse<{
    results?: { id?: string; total_accepted_recipients?: number; total_rejected_recipients?: number };
  }>
> {
  return birdFetch(creds, "/transmissions", { method: "POST", body: JSON.stringify(body) });
}

/** Message events for one transmission, newest first when Bird orders them. */
export async function getBirdMessageEvents(
  creds: BirdCredentials,
  transmissionId: string,
): Promise<BirdMessageEvent[]> {
  const query = new URLSearchParams({
    transmission_ids: transmissionId,
    per_page: "50",
  });
  const result = await birdFetch<{ results?: BirdMessageEvent[] }>(
    creds,
    `/events/message?${query.toString()}`,
  );
  return result.data?.results ?? [];
}
