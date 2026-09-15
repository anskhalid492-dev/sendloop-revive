/**
 * Automatic reply-delivery webhook provisioning.
 *
 * Registering the webhook that carries delivery, bounce, open, click and
 * inbound-reply events used to be a manual admin action, so a freshly verified
 * domain could reach "ready" with nothing delivering its replies. This module
 * makes it an automatic step of verification.
 *
 * Rules it enforces:
 *  - idempotent: an existing webhook on MunchReach's inbound endpoint is
 *    confirmed, never duplicated
 *  - always authenticated: provider reads/writes use the stored infrastructure
 *    credential (a credential-less call returns 401 and used to be misreported
 *    as "no webhook registered")
 *  - honest: a failure after retries is recorded so the Webhooks card can show
 *    "Not ready" with the real provider reason instead of a half-configured
 *    domain looking fine
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyWebhookStatus, INBOUND_WEBHOOK_PATH } from "./webhook-status.server";
import type { EmailProviderCredentials } from "./types";

/** Provider-neutral event names; each adapter maps them to its own vocabulary. */
export const INBOUND_WEBHOOK_EVENTS = [
  "email.received",
  "email.delivered",
  "email.bounced",
  "email.opened",
  "email.clicked",
  "email.complained",
] as const;

export type WebhookProvisionResult = {
  state: "ok" | "failed" | "unsupported" | "skipped";
  detail: string;
  /** True when this run created the webhook (as opposed to confirming one). */
  created?: boolean;
};

const SETTINGS_KEY_PREFIX = "webhook_provision:";

/** Absolute base URL the provider must call back on. */
function baseUrl(): string {
  return (
    process.env["PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    process.env["VITE_APP_URL"] ||
    "https://munchreach.com"
  ).replace(/\/+$/, "");
}

/** Last automatic provisioning outcome for a provider, for the Webhooks card. */
export async function getWebhookProvisionState(
  providerId: string,
): Promise<{ state: string; detail: string; at: string | null } | null> {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value, updated_at")
    .eq("key", `${SETTINGS_KEY_PREFIX}${providerId}`)
    .maybeSingle();
  const value = (data?.value ?? null) as { state?: string; detail?: string } | null;
  if (!value?.state) return null;
  return { state: value.state, detail: value.detail ?? "", at: data?.updated_at ?? null };
}

async function recordState(providerId: string, result: WebhookProvisionResult, domain: string) {
  await supabaseAdmin.from("platform_settings").upsert(
    {
      key: `${SETTINGS_KEY_PREFIX}${providerId}`,
      value: {
        state: result.state,
        detail: result.detail,
        domain,
        at: new Date().toISOString(),
      } as never,
    },
    { onConflict: "key" },
  );
}

/**
 * Ensures the reply-delivery webhook exists for `providerId`, retrying a few
 * times before giving up. Safe to call on every verification pass.
 */
export async function ensureInboundWebhook(args: {
  providerId: string;
  credentials: EmailProviderCredentials;
  domain: string;
  attempts?: number;
}): Promise<WebhookProvisionResult> {
  const { providerId, credentials, domain } = args;
  const maxAttempts = Math.max(1, args.attempts ?? 3);

  const { getEmailProvider } = await import("./registry.server");
  let provider;
  try {
    provider = getEmailProvider(providerId);
  } catch {
    return { state: "skipped", detail: "Sending infrastructure is not available yet." };
  }
  if (!provider.capabilities.webhooks || !provider.listWebhooks || !provider.registerWebhook) {
    return { state: "unsupported", detail: "This provider does not deliver webhook events." };
  }

  const secret = process.env["INBOUND_EMAIL_SECRET"];
  if (!secret) {
    const result: WebhookProvisionResult = {
      state: "failed",
      detail: "The inbound webhook secret is not configured on the server.",
    };
    await recordState(providerId, result, domain);
    return result;
  }
  const endpoint = `${baseUrl()}${INBOUND_WEBHOOK_PATH}?token=${encodeURIComponent(secret)}`;

  let lastDetail = "Registration did not complete.";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // Idempotency: an entry already pointing at our inbound endpoint is
      // confirmed rather than replaced, so repeat verification passes are free.
      const entries = await provider.listWebhooks(credentials);
      const existing = entries.filter((e) => (e.endpoint ?? "").includes(INBOUND_WEBHOOK_PATH));
      if (existing.some((e) => classifyWebhookStatus(e.status ?? "") !== "disabled")) {
        const result: WebhookProvisionResult = {
          state: "ok",
          detail: "Reply and delivery events are connected.",
          created: false,
        };
        await recordState(providerId, result, domain);
        return result;
      }

      const registered = await provider.registerWebhook(
        credentials,
        endpoint,
        [...INBOUND_WEBHOOK_EVENTS],
      );
      if (registered.ok) {
        const result: WebhookProvisionResult = {
          state: "ok",
          detail: "Reply and delivery events are connected.",
          created: true,
        };
        await recordState(providerId, result, domain);
        return result;
      }
      lastDetail = registered.detail || lastDetail;
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : "Registration failed.";
    }
    if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
  }

  const result: WebhookProvisionResult = {
    state: "failed",
    detail: `Reply delivery could not be connected: ${lastDetail}`.slice(0, 500),
  };
  await recordState(providerId, result, domain);
  return result;
}
