/**
 * Client-safe types for the MunchReach-owned AI provider used ONLY by the
 * AI Sales Agent. Never contains credentials.
 */
export const SALES_AGENT_AI_PROVIDERS = ["openai", "anthropic"] as const;
export type SalesAgentAiProvider = (typeof SALES_AGENT_AI_PROVIDERS)[number];

export const SALES_AGENT_PROVIDER_LABEL: Record<SalesAgentAiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

/** Placeholder suggestions only — the model field is always free text. */
export const SALES_AGENT_MODEL_PLACEHOLDER: Record<SalesAgentAiProvider, string> = {
  openai: "e.g. gpt-4o-mini",
  anthropic: "e.g. claude-3-5-haiku-latest",
};

export type SalesAgentProviderStatus = "not_configured" | "configured" | "test_ok" | "test_failed";

/** The only shape ever returned to the browser. `hasKey` replaces the key. */
export type SalesAgentProviderView = {
  provider: SalesAgentAiProvider | null;
  model: string;
  hasKey: boolean;
  maskedKey: string | null;
  status: SalesAgentProviderStatus;
  lastTestedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

export const MASKED_KEY = "••••••••••••••••";

export function isModelId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:\-/@]{0,119}$/.test(value);
}
