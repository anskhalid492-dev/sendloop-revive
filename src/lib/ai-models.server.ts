/**
 * Live model discovery against the customer's own AI provider account.
 *
 *  - OpenAI:    GET https://api.openai.com/v1/models      (Bearer <key>)
 *  - Anthropic: GET https://api.anthropic.com/v1/models   (x-api-key, paginated)
 *
 * Nothing here is hard-coded: the list is exactly what the provider returns
 * for that key, so new models appear the moment the provider ships them and
 * models the key cannot use never show up. Raw provider error bodies never leave
 * this module — callers get a short, customer-safe message.
 */
import { aiProvider, type AiModelInfo, type AiProviderId } from "@/lib/ai-providers";

export type ModelFetchResult =
  | { ok: true; models: AiModelInfo[]; hiddenCount: number }
  | { ok: false; reason: "invalid_key" | "forbidden" | "unreachable"; message: string };

type FetchLike = typeof fetch;

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_PAGES = 20;

/**
 * OpenAI's Models API returns every model the key can reach, including
 * embeddings, speech and image models that cannot write an email. Those are
 * filtered out by family (not by name list) so the picker only offers models
 * that can generate text. The count of hidden entries is reported to the UI.
 */
const NON_TEXT_OPENAI = /(embedding|whisper|tts|dall-e|moderation|transcribe|realtime|audio|image|sora|search|^davinci|^babbage)/i;

export function isTextGenerationModel(provider: AiProviderId, id: string): boolean {
  if (provider === "anthropic") return true; // Anthropic only lists Claude text models.
  return !NON_TEXT_OPENAI.test(id);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function capabilityList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (value && typeof value === "object") {
    // Anthropic reports capabilities as { name: { supported: boolean } | boolean }.
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) =>
        typeof v === "boolean" ? v : Boolean((v as { supported?: unknown })?.supported),
      )
      .map(([k]) => k);
  }
  return [];
}

function failureFor(provider: AiProviderId, status: number): ModelFetchResult {
  const vendor = aiProvider(provider).vendor;
  if (status === 401)
    return {
      ok: false,
      reason: "invalid_key",
      message: `${vendor} rejected this API key. It may be invalid or revoked — reconnect a valid key.`,
    };
  if (status === 403)
    return {
      ok: false,
      reason: "forbidden",
      message: `${vendor} blocked model access for this API key. Check the key's permissions in ${vendor}.`,
    };
  return {
    ok: false,
    reason: "unreachable",
    message: `Couldn't load models from ${vendor} right now. Please try Refresh models again.`,
  };
}

export function mapOpenAiModel(raw: Record<string, unknown>): AiModelInfo | null {
  const id = typeof raw["id"] === "string" ? raw["id"] : "";
  if (!id) return null;
  const created = num(raw["created"]);
  return {
    id,
    displayName: id,
    createdAt: created ? new Date(created * 1000).toISOString() : null,
    ownedBy: typeof raw["owned_by"] === "string" ? raw["owned_by"] : null,
    contextWindow: num(raw["context_window"]),
    maxOutputTokens: num(raw["max_output_tokens"]),
    capabilities: capabilityList(raw["capabilities"]),
  };
}

export function mapAnthropicModel(raw: Record<string, unknown>): AiModelInfo | null {
  const id = typeof raw["id"] === "string" ? raw["id"] : "";
  if (!id) return null;
  return {
    id,
    displayName:
      typeof raw["display_name"] === "string" && raw["display_name"] ? raw["display_name"] : id,
    createdAt: typeof raw["created_at"] === "string" ? raw["created_at"] : null,
    ownedBy: "anthropic",
    contextWindow: num(raw["max_input_tokens"]) ?? num(raw["context_window"]),
    maxOutputTokens: num(raw["max_tokens"]) ?? num(raw["max_output_tokens"]),
    capabilities: capabilityList(raw["capabilities"]),
  };
}

function sortModels(models: AiModelInfo[]): AiModelInfo[] {
  return [...models].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta || a.id.localeCompare(b.id);
  });
}

/** Fetch every model the customer's key can use, straight from the provider. */
export async function fetchProviderModels(
  provider: AiProviderId,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<ModelFetchResult> {
  const key = apiKey.trim();
  if (!key) return failureFor(provider, 401);
  try {
    const all: AiModelInfo[] = [];
    if (provider === "openai") {
      const res = await fetchImpl("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return failureFor(provider, res.status);
      const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
      for (const raw of body.data ?? []) {
        const m = mapOpenAiModel(raw);
        if (m) all.push(m);
      }
    } else {
      let after: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL("https://api.anthropic.com/v1/models");
        url.searchParams.set("limit", "1000");
        if (after) url.searchParams.set("after_id", after);
        const res = await fetchImpl(url.toString(), {
          headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return failureFor(provider, res.status);
        const body = (await res.json()) as {
          data?: Array<Record<string, unknown>>;
          has_more?: boolean;
          last_id?: string | null;
        };
        for (const raw of body.data ?? []) {
          const m = mapAnthropicModel(raw);
          if (m) all.push(m);
        }
        if (!body.has_more || !body.last_id) break;
        after = body.last_id;
      }
    }
    const unique = [...new Map(all.map((m) => [m.id, m] as const)).values()];
    const text = unique.filter((m) => isTextGenerationModel(provider, m.id));
    return { ok: true, models: sortModels(text), hiddenCount: unique.length - text.length };
  } catch {
    return failureFor(provider, 0);
  }
}
