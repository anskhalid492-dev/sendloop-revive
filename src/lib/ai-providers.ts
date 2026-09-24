/**
 * Client-safe catalogue of the AI providers a workspace can connect for
 * campaign personalization (ChatGPT via OpenAI, and Claude via Anthropic).
 *
 * There is deliberately NO model list here. The models a customer can pick are
 * whatever the provider's own Models API returns for that customer's key
 * (see `ai-models.server.ts`), and the exact id they pick is what we call.
 * Credentials are never part of this module — they are encrypted server-side.
 *
 * Only AI text providers belong here. Email-sending providers (Resend, SES,
 * SendGrid, Mailgun, …) must never appear in the AI selector.
 */

export type AiProviderId = "openai" | "anthropic";

export const AI_PROVIDER_IDS: readonly AiProviderId[] = ["openai", "anthropic"] as const;

export type AiProviderMeta = {
  id: AiProviderId;
  /** Product name shown to customers. */
  label: string;
  /** Company behind the product. */
  vendor: string;
  /** Integrations-tab slug that holds this provider's key. */
  integrationSlug: string;
  keyLabel: string;
  keyPlaceholder: string;
  /** Shape check mirrored server-side, so button state matches the outcome. */
  keyPattern: RegExp;
  keyHint: string;
  keysUrl: string;
};

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: "openai",
    label: "ChatGPT",
    vendor: "OpenAI",
    integrationSlug: "openai",
    keyLabel: "OpenAI API key",
    keyPlaceholder: "sk-...",
    keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    keyHint: "Keys start with “sk-”.",
    keysUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Claude",
    vendor: "Anthropic",
    integrationSlug: "claude",
    keyLabel: "Anthropic API key",
    keyPlaceholder: "sk-ant-...",
    keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    keyHint: "Keys start with “sk-ant-”.",
    keysUrl: "https://console.anthropic.com/settings/keys",
  },
];

export const AI_PROVIDERS_BY_ID: Record<string, AiProviderMeta> = Object.fromEntries(
  AI_PROVIDERS.map((p) => [p.id, p]),
);

export function isAiProviderId(value: unknown): value is AiProviderId {
  return value === "openai" || value === "anthropic";
}

export function aiProvider(id: string | null | undefined): AiProviderMeta {
  return AI_PROVIDERS_BY_ID[id ?? ""] ?? AI_PROVIDERS[0]!;
}

/** Provider name for UI copy, e.g. "Claude". */
export function aiProviderLabel(id: string | null | undefined): string {
  return aiProvider(id).label;
}

/** Map an Integrations-tab slug to its AI provider (null for non-AI slugs). */
export function aiProviderForSlug(slug: string | null | undefined): AiProviderId | null {
  return AI_PROVIDERS.find((p) => p.integrationSlug === slug)?.id ?? null;
}

/**
 * Normalise a stored model id WITHOUT substituting anything: returns the exact
 * trimmed id, or "" when nothing is selected. A missing or unavailable model is
 * surfaced as an error to the customer — never silently swapped for another.
 */
export function resolveAiModel(model?: string | null): string {
  return (model ?? "").trim();
}

/** One model as returned by the provider's Models API for a customer's key. */
export type AiModelInfo = {
  id: string;
  displayName: string;
  createdAt: string | null;
  ownedBy: string | null;
  /** Only present when the provider returns them — never guessed. */
  contextWindow: number | null;
  maxOutputTokens: number | null;
  capabilities: string[];
};

export type AiModelListResult =
  | {
      ok: true;
      provider: AiProviderId;
      models: AiModelInfo[];
      /** Returned by the provider but not text-generation models (embeddings, audio…). */
      hiddenCount: number;
      selectedModel: string;
      /** False when the saved model is not in the list the key returned today. */
      selectedAvailable: boolean;
      fetchedAt: string;
    }
  | {
      ok: false;
      provider: AiProviderId;
      reason: "not_connected" | "invalid_key" | "forbidden" | "unreachable" | "restricted";
      message: string;
      selectedModel: string;
    };
