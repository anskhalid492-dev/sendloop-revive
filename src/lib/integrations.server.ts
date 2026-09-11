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
  const text = (await res.text()).slice(0, 200);
  return { ok: false, message: `Destination responded ${res.status}: ${text}` };
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
): Promise<{ ok: boolean; message: string }> {
  const lead = (payload["lead"] ?? {}) as Record<string, string | undefined>;
  const email = lead["email"];
  if (!email) return { ok: false, message: "Event has no lead email to sync." };

  if (slug === "hubspot") {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials["access_token"] ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          email,
          firstname: lead["first_name"] ?? "",
          lastname: lead["last_name"] ?? "",
          company: lead["company"] ?? "",
        },
      }),
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

  let result: { ok: boolean; message: string };
  try {
    const webhookUrl = credentials["webhook_url"];
    result = webhookUrl
      ? await deliverToWebhook(connection.slug, webhookUrl, { event: eventType, ...payload })
      : await deliverToCrm(connection.slug, credentials, payload);
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

  await supabaseAdmin
    .from("integration_connections")
    .update({
      last_event_at: new Date().toISOString(),
      status: result.ok ? "connected" : "error",
      error_message: result.ok ? null : result.message,
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
