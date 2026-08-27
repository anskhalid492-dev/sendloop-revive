/**
 * Provider-neutral webhook readiness.
 *
 * The customer readiness panel must report whether the *selected email
 * provider* actually has an enabled webhook pointing at MunchReach's inbound
 * endpoint — not a stale platform-wide health cache.
 *
 * All provider specifics stay inside the adapter: this module only reads the
 * normalized `UnifiedWebhookEntry[]` that `EmailProvider.listWebhooks` returns.
 * It never registers, edits or deletes anything.
 */
import type { EmailProviderCredentials, UnifiedWebhookEntry } from "./types";

/** MunchReach's inbound endpoint path; the query string may carry a token. */
export const INBOUND_WEBHOOK_PATH = "/api/public/inbound/email";

export type ProviderWebhookState = "ok" | "failed" | "pending" | "unsupported";

export type ProviderWebhookReadiness = {
  state: ProviderWebhookState;
  detail: string;
};

const ENABLED = new Set(["enabled", "active", "live", "on", "ok", "verified"]);
const DISABLED = new Set(["disabled", "inactive", "paused", "off", "failed", "error"]);

/** Normalized classification of one provider webhook entry's status string. */
export function classifyWebhookStatus(status: string): "enabled" | "disabled" | "unknown" {
  const value = status.trim().toLowerCase();
  if (!value) return "unknown";
  if (ENABLED.has(value)) return "enabled";
  if (DISABLED.has(value)) return "disabled";
  return "unknown";
}

/** Pure evaluation of a provider's webhook inventory. Exported for tests. */
export function evaluateWebhookEntries(
  entries: UnifiedWebhookEntry[],
): ProviderWebhookReadiness {
  const matches = entries.filter((entry) =>
    (entry.endpoint ?? "").includes(INBOUND_WEBHOOK_PATH),
  );
  if (matches.length === 0) {
    return {
      state: "failed",
      detail: "No webhook is registered for reply delivery.",
    };
  }
  const classified = matches.map((m) => classifyWebhookStatus(m.status ?? ""));
  if (classified.includes("enabled")) {
    return { state: "ok", detail: "Reply and delivery events are connected." };
  }
  if (classified.every((c) => c === "disabled")) {
    return {
      state: "failed",
      detail: "The reply delivery webhook is registered but disabled.",
    };
  }
  return {
    state: "pending",
    detail: "The reply delivery webhook status could not be confirmed.",
  };
}

/**
 * Asks the selected provider for its real webhook status.
 *
 * - supports webhooks + enabled endpoint  -> ok
 * - supports webhooks + missing/disabled  -> failed
 * - status cannot be read                 -> pending
 * - provider has no webhook capability    -> unsupported
 */
export async function getProviderWebhookReadiness(
  providerId: string,
  creds: EmailProviderCredentials = {},
): Promise<ProviderWebhookReadiness> {
  const { getEmailProvider } = await import("./registry.server");
  let provider;
  try {
    provider = getEmailProvider(providerId);
  } catch {
    return { state: "pending", detail: "Reply delivery status is not available yet." };
  }

  if (!provider.capabilities.webhooks) {
    return { state: "unsupported", detail: "This provider does not deliver webhook events." };
  }
  if (!provider.listWebhooks) {
    return { state: "pending", detail: "Reply delivery status is not available yet." };
  }

  try {
    const entries = await provider.listWebhooks(creds);
    return evaluateWebhookEntries(entries);
  } catch {
    return { state: "pending", detail: "Reply delivery status could not be checked just now." };
  }
}
