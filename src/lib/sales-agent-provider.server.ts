/**
 * MunchReach-owned AI provider (OpenAI or Anthropic) for the AI Sales Agent.
 * Server only. The API key is encrypted with the existing provider-credential
 * cipher (PROVIDER_CREDENTIALS_KEY) and stored in one platform_settings row
 * written/read with the service client. The raw key never leaves this module:
 * it is not returned, logged, or written to workflow history / analytics.
 *
 * There is deliberately NO fallback to any other credential (including
 * LOVABLE_API_KEY): no configuration means "unavailable".
 */
import {
  MASKED_KEY,
  SALES_AGENT_AI_PROVIDERS,
  type SalesAgentAiProvider,
  type SalesAgentProviderStatus,
  type SalesAgentProviderView,
} from "@/lib/sales-agent-provider";

export const SALES_AGENT_PROVIDER_SETTING_KEY = "sales_agent_ai_provider";

type Stored = {
  provider: SalesAgentAiProvider | null;
  model: string;
  key_ciphertext: string | null;
  status: SalesAgentProviderStatus;
  last_tested_at: string | null;
  last_error: string | null;
  updated_at: string | null;
};

export type ResolvedProviderConfig = { provider: SalesAgentAiProvider; model: string; apiKey: string };

const EMPTY: Stored = {
  provider: null,
  model: "",
  key_ciphertext: null,
  status: "not_configured",
  last_tested_at: null,
  last_error: null,
  updated_at: null,
};

// ---------- storage seam (tests replace it; production uses platform_settings) ----------
export type ProviderStore = { read: () => Promise<Stored | null>; write: (v: Stored) => Promise<void> };

const dbStore: ProviderStore = {
  async read() {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .select("value")
      .eq("key", SALES_AGENT_PROVIDER_SETTING_KEY)
      .maybeSingle();
    if (error) throw new Error("Could not read AI provider settings.");
    return (data?.value as Stored | null) ?? null;
  },
  async write(v) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ key: SALES_AGENT_PROVIDER_SETTING_KEY, value: v as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error("Could not save AI provider settings.");
  },
};
let storeOverride: ProviderStore | null = null;
export function __setSalesAgentProviderStore(s: ProviderStore | null) {
  storeOverride = s;
}
const store = () => storeOverride ?? dbStore;

function normalize(raw: Stored | null): Stored {
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const provider = SALES_AGENT_AI_PROVIDERS.includes(raw.provider as SalesAgentAiProvider) ? raw.provider : null;
  return { ...EMPTY, ...raw, provider, model: typeof raw.model === "string" ? raw.model : "" };
}

export function toView(s: Stored): SalesAgentProviderView {
  const hasKey = Boolean(s.key_ciphertext);
  return {
    provider: s.provider,
    model: s.model,
    hasKey,
    maskedKey: hasKey ? MASKED_KEY : null,
    status: hasKey && s.provider && s.model ? s.status : "not_configured",
    lastTestedAt: s.last_tested_at,
    lastError: s.last_error,
    updatedAt: s.updated_at,
  };
}

export async function getProviderView(): Promise<SalesAgentProviderView> {
  return toView(normalize(await store().read()));
}

async function encrypt(key: string): Promise<string> {
  const { encryptCredentials } = await import("@/lib/provider-credentials.server");
  return encryptCredentials({ api_key: key });
}
async function decrypt(ct: string): Promise<string | null> {
  try {
    const { decryptCredentials } = await import("@/lib/provider-credentials.server");
    const v = decryptCredentials<{ api_key?: string }>(ct);
    return typeof v.api_key === "string" && v.api_key ? v.api_key : null;
  } catch {
    return null;
  }
}

/** Save provider/model and optionally a new key. Changing provider requires a new key. */
export async function saveProviderConfig(input: { provider: SalesAgentAiProvider; model: string; apiKey?: string | null | undefined }): Promise<SalesAgentProviderView> {
  const current = normalize(await store().read());
  const model = input.model.trim();
  if (!model) throw new Error("Enter a model.");
  const newKey = input.apiKey?.trim() || "";
  const providerChanged = current.provider !== input.provider;
  if (providerChanged && !newKey) throw new Error(`Enter an API key for the new provider.`);
  if (!newKey && !current.key_ciphertext) throw new Error("Enter an API key.");
  const next: Stored = {
    provider: input.provider,
    model,
    key_ciphertext: newKey ? await encrypt(newKey) : current.key_ciphertext,
    status: "configured",
    last_tested_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  await store().write(next);
  return toView(next);
}

export async function removeProviderKey(): Promise<SalesAgentProviderView> {
  const current = normalize(await store().read());
  const next: Stored = { ...current, key_ciphertext: null, status: "not_configured", last_error: null, last_tested_at: null, updated_at: new Date().toISOString() };
  await store().write(next);
  return toView(next);
}

/** Resolves the full configuration, or null when anything is missing. */
export async function resolveProviderConfig(): Promise<ResolvedProviderConfig | null> {
  let s: Stored;
  try {
    s = normalize(await store().read());
  } catch {
    return null;
  }
  if (!s.provider || !s.model || !s.key_ciphertext) return null;
  const apiKey = await decrypt(s.key_ciphertext);
  if (!apiKey) return null;
  return { provider: s.provider, model: s.model, apiKey };
}

// ---------- transports ----------
export class ProviderError extends Error {
  constructor(message: string, readonly statusCode?: number, readonly invalid = false) {
    super(message);
  }
}

export type ProviderRequest = ResolvedProviderConfig & { system: string; prompt: string; signal: AbortSignal; maxTokens?: number };
export type ProviderResult = { text: string; inputTokens?: number | null; outputTokens?: number | null };

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new ProviderError(`Provider error (HTTP ${res.status}).`, res.status);
  }
  try {
    return await res.json();
  } catch {
    throw new ProviderError("AI returned an invalid response.", undefined, true);
  }
}

export async function callOpenAi(r: ProviderRequest): Promise<ProviderResult> {
  const json = (await postJson(
    "https://api.openai.com/v1/chat/completions",
    { authorization: `Bearer ${r.apiKey}` },
    {
      model: r.model,
      messages: [
        { role: "system", content: r.system },
        { role: "user", content: r.prompt },
      ],
    },
    r.signal,
  )) as { choices?: { message?: { content?: unknown; refusal?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const msg = json?.choices?.[0]?.message;
  if (!msg || msg.refusal || typeof msg.content !== "string" || !msg.content.trim()) {
    throw new ProviderError("AI returned an invalid response.", undefined, true);
  }
  return { text: msg.content, inputTokens: json.usage?.prompt_tokens ?? null, outputTokens: json.usage?.completion_tokens ?? null };
}

export async function callAnthropic(r: ProviderRequest): Promise<ProviderResult> {
  const json = (await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": r.apiKey, "anthropic-version": "2023-06-01" },
    { model: r.model, max_tokens: r.maxTokens ?? 1024, system: r.system, messages: [{ role: "user", content: r.prompt }] },
    r.signal,
  )) as { content?: { type?: string; text?: unknown }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  if (json?.stop_reason === "refusal") throw new ProviderError("AI returned an invalid response.", undefined, true);
  const text = (json?.content ?? [])
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
  if (!text.trim()) throw new ProviderError("AI returned an invalid response.", undefined, true);
  return { text, inputTokens: json.usage?.input_tokens ?? null, outputTokens: json.usage?.output_tokens ?? null };
}

export type ProviderTransport = (r: ProviderRequest) => Promise<ProviderResult>;
let transportOverride: ProviderTransport | null = null;
/** Test seam: replaces only the network call; provider selection stays real. */
export function __setProviderTransport(t: ProviderTransport | null) {
  transportOverride = t;
}
export function sendToProvider(r: ProviderRequest): Promise<ProviderResult> {
  if (transportOverride) return transportOverride(r);
  return r.provider === "anthropic" ? callAnthropic(r) : callOpenAi(r);
}

export function safeProviderMessage(error: unknown, timedOut: boolean): string {
  if (timedOut) return "The provider did not respond in time.";
  const status = (error as { statusCode?: number })?.statusCode;
  if ((error as { invalid?: boolean })?.invalid) return "The provider returned an invalid response.";
  if (status === 401 || status === 403) return "The API key was rejected by the provider.";
  if (status === 404) return "The model was not found or is not available for this key.";
  if (status === 400) return "The provider rejected the request (check the model name).";
  if (status === 429) return "The provider rate limit or quota was reached.";
  if (status && status >= 500) return "The provider is temporarily unavailable.";
  return "Could not reach the provider.";
}

/** Minimal connection test: no customer data, no side effects except the stored status. */
export async function testProviderConnection(): Promise<{ ok: boolean; message: string; provider: SalesAgentAiProvider | null; model: string; latencyMs: number }> {
  const current = normalize(await store().read());
  const cfg = await resolveProviderConfig();
  if (!cfg) return { ok: false, message: "No AI provider is configured.", provider: current.provider, model: current.model, latencyMs: 0 };
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let ok = false;
  let message = "Connection test successful.";
  try {
    await sendToProvider({ ...cfg, system: "You are a connection test.", prompt: "Reply with the single word OK.", signal: controller.signal, maxTokens: 32 });
    ok = true;
  } catch (error) {
    message = safeProviderMessage(error, controller.signal.aborted);
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - started;
  await store().write({ ...current, status: ok ? "test_ok" : "test_failed", last_tested_at: new Date().toISOString(), last_error: ok ? null : message });
  return { ok, message, provider: cfg.provider, model: cfg.model, latencyMs };
}
