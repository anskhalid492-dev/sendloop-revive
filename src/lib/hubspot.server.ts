/**
 * HubSpot OAuth 2.0 + CRM client (server-only).
 *
 * Never import this from the browser: it reads the MunchReach HubSpot public
 * app secret and handles per-customer access/refresh tokens. Tokens are stored
 * encrypted through the shared `integration_secrets` helpers, exactly like
 * every other provider credential, and are never returned to the client.
 *
 * Scope choice: only what the existing MunchReach HubSpot features need —
 * reading and writing contacts. No extra permission is requested.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadCredentials, storeCredentials, type ConnectionRow } from "@/lib/integrations.server";

export const HUBSPOT_SLUG = "hubspot";
const AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const API_BASE = "https://api.hubapi.com";

/** Exactly the scopes the existing contact sync needs. */
export const HUBSPOT_SCOPES = [
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
] as const;

export type HubSpotCredentials = {
  access_token: string;
  /** Absent on legacy private-app-token connections. */
  refresh_token?: string;
  /** ISO timestamp; absent on legacy private-app-token connections. */
  expires_at?: string;
  hub_id?: string;
  hub_domain?: string;
  scope?: string;
};

export function hubspotAppCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env["HUBSPOT_CLIENT_ID"];
  const clientSecret = process.env["HUBSPOT_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function hubspotRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/integrations/hubspot/callback`;
}

export function hubspotAuthorizeUrl(origin: string, state: string): string {
  const app = hubspotAppCredentials();
  if (!app) throw new Error("HubSpot is not configured on this deployment.");
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", hubspotRedirectUri(origin));
  url.searchParams.set("scope", HUBSPOT_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

/* ------------------------------------------------------------ signed state */

function stateKey(): Buffer {
  const raw = process.env["PROVIDER_CREDENTIALS_KEY"];
  if (!raw) throw new Error("PROVIDER_CREDENTIALS_KEY is not set");
  return createHmac("sha256", raw).update("hubspot-oauth-state").digest();
}

export type HubSpotStatePayload = {
  workspaceId: string;
  userId: string;
  nonce: string;
  exp: number;
};

export function newStateNonce(): string {
  return randomBytes(18).toString("hex");
}

export function signState(payload: HubSpotStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(raw: string): HubSpotStatePayload | null {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateKey()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as HubSpotStatePayload;
    if (!payload.workspaceId || !payload.nonce || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ token calls */

export type HubSpotTokenResult = {
  ok: boolean;
  /** Machine code for internal logging only — never shown to a customer. */
  error: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

async function tokenRequest(form: Record<string, string>): Promise<HubSpotTokenResult> {
  const app = hubspotAppCredentials();
  if (!app) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(`${API_BASE}/oauth/v1/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        ...form,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as
      | { access_token?: string; refresh_token?: string; expires_in?: number; message?: string }
      | null;
    if (!res.ok || !body?.access_token) {
      return { ok: false, error: `http_${res.status}` };
    }
    return {
      ok: true,
      error: "",
      access_token: body.access_token,
      ...(body.refresh_token ? { refresh_token: body.refresh_token } : {}),
      expires_in: body.expires_in ?? 1800,
    };
  } catch (error) {
    return { ok: false, error: `network:${(error as Error).message}` };
  }
}

export function exchangeCode(code: string, origin: string): Promise<HubSpotTokenResult> {
  return tokenRequest({
    grant_type: "authorization_code",
    redirect_uri: hubspotRedirectUri(origin),
    code,
  });
}

export function refreshAccessToken(refreshToken: string): Promise<HubSpotTokenResult> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Revokes the customer's refresh token at HubSpot. Best effort. */
export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/oauth/v1/refresh-tokens/${encodeURIComponent(refreshToken)}`,
      { method: "DELETE", signal: AbortSignal.timeout(10_000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export type HubSpotTokenInfo = {
  ok: boolean;
  error: string;
  hubId?: string;
  hubDomain?: string;
  user?: string;
  scopes?: string[];
};

/** Reads which portal a token belongs to, so the UI can name the account. */
export async function tokenInfo(accessToken: string): Promise<HubSpotTokenInfo> {
  try {
    const res = await fetch(
      `${API_BASE}/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const body = (await res.json().catch(() => null)) as
      | { hub_id?: number; hub_domain?: string; user?: string; scopes?: string[] }
      | null;
    if (!body) return { ok: false, error: "bad_body" };
    return {
      ok: true,
      error: "",
      ...(body.hub_id ? { hubId: String(body.hub_id) } : {}),
      ...(body.hub_domain ? { hubDomain: body.hub_domain } : {}),
      ...(body.user ? { user: body.user } : {}),
      ...(body.scopes ? { scopes: body.scopes } : {}),
    };
  } catch (error) {
    return { ok: false, error: `network:${(error as Error).message}` };
  }
}

/** Plain-language reason a customer can act on, from a HubSpot failure code. */
export function hubspotErrorForCustomer(error: string): string {
  if (error === "not_configured") {
    return "HubSpot sign-in is not available on this environment yet.";
  }
  if (error === "declined") return "HubSpot connection cancelled.";
  if (error === "no_credentials") {
    return "HubSpot credentials could not be read. Use Reconnect to sign in again.";
  }
  if (error === "refresh_failed" || error.startsWith("http_401") || error.startsWith("http_403")) {
    return "HubSpot no longer accepts this connection. Use Reconnect to sign in again.";
  }
  if (error.startsWith("http_400")) {
    return "That HubSpot authorization has expired. Please press Connect HubSpot again.";
  }
  if (error.startsWith("http_429")) {
    return "HubSpot is rate limiting MunchReach right now. Try again in a minute.";
  }
  if (error.startsWith("network:") || error.startsWith("http_5")) {
    return "HubSpot is temporarily unavailable. Try again in a few minutes.";
  }
  return "HubSpot refused the connection. Please try again.";
}

/* ------------------------------------------------------------ connection */

export async function loadHubSpotConnection(workspaceId: string): Promise<ConnectionRow | null> {
  const { data } = await supabaseAdmin
    .from("integration_connections")
    .select(
      "id, workspace_id, slug, status, account_label, config, error_message, last_synced_at, last_event_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("slug", HUBSPOT_SLUG)
    .maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

export async function saveHubSpotCredentials(
  connectionId: string,
  creds: HubSpotCredentials,
): Promise<void> {
  await storeCredentials(connectionId, creds as unknown as Record<string, string>);
}

export async function readHubSpotCredentials(
  connectionId: string,
): Promise<HubSpotCredentials | null> {
  const creds = await loadCredentials(connectionId);
  if (!creds || !creds["access_token"]) return null;
  return creds as unknown as HubSpotCredentials;
}

export async function markHubSpotNeedsReconnect(
  connectionId: string,
  message: string,
): Promise<void> {
  await supabaseAdmin
    .from("integration_connections")
    .update({ status: "error", error_message: message })
    .eq("id", connectionId);
}

/**
 * Returns a usable access token, refreshing it when it is close to expiry.
 * Legacy private-app-token connections have no refresh token: their token is
 * long-lived and returned unchanged so existing customers keep working until
 * they reconnect with OAuth.
 */
export async function accessTokenForConnection(
  connectionId: string,
): Promise<{ token: string | null; error: string }> {
  const creds = await readHubSpotCredentials(connectionId);
  if (!creds) {
    await markHubSpotNeedsReconnect(
      connectionId,
      hubspotErrorForCustomer("no_credentials"),
    );
    return { token: null, error: "no_credentials" };
  }
  if (!creds.refresh_token) return { token: creds.access_token, error: "" };

  const expiresAt = Date.parse(creds.expires_at ?? "");
  const fresh = Number.isFinite(expiresAt) && expiresAt - Date.now() > 120_000;
  if (fresh) return { token: creds.access_token, error: "" };

  const next = await refreshAccessToken(creds.refresh_token);
  if (!next.ok || !next.access_token) {
    await markHubSpotNeedsReconnect(connectionId, hubspotErrorForCustomer("refresh_failed"));
    return { token: null, error: "refresh_failed" };
  }
  const updated: HubSpotCredentials = {
    ...creds,
    access_token: next.access_token,
    refresh_token: next.refresh_token || creds.refresh_token,
    expires_at: new Date(Date.now() + (next.expires_in ?? 1800) * 1000).toISOString(),
  };
  await saveHubSpotCredentials(connectionId, updated);
  await supabaseAdmin
    .from("integration_connections")
    .update({ status: "connected", error_message: null })
    .eq("id", connectionId);
  return { token: updated.access_token, error: "" };
}

/**
 * Authenticated HubSpot API call for a stored connection. Refreshes the token
 * up front when needed and retries once after a 401, which is what an expired
 * access token looks like from HubSpot's side.
 */
export async function hubspotApiFetch(
  connectionId: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown; error: string }> {
  const first = await accessTokenForConnection(connectionId);
  if (!first.token) return { ok: false, status: 0, body: null, error: first.error };

  const call = async (token: string) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null);
    return { res, body };
  };

  try {
    let { res, body } = await call(first.token);
    if (res.status === 401) {
      const creds = await readHubSpotCredentials(connectionId);
      if (creds?.refresh_token) {
        const next = await refreshAccessToken(creds.refresh_token);
        if (next.ok && next.access_token) {
          await saveHubSpotCredentials(connectionId, {
            ...creds,
            access_token: next.access_token,
            refresh_token: next.refresh_token || creds.refresh_token,
            expires_at: new Date(Date.now() + (next.expires_in ?? 1800) * 1000).toISOString(),
          });
          ({ res, body } = await call(next.access_token));
        }
      }
    }
    if (res.status === 401 || res.status === 403) {
      await markHubSpotNeedsReconnect(
        connectionId,
        hubspotErrorForCustomer(`http_${res.status}`),
      );
    }
    return {
      ok: res.ok,
      status: res.status,
      body,
      error: res.ok ? "" : `http_${res.status}`,
    };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: `network:${(error as Error).message}` };
  }
}

/** The only verification MunchReach trusts: a live authenticated CRM read. */
export async function verifyContactsAccess(
  connectionId: string,
): Promise<{ ok: boolean; error: string }> {
  const res = await hubspotApiFetch(connectionId, "/crm/v3/objects/contacts?limit=1");
  return { ok: res.ok, error: res.error };
}

/** Same check, but for a token that is not stored yet (fresh from consent). */
export async function verifyContactsAccessWithToken(
  accessToken: string,
): Promise<{ ok: boolean; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/crm/v3/objects/contacts?limit=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, error: res.ok ? "" : `http_${res.status}` };
  } catch (error) {
    return { ok: false, error: `network:${(error as Error).message}` };
  }
}
