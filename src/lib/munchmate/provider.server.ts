/**
 * MunchMate provider abstraction. Server-only; the admin-saved API key never
 * leaves this module and is never logged.
 */
import { compactHistory, isContextValidationError, MESSAGE_LIMIT, splitSystem } from "./context";
import { logMunchmateError } from "./errors.server";
export type MunchProvider = "openai" | "anthropic";
export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ProviderCall = {
  provider: MunchProvider;
  apiKey: string;
  model: string;
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  temperature: number;
  retrySystem?: string;
};

export class ProviderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function safeDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    const msg = typeof body.error === "string" ? body.error : body.error?.message;
    return (msg ?? "").replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 300);
  } catch {
    return "";
  }
}

export async function generateReply(input: ProviderCall): Promise<string> {
  const prepared = { ...input, messages: compactHistory(input.messages) };
  try {
    return await generateOnce(prepared);
  } catch (error) {
    logMunchmateError("provider", error, input.provider);
    if (!isContextValidationError(error)) throw error;
    try {
      return await generateOnce({ ...prepared, messages: compactHistory(input.messages, true),
        system: input.retrySystem ?? input.system.slice(0, MESSAGE_LIMIT) });
    } catch (retryError) {
      logMunchmateError("provider-context-retry", retryError, input.provider);
      throw retryError;
    }
  }
}

async function generateOnce(input: ProviderCall): Promise<string> {
  const systems = splitSystem(input.system);
  if (input.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        system: systems.map((text) => ({ type: "text", text })),
        messages: input.messages,
      }),
    });
    if (!res.ok) throw new ProviderError(res.status, (await safeDetail(res)) || `Claude returned HTTP ${res.status}`);
    const body = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    return (body.content ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("").trim();
  }
  const send = (withParams: boolean) =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        model: input.model,
        messages: [...systems.map((content) => ({ role: "system", content })), ...input.messages],
        ...(withParams ? { max_completion_tokens: input.maxTokens, temperature: input.temperature } : {}),
      }),
    });
  let res = await send(true);
  if (res.status === 400) {
    const detail = await safeDetail(res.clone());
    if (/unsupported/i.test(detail)) res = await send(false);
  }
  if (!res.ok) throw new ProviderError(res.status, (await safeDetail(res)) || `OpenAI returned HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (body.choices?.[0]?.message?.content ?? "").trim();
}

/** Connection test: lists models with the key. Returns model ids. */
export async function listProviderModels(provider: MunchProvider, apiKey: string): Promise<string[]> {
  const res =
    provider === "anthropic"
      ? await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        })
      : await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new ProviderError(res.status, (await safeDetail(res)) || `HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ id: string }> };
  const ids = (body.data ?? []).map((m) => m.id);
  return provider === "openai" ? ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id)).sort() : ids;
}
