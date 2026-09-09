/**
 * Client-safe catalogue of the AI providers a workspace can connect for
 * campaign personalization.
 *
 * Model ids live here (and only here) so the personalization feature never
 * hard-codes a model: changing the list changes every generation path at once.
 * Credentials are never part of this module — they are encrypted server-side.
 */

export type AiProviderId = "openai" | "anthropic";

export type AiModelOption = { value: string; label: string };

export type AiProviderMeta = {
  id: AiProviderId;
  /** Product name shown to customers. */
  label: string;
  /** Company behind the product. */
  vendor: string;
  keyLabel: string;
  keyPlaceholder: string;
  /** Shape check mirrored server-side, so button state matches the outcome. */
  keyPattern: RegExp;
  keyHint: string;
  keysUrl: string;
  defaultModel: string;
  models: AiModelOption[];
};

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: "openai",
    label: "OpenAI",
    vendor: "OpenAI",
    keyLabel: "OpenAI API key",
    keyPlaceholder: "sk-...",
    keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    keyHint: "Keys start with “sk-”.",
    keysUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o mini — fastest, lowest cost" },
      { value: "gpt-4o", label: "GPT-4o — highest quality" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 mini — balanced" },
      { value: "gpt-4.1", label: "GPT-4.1 — long instructions" },
    ],
  },
  {
    id: "anthropic",
    label: "Claude",
    vendor: "Anthropic",
    keyLabel: "Anthropic API key",
    keyPlaceholder: "sk-ant-...",
    keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    keyHint: "Keys start with “sk-ant-”.",
    keysUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-haiku-4-5",
    models: [
      { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 — fastest, lowest cost" },
      { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 — balanced quality" },
      { value: "claude-opus-4-1", label: "Claude Opus 4.1 — highest quality" },
    ],
  },
];

export const AI_PROVIDERS_BY_ID: Record<string, AiProviderMeta> = Object.fromEntries(
  AI_PROVIDERS.map((p) => [p.id, p]),
);

export function aiProvider(id: string | null | undefined): AiProviderMeta {
  return AI_PROVIDERS_BY_ID[id ?? ""] ?? AI_PROVIDERS[0]!;
}

/** Provider name for UI copy, e.g. "Claude". */
export function aiProviderLabel(id: string | null | undefined): string {
  return aiProvider(id).label;
}

/** Keep a stored model valid for its provider — never send a foreign model id. */
export function resolveAiModel(providerId: string | null | undefined, model?: string | null): string {
  const meta = aiProvider(providerId);
  const wanted = (model ?? "").trim();
  return meta.models.some((m) => m.value === wanted) ? wanted : meta.defaultModel;
}
