/**
 * MunchReach-owned AI provider for the AI Sales Agent (server only).
 *
 * Uses MunchReach's own AI gateway credential (LOVABLE_API_KEY, read inside
 * the call). It NEVER reads a customer AI key and is never used by AI Campaign
 * Writer / AI Personalization, which keep their customer-key path
 * (ai-keys.server.ts / ai-models.server.ts). Credentials never leave this file.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

import { SALES_AGENT_PROVIDER } from "@/lib/sales-agent";

export const SALES_AGENT_MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
export const SALES_AGENT_TIMEOUT_MS = 20_000;

export type SalesAgentCall =
  | { ok: true; text: string; meta: SalesAgentCallMeta }
  | { ok: false; kind: "timeout" | "unavailable" | "failed"; message: string; meta: SalesAgentCallMeta };

export type SalesAgentCallMeta = {
  provider: typeof SALES_AGENT_PROVIDER;
  status: "success" | "timeout" | "unavailable" | "failed";
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  purpose: "decision" | "reply";
};

/** Test seam: tests replace the transport, never the provider selection. */
type Transport = (args: { system: string; prompt: string; signal: AbortSignal; apiKey: string }) => Promise<{ text: string; inputTokens?: number | null; outputTokens?: number | null }>;
let transportOverride: Transport | null = null;
export function __setSalesAgentTransport(t: Transport | null) {
  transportOverride = t;
}

const defaultTransport: Transport = async ({ system, prompt, signal, apiKey }) => {
  const runIdFetch = async (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init);
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch,
  });
  const result = streamText({
    model: provider.responses(SALES_AGENT_MODEL),
    system,
    prompt,
    abortSignal: signal,
    maxRetries: 0, // never re-bill silently; failures route to fallback
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const text = await result.text;
  const usage = await result.usage.catch(() => null);
  return { text, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null };
};

/** One bounded call to the MunchReach AI provider. Never throws. */
export async function callSalesAgentModel(args: { system: string; prompt: string; purpose: "decision" | "reply"; workspaceId: string }): Promise<SalesAgentCall> {
  const started = Date.now();
  const meta = (status: SalesAgentCallMeta["status"], tokens?: { inputTokens?: number | null; outputTokens?: number | null }): SalesAgentCallMeta => ({
    provider: SALES_AGENT_PROVIDER,
    status,
    latencyMs: Date.now() - started,
    inputTokens: tokens?.inputTokens ?? null,
    outputTokens: tokens?.outputTokens ?? null,
    purpose: args.purpose,
  });
  const log = (m: SalesAgentCallMeta) =>
    console.info("[sales-agent-ai]", JSON.stringify({ workspaceId: args.workspaceId, ...m }));

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    const m = meta("unavailable");
    log(m);
    return { ok: false, kind: "unavailable", message: "AI service unavailable.", meta: m };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SALES_AGENT_TIMEOUT_MS);
  try {
    const out = await (transportOverride ?? defaultTransport)({ system: args.system, prompt: args.prompt.slice(0, 12_000), signal: controller.signal, apiKey });
    const m = meta("success", out);
    log(m);
    return { ok: true, text: String(out.text ?? ""), meta: m };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = (error as { statusCode?: number })?.statusCode;
    const timedOut = controller.signal.aborted || /abort|timed? ?out/i.test(msg);
    const kind = timedOut ? "timeout" : status && (status === 402 || status === 403 || status === 429 || status >= 500) ? "unavailable" : "failed";
    const m = meta(kind);
    log(m);
    const message = kind === "timeout" ? "AI decision timed out." : "AI service unavailable.";
    return { ok: false, kind, message, meta: m };
  } finally {
    clearTimeout(timer);
  }
}
