/**
 * Calendly OAuth 2.0 + API v2 client (server-only).
 *
 * Nothing in here may ever be imported from the browser: it reads the app's
 * client secret and handles customer access/refresh tokens. Tokens are stored
 * encrypted through the shared `integration_secrets` helpers, exactly like
 * every other provider credential.
 *
 * Calendly API v1 is retired — every call below targets api.calendly.com v2.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadCredentials, storeCredentials, type ConnectionRow } from "@/lib/integrations.server";

export const CALENDLY_SLUG = "calendly";
const AUTH_BASE = "https://auth.calendly.com";
const API_BASE = "https://api.calendly.com";

/** Calendly's OAuth has no scope picker; we simply call the fewest endpoints. */
export const CALENDLY_WEBHOOK_EVENTS = ["invitee.created", "invitee.canceled"] as const;

export type CalendlyCredentials = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  owner_uri: string;
  organization_uri: string;
  webhook_signing_key?: string;
};

export function calendlyAppCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env["CALENDLY_CLIENT_ID"];
  const clientSecret = process.env["CALENDLY_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function calendlyRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/integrations/calendly/callback`;
}

export function calendlyAuthorizeUrl(origin: string, state: string): string {
  const app = calendlyAppCredentials();
  if (!app) throw new Error("Calendly is not configured on this deployment.");
  const url = new URL(`${AUTH_BASE}/oauth/authorize`);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", calendlyRedirectUri(origin));
  url.searchParams.set("state", state);
  return url.toString();
}

/* ------------------------------------------------------------ signed state */

function stateKey(): Buffer {
  const raw = process.env["PROVIDER_CREDENTIALS_KEY"];
  if (!raw) throw new Error("PROVIDER_CREDENTIALS_KEY is not set");
  return createHmac("sha256", raw).update("calendly-oauth-state").digest();
}

export type StatePayload = {
  workspaceId: string;
  userId: string;
  nonce: string;
  exp: number;
};

export function newStateNonce(): string {
  return randomBytes(18).toString("hex");
}

export function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(raw: string): StatePayload | null {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateKey()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (!payload.workspaceId || !payload.nonce || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ token calls */

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  owner: string;
  organization: string;
};

async function tokenRequest(form: Record<string, string>): Promise<TokenResponse> {
  const app = calendlyAppCredentials();
  if (!app) throw new Error("Calendly is not configured on this deployment.");
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      ...form,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Calendly rejected the authorization (${res.status}).`);
  return JSON.parse(text) as TokenResponse;
}

export async function exchangeCode(code: string, origin: string): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: calendlyRedirectUri(origin),
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function revokeToken(token: string): Promise<void> {
  const app = calendlyAppCredentials();
  if (!app) return;
  await fetch(`${AUTH_BASE}/oauth/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      token,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

/* ------------------------------------------------------------ API v2 calls */

async function api<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: T | null }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(15_000),
  });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

export type CalendlyUser = {
  uri: string;
  name: string | null;
  email: string | null;
  current_organization: string;
  scheduling_url?: string;
};

/** The only verification MunchReach trusts: a live GET /users/me. */
export async function calendlyMe(
  accessToken: string,
): Promise<{ ok: boolean; status: number; user: CalendlyUser | null }> {
  const res = await api<{ resource?: CalendlyUser }>(accessToken, "/users/me");
  return { ok: res.ok, status: res.status, user: res.body?.resource ?? null };
}

export async function createWebhookSubscription(
  accessToken: string,
  args: { url: string; organization: string; user: string; signingKey: string },
): Promise<{ ok: boolean; uri: string | null; message: string }> {
  const res = await api<{ resource?: { uri?: string } }>(accessToken, "/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url: args.url,
      events: [...CALENDLY_WEBHOOK_EVENTS],
      organization: args.organization,
      user: args.user,
      scope: "user",
      signing_key: args.signingKey,
    }),
  });
  if (res.ok && res.body?.resource?.uri) {
    return { ok: true, uri: res.body.resource.uri, message: "Webhook registered." };
  }
  return { ok: false, uri: null, message: `Calendly refused the webhook subscription (${res.status}).` };
}

export async function deleteWebhookSubscription(accessToken: string, uri: string): Promise<void> {
  if (!uri.startsWith(`${API_BASE}/`)) return;
  await fetch(uri, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

export async function getScheduledEvent(
  accessToken: string,
  uri: string,
): Promise<Record<string, unknown> | null> {
  if (!uri.startsWith(`${API_BASE}/`)) return null;
  const res = await fetch(uri, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as { resource?: Record<string, unknown> } | null;
  return body?.resource ?? null;
}

/* ------------------------------------------------------------ connection */

export async function loadCalendlyConnection(
  workspaceId: string,
): Promise<ConnectionRow | null> {
  const { data } = await supabaseAdmin
    .from("integration_connections")
    .select(
      "id, workspace_id, slug, status, account_label, config, error_message, last_synced_at, last_event_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("slug", CALENDLY_SLUG)
    .maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

export async function saveCalendlyCredentials(
  connectionId: string,
  creds: CalendlyCredentials,
): Promise<void> {
  await storeCredentials(connectionId, creds as unknown as Record<string, string>);
}

export async function readCalendlyCredentials(
  connectionId: string,
): Promise<CalendlyCredentials | null> {
  const creds = await loadCredentials(connectionId);
  if (!creds || !creds["access_token"]) return null;
  return creds as unknown as CalendlyCredentials;
}

async function markNeedsReconnect(connectionId: string, message: string): Promise<void> {
  await supabaseAdmin
    .from("integration_connections")
    .update({ status: "error", error_message: message })
    .eq("id", connectionId);
}

/**
 * Returns a usable access token, refreshing it when it is close to expiry.
 * If Calendly says the authorization is gone, the connection flips to
 * "needs attention" and the caller gets null instead of a hard crash.
 */
export async function accessTokenForConnection(
  connectionId: string,
): Promise<{ token: string | null; creds: CalendlyCredentials | null }> {
  const creds = await readCalendlyCredentials(connectionId);
  if (!creds) {
    await markNeedsReconnect(connectionId, "Calendly credentials could not be read. Reconnect Calendly.");
    return { token: null, creds: null };
  }
  const expiresAt = Date.parse(creds.expires_at || "");
  const fresh = Number.isFinite(expiresAt) && expiresAt - Date.now() > 120_000;
  if (fresh) return { token: creds.access_token, creds };

  try {
    const next = await refreshAccessToken(creds.refresh_token);
    const updated: CalendlyCredentials = {
      ...creds,
      access_token: next.access_token,
      refresh_token: next.refresh_token || creds.refresh_token,
      expires_at: new Date(Date.now() + next.expires_in * 1000).toISOString(),
      owner_uri: next.owner || creds.owner_uri,
      organization_uri: next.organization || creds.organization_uri,
    };
    await saveCalendlyCredentials(connectionId, updated);
    await supabaseAdmin
      .from("integration_connections")
      .update({ status: "connected", error_message: null, last_synced_at: new Date().toISOString() })
      .eq("id", connectionId);
    return { token: updated.access_token, creds: updated };
  } catch {
    await markNeedsReconnect(
      connectionId,
      "Calendly access was revoked or expired. Reconnect Calendly to keep tracking meetings.",
    );
    return { token: null, creds };
  }
}

/* ------------------------------------------------------------ webhook auth */

/**
 * Verifies `Calendly-Webhook-Signature: t=<unix>,v1=<hmac>` over `<t>.<body>`.
 * Rejects signatures older than 5 minutes so a captured call cannot be replayed.
 */
export function verifyWebhookSignature(
  header: string | null,
  rawBody: string,
  signingKey: string,
): boolean {
  if (!header || !signingKey) return false;
  const parts = new Map(
    header.split(",").map((p) => {
      const [k, v] = p.trim().split("=");
      return [k ?? "", v ?? ""] as const;
    }),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", signingKey).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newWebhookSigningKey(): string {
  return randomBytes(32).toString("hex");
}
