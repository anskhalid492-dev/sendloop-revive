/**
 * Slack OAuth v2 + Web API client (server-only).
 *
 * Never import this from the browser: it reads the MunchReach Slack app secret
 * and handles per-customer bot tokens. Tokens are stored encrypted through the
 * shared `integration_secrets` helpers, exactly like every other provider
 * credential, and are never returned to the client.
 *
 * Scope choice: `incoming-webhook` only. Slack returns a channel-scoped webhook
 * URL the customer picked during consent, which keeps the existing MunchReach
 * Slack delivery path (webhook POST) working unchanged — no extra permission on
 * the customer's workspace than posting to the one channel they chose.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadCredentials, storeCredentials, type ConnectionRow } from "@/lib/integrations.server";

export const SLACK_SLUG = "slack";
const AUTH_BASE = "https://slack.com";
const API_BASE = "https://slack.com/api";

/** Minimum required for MunchReach's use case: post alerts to one channel. */
export const SLACK_SCOPES = ["incoming-webhook"] as const;

export type SlackCredentials = {
  /** Bot token (xoxb-…). Server-side only. */
  access_token: string;
  /** Channel webhook Slack issued during consent; used for delivery. */
  webhook_url: string;
  team_id: string;
  team_name: string;
  authed_user_id?: string;
  scope?: string;
};

export function slackAppCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env["SLACK_CLIENT_ID"];
  const clientSecret = process.env["SLACK_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function slackRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/integrations/slack/callback`;
}

export function slackAuthorizeUrl(origin: string, state: string): string {
  const app = slackAppCredentials();
  if (!app) throw new Error("Slack is not configured on this deployment.");
  const url = new URL(`${AUTH_BASE}/oauth/v2/authorize`);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("scope", SLACK_SCOPES.join(","));
  url.searchParams.set("redirect_uri", slackRedirectUri(origin));
  url.searchParams.set("state", state);
  return url.toString();
}

/* ------------------------------------------------------------ signed state */

function stateKey(): Buffer {
  const raw = process.env["PROVIDER_CREDENTIALS_KEY"];
  if (!raw) throw new Error("PROVIDER_CREDENTIALS_KEY is not set");
  return createHmac("sha256", raw).update("slack-oauth-state").digest();
}

export type SlackStatePayload = {
  workspaceId: string;
  userId: string;
  nonce: string;
  exp: number;
};

export function newStateNonce(): string {
  return randomBytes(18).toString("hex");
}

export function signState(payload: SlackStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(raw: string): SlackStatePayload | null {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateKey()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SlackStatePayload;
    if (!payload.workspaceId || !payload.nonce || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ token calls */

export type SlackOAuthResult = {
  ok: boolean;
  /** Slack's machine error code — internal logging only. */
  error: string;
  access_token?: string;
  scope?: string;
  team?: { id?: string; name?: string };
  authed_user?: { id?: string };
  incoming_webhook?: { url?: string; channel?: string; channel_id?: string };
};

/** Exchanges the one-time code for a bot token. Slack answers 200 + ok:false. */
export async function exchangeCode(code: string, origin: string): Promise<SlackOAuthResult> {
  const app = slackAppCredentials();
  if (!app) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(`${API_BASE}/oauth.v2.access`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        code,
        redirect_uri: slackRedirectUri(origin),
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as SlackOAuthResult | null;
    if (!body) return { ok: false, error: `http_${res.status}` };
    return { ...body, ok: Boolean(body.ok), error: body.ok ? "" : String(body.error ?? "unknown") };
  } catch (error) {
    return { ok: false, error: `network:${(error as Error).message}` };
  }
}

export type SlackAuthTest = {
  ok: boolean;
  error: string;
  team?: string;
  team_id?: string;
  user?: string;
  user_id?: string;
  url?: string;
};

/** The only verification MunchReach trusts: a live authenticated auth.test. */
export async function slackAuthTest(accessToken: string): Promise<SlackAuthTest> {
  try {
    const res = await fetch(`${API_BASE}/auth.test`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as SlackAuthTest | null;
    if (!body) return { ok: false, error: `http_${res.status}` };
    return { ...body, ok: Boolean(body.ok), error: body.ok ? "" : String(body.error ?? "unknown") };
  } catch (error) {
    return { ok: false, error: `network:${(error as Error).message}` };
  }
}

/** Revokes the customer's bot token at Slack. Best effort. */
export async function revokeToken(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth.revoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return Boolean(body?.ok);
  } catch {
    return false;
  }
}

/** Plain-language reason a customer can act on, from Slack's error code. */
export function slackErrorForCustomer(error: string): string {
  switch (error) {
    case "not_configured":
      return "Slack sign-in is not available on this environment yet.";
    case "invalid_code":
    case "code_already_used":
    case "bad_client_secret":
      return "That Slack authorization has expired. Please press Connect Slack again.";
    case "invalid_auth":
    case "not_authed":
    case "token_revoked":
    case "account_inactive":
      return "Slack no longer accepts this connection. Use Reconnect to sign in again.";
    case "missing_scope":
      return "Slack did not grant the permission MunchReach needs. Reconnect and approve access.";
    case "ratelimited":
      return "Slack is rate limiting MunchReach right now. Try again in a minute.";
    default:
      if (error.startsWith("network:") || error.startsWith("http_5"))
        return "Slack is temporarily unavailable. Try again in a few minutes.";
      return "Slack refused the connection. Please try again.";
  }
}

/* ------------------------------------------------------------ connection */

export async function loadSlackConnection(workspaceId: string): Promise<ConnectionRow | null> {
  const { data } = await supabaseAdmin
    .from("integration_connections")
    .select(
      "id, workspace_id, slug, status, account_label, config, error_message, last_synced_at, last_event_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("slug", SLACK_SLUG)
    .maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

export async function saveSlackCredentials(
  connectionId: string,
  creds: SlackCredentials,
): Promise<void> {
  await storeCredentials(connectionId, creds as unknown as Record<string, string>);
}

export async function readSlackCredentials(
  connectionId: string,
): Promise<SlackCredentials | null> {
  const creds = await loadCredentials(connectionId);
  if (!creds || !creds["access_token"]) return null;
  return creds as unknown as SlackCredentials;
}

export async function markSlackNeedsReconnect(
  connectionId: string,
  message: string,
): Promise<void> {
  await supabaseAdmin
    .from("integration_connections")
    .update({ status: "error", error_message: message })
    .eq("id", connectionId);
}
