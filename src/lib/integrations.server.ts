/**
 * Server-only engine behind the integrations system.
 *
 * Responsibilities:
 *  - authorise the caller against the workspace (membership + role),
 *  - encrypt/decrypt third-party credentials,
 *  - verify credentials with a live call to the provider,
 *  - deliver MunchReach events to connected destinations and log every attempt.
 *
 * Credentials are never returned to the browser — only a masked hint.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptCredentials, encryptCredentials } from "@/lib/provider-credentials.server";
import { INTEGRATIONS_BY_SLUG } from "@/lib/integrations-catalog";
import { safeFetch } from "@/lib/ssrf-guard.server";

export type Credentials = Record<string, string>;

export type ConnectionRow = {
  id: string;
  workspace_id: string;
  slug: string;
  status: string;
  account_label: string | null;
  config: Record<string, unknown>;
  error_message: string | null;
  last_synced_at: string | null;
  last_event_at: string | null;
};

const WRITE_ROLES = new Set(["owner", "admin"]);

/** Throws unless the user is a member; returns their workspace role. */
export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  write: boolean,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("You do not have access to this workspace.");
  const role = String((data as { role: string }).role);
  if (write && !WRITE_ROLES.has(role)) {
    throw new Error("Only workspace owners and admins can change integrations.");
  }
  return role;
}

/** Paid-plan gate for integrations flagged `requires_paid_plan`. */
export async function workspaceHasPaidPlan(workspaceId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("workspace_subscriptions")
    .select("status, plans:plan_id(slug)")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return false;
  const row = data as unknown as { status: string; plans: { slug: string } | null };
  if (!["active", "trialing", "past_due"].includes(row.status)) return false;
  const slug = row.plans?.slug ?? "free";
  return slug !== "free";
}

export function maskSecret(value: string): string {
  if (value.length <= 6) return "••••";
  return `••••${value.slice(-4)}`;
}

export async function storeCredentials(connectionId: string, credentials: Credentials) {
  const { error } = await supabaseAdmin.from("integration_secrets").upsert(
    {
      connection_id: connectionId,
      credentials_ciphertext: encryptCredentials(credentials),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );
  if (error) throw new Error(error.message);
}

export async function loadCredentials(connectionId: string): Promise<Credentials | null> {
  const { data } = await supabaseAdmin
    .from("integration_secrets")
    .select("credentials_ciphertext")
    .eq("connection_id", connectionId)
    .maybeSingle();
  const ciphertext = (data as { credentials_ciphertext?: string } | null)?.credentials_ciphertext;
  if (!ciphertext) return null;
  try {
    return decryptCredentials<Credentials>(ciphertext);
  } catch {
    return null;
  }
}

export type VerifyResult = { ok: boolean; message: string; accountLabel?: string };

async function head(url: string, headers: Record<string, string>): Promise<VerifyResult> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (res.ok) return { ok: true, message: "Connection verified." };
  return {
    ok: false,
    message: `The provider rejected the credentials (${res.status}). Check the value and try again.`,
  };
}

function isHttpsUrl(value: string, hostSuffix?: string[]) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (!hostSuffix) return true;
    return hostSuffix.some((s) => url.hostname === s || url.hostname.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

/** Live credential check — no integration is ever stored as "connected" blind. */
export async function verifyIntegration(
  slug: string,
  credentials: Credentials,
): Promise<VerifyResult> {
  try {
    switch (slug) {
      case "openai": {
        const res = await head("https://api.openai.com/v1/models", {
          Authorization: `Bearer ${credentials["api_key"] ?? ""}`,
        });
        return res.ok ? { ...res, accountLabel: "OpenAI account" } : res;
      }
      case "claude": {
        // Anthropic Messages API auth headers (docs.anthropic.com/en/api).
        const res = await head("https://api.anthropic.com/v1/models?limit=1", {
          "x-api-key": credentials["api_key"] ?? "",
          "anthropic-version": "2023-06-01",
        });
        return res.ok ? { ...res, accountLabel: "Anthropic account" } : res;
      }
      case "hubspot": {
        const token = credentials["access_token"] ?? "";
        const res = await head(
          "https://api.hubapi.com/crm/v3/objects/contacts?limit=1",
          { Authorization: `Bearer ${token}` },
        );
        return res.ok ? { ...res, accountLabel: "HubSpot portal" } : res;
      }
      case "calendly": {
        const token = credentials["access_token"] ?? "";
        const response = await fetch("https://api.calendly.com/users/me", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          return { ok: false, message: `Calendly rejected the token (${response.status}).` };
        }
        const body = (await response.json()) as { resource?: { email?: string } };
        const email = body.resource?.email;
        return email
          ? { ok: true, message: "Connection verified.", accountLabel: email }
          : { ok: true, message: "Connection verified." };
      }
      case "gohighlevel": {
        const key = credentials["api_key"] ?? "";
        const res = await fetch("https://rest.gohighlevel.com/v1/contacts/?limit=1", {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { ok: true, message: "Connection verified.", accountLabel: "GoHighLevel location" };
        return { ok: false, message: `GoHighLevel rejected the API key (${res.status}).` };
      }
      case "slack":
      case "zapier":
      case "make":
      case "google-sheets": {
        const url = credentials["webhook_url"] ?? "";
        const allowed: Record<string, string[]> = {
          slack: ["slack.com"],
          zapier: ["zapier.com"],
          make: ["make.com", "integromat.com"],
          "google-sheets": ["google.com"],
        };
        if (!isHttpsUrl(url, allowed[slug])) {
          return { ok: false, message: "That does not look like a valid webhook URL for this service." };
        }
        const result = await deliverToWebhook(slug, url, {
          event: "integration.connected",
          source: "sendloop",
          message: "MunchReach connection test — you can ignore this message.",
          timestamp: new Date().toISOString(),
        });
        return result.ok
          ? { ok: true, message: "Test payload delivered.", accountLabel: new URL(url).hostname }
          : { ok: false, message: result.message };
      }
      default:
        return { ok: false, message: "Unknown integration." };
    }
  } catch (error) {
    return {
      ok: false,
      message: `Could not reach the provider: ${(error as Error).message}`,
    };
  }
}

async function deliverToWebhook(
  slug: string,
  url: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  const body =
    slug === "slack"
      ? JSON.stringify({ text: slackText(payload) })
      : JSON.stringify(payload);
  const res = await safeFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return { ok: true, message: "Delivered." };
  return { ok: false, message: `Destination responded ${res.status}: ${describeBody(await res.text())}` };
}

/**
 * Turns a destination's response body into one readable line.
 *
 * Some destinations answer with a whole HTML page instead of an API error — a
 * Google Apps Script whose deployment needs re-authorising answers with the
 * Google sign-in page, for example. Storing 200 characters of markup told the
 * customer nothing, so HTML is summarised instead of pasted.
 */
export function describeBody(body: string): string {
  const text = (body ?? "").trim();
  if (!text) return "no response body.";
  if (/^<(!doctype|html)/i.test(text) || /<html[\s>]/i.test(text.slice(0, 400))) {
    const title = /<title[^>]*>([^<]{1,120})<\/title>/i.exec(text)?.[1]?.trim();
    return title
      ? `the destination returned a web page ("${title}") instead of an API response, which usually means the link now needs signing in again.`
      : "the destination returned a web page instead of an API response, which usually means the link now needs signing in again.";
  }
  return text.replace(/\s+/g, " ").slice(0, 200);
}

/**
 * Retry policy for outbound destinations.
 *
 * A failing destination used to be hit again on the very next event, which for a
 * busy workspace meant several attempts a second — enough to make a provider's
 * own queue overflow. Instead each consecutive failure puts the connection in a
 * cooldown of 1 minute, then 5, then 30; if it still fails after that the
 * connection is marked as needing attention and nothing more is sent to it until
 * the customer reconnects or retests it.
 */
const RETRY_COOLDOWNS_MS = [60_000, 5 * 60_000, 30 * 60_000];

type DeliveryHealth = { failures: number; retryAfter: string | null; needsAttention: boolean };

export function readDeliveryHealth(config: Record<string, unknown> | null): DeliveryHealth {
  const raw = (config?.["delivery_health"] ?? null) as Record<string, unknown> | null;
  const failures = Number(raw?.["failures"] ?? 0);
  return {
    failures: Number.isFinite(failures) && failures > 0 ? Math.floor(failures) : 0,
    retryAfter: typeof raw?.["retry_after"] === "string" ? (raw["retry_after"] as string) : null,
    needsAttention: raw?.["needs_attention"] === true,
  };
}

/** What should happen with this delivery right now. */
export function deliveryGate(
  health: DeliveryHealth,
  now = Date.now(),
): { send: true } | { send: false; message: string } {
  if (health.needsAttention) {
    return {
      send: false,
      message:
        "Delivery is paused after repeated failures. Fix the destination, then reconnect or test this integration to resume.",
    };
  }
  if (health.retryAfter) {
    const due = Date.parse(health.retryAfter);
    if (Number.isFinite(due) && due > now) {
      const minutes = Math.max(1, Math.round((due - now) / 60_000));
      return {
        send: false,
        message: `Skipped while the destination is in a ${minutes}-minute cooldown after an earlier failure.`,
      };
    }
  }
  return { send: true };
}

/** The health record to store after an attempt. */
export function nextDeliveryHealth(
  health: DeliveryHealth,
  succeeded: boolean,
  now = Date.now(),
): DeliveryHealth {
  if (succeeded) return { failures: 0, retryAfter: null, needsAttention: false };
  const failures = health.failures + 1;
  const cooldown = RETRY_COOLDOWNS_MS[failures - 1];
  return {
    failures,
    retryAfter: cooldown ? new Date(now + cooldown).toISOString() : null,
    needsAttention: cooldown === undefined,
  };
}

function slackText(payload: Record<string, unknown>) {
  const event = String(payload["event"] ?? "sendloop.event");
  const detail = payload["message"] ?? payload["summary"] ?? "";
  return `*MunchReach* — \`${event}\`\n${String(detail)}`;
}

async function deliverToCrm(
  slug: string,
  credentials: Credentials,
  payload: Record<string, unknown>,
  connectionId?: string,
): Promise<{ ok: boolean; message: string }> {
  const lead = (payload["lead"] ?? {}) as Record<string, string | undefined>;
  const email = lead["email"];
  if (!email) return { ok: false, message: "Event has no lead email to sync." };

  if (slug === "hubspot") {
    const body = JSON.stringify({
      properties: {
        email,
        firstname: lead["first_name"] ?? "",
        lastname: lead["last_name"] ?? "",
        company: lead["company"] ?? "",
      },
    });
    // OAuth connections go through the shared client, which refreshes the
    // short-lived access token and retries once. Legacy private-app tokens are
    // returned unchanged by that same client, so both keep working.
    if (connectionId) {
      const { hubspotApiFetch, hubspotErrorForCustomer } = await import("@/lib/hubspot.server");
      const res = await hubspotApiFetch(connectionId, "/crm/v3/objects/contacts", {
        method: "POST",
        body,
      });
      if (res.ok) return { ok: true, message: "Contact created in HubSpot." };
      if (res.status === 409) return { ok: true, message: "Contact already exists in HubSpot." };
      return { ok: false, message: hubspotErrorForCustomer(res.error) };
    }
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials["access_token"] ?? ""}`,
        "content-type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, message: "Contact created in HubSpot." };
    if (res.status === 409) return { ok: true, message: "Contact already exists in HubSpot." };
    return { ok: false, message: `HubSpot responded ${res.status}.` };
  }

  if (slug === "gohighlevel") {
    const res = await fetch("https://rest.gohighlevel.com/v1/contacts/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials["api_key"] ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        firstName: lead["first_name"] ?? "",
        lastName: lead["last_name"] ?? "",
        companyName: lead["company"] ?? "",
        tags: ["sendloop"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, message: "Contact created in GoHighLevel." };
    return { ok: false, message: `GoHighLevel responded ${res.status}.` };
  }

  return { ok: false, message: "This integration does not receive events." };
}

/** Sends one payload to one connection and writes the attempt to the log. */
export async function deliverEvent(
  connection: ConnectionRow,
  eventType: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<{ ok: boolean; message: string }> {
  const credentials = await loadCredentials(connection.id);
  if (!credentials) {
    return { ok: false, message: "Stored credentials could not be read. Reconnect the integration." };
  }

  // A destination that just failed is left alone until its cooldown lapses, so a
  // burst of events can never turn into a burst of retries.
  const health = readDeliveryHealth(connection.config);
  const gate = deliveryGate(health);
  if (!gate.send) {
    await supabaseAdmin.from("integration_events").insert({
      workspace_id: connection.workspace_id,
      connection_id: connection.id,
      slug: connection.slug,
      direction: "outbound",
      event_type: eventType,
      status: "skipped",
      message: gate.message,
      payload: payload as never,
      idempotency_key: idempotencyKey ?? null,
    });
    return { ok: false, message: gate.message };
  }

  let result: { ok: boolean; message: string };
  try {
    const webhookUrl = credentials["webhook_url"];
    result = webhookUrl
      ? await deliverToWebhook(connection.slug, webhookUrl, { event: eventType, ...payload })
      : await deliverToCrm(connection.slug, credentials, payload, connection.id);
  } catch (error) {
    result = { ok: false, message: (error as Error).message };
  }

  await supabaseAdmin.from("integration_events").insert({
    workspace_id: connection.workspace_id,
    connection_id: connection.id,
    slug: connection.slug,
    direction: "outbound",
    event_type: eventType,
    status: result.ok ? "success" : "failed",
    message: result.message,
    payload: payload as never,
    idempotency_key: idempotencyKey ?? null,
  });

  const nextHealth = nextDeliveryHealth(health, result.ok);
  await supabaseAdmin
    .from("integration_connections")
    .update({
      last_event_at: new Date().toISOString(),
      status: result.ok ? "connected" : "error",
      error_message: result.ok
        ? null
        : nextHealth.needsAttention
          ? `${result.message} Delivery is paused until you reconnect or test this integration.`
          : result.message,
      config: {
        ...(connection.config ?? {}),
        delivery_health: {
          failures: nextHealth.failures,
          retry_after: nextHealth.retryAfter,
          needs_attention: nextHealth.needsAttention,
        },
      } as never,
    })
    .eq("id", connection.id);

  return result;
}

/**
 * Fan-out helper: call this from any MunchReach flow (reply received, campaign
 * completed, meeting booked...) to notify every subscribed connection.
 */
export async function emitIntegrationEvent(
  workspaceId: string,
  eventType: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const { data } = await supabaseAdmin
    .from("integration_connections")
    .select("id, workspace_id, slug, status, account_label, config, error_message, last_synced_at, last_event_at")
    .eq("workspace_id", workspaceId)
    .neq("status", "disabled");
  const connections = (data ?? []) as ConnectionRow[];

  await Promise.all(
    connections
      .filter((c) => {
        const meta = INTEGRATIONS_BY_SLUG[c.slug];
        if (!meta || meta.events.length === 0) return false;
        const selected = (c.config?.["events"] as string[] | undefined) ?? meta.events;
        return selected.includes(eventType);
      })
      .map((c) =>
        deliverEvent(c, eventType, payload, idempotencyKey ? `${idempotencyKey}:${c.id}` : undefined).catch(
          () => undefined,
        ),
      ),
  );
}
