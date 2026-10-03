/**
 * MunchReach-owned AI provider call for the AI Sales Agent (server only).
 *
 * The provider (OpenAI or Anthropic), model and encrypted API key are set by
 * a MunchReach super admin in Admin → AI Provider
 * (src/lib/sales-agent-provider.server.ts). There is NO fallback credential:
 * when nothing is configured the call reports "unavailable" and the caller
 * routes to its existing fallback / human-review path. This module never
 * reads a customer AI key and is never used by Campaign Writer,
 * Personalization or Inbox AI Reply. Credentials never leave the server.
 */
import { SALES_AGENT_PROVIDER } from "@/lib/sales-agent";
import type { SalesAgentAiProvider } from "@/lib/sales-agent-provider";
import { resolveProviderConfig, sendToProvider, type ProviderRequest, type ProviderResult } from "@/lib/sales-agent-provider.server";

export const SALES_AGENT_TIMEOUT_MS = 20_000;

export type SalesAgentCall =
  | { ok: true; text: string; meta: SalesAgentCallMeta }
  | { ok: false; kind: "timeout" | "unavailable" | "failed"; message: string; meta: SalesAgentCallMeta };

export type SalesAgentCallMeta = {
  provider: typeof SALES_AGENT_PROVIDER;
  aiProvider: SalesAgentAiProvider | null;
  model: string | null;
  status: "success" | "timeout" | "unavailable" | "failed";
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  purpose: "decision" | "reply";
};

/** Test seam: tests replace the network transport, never the provider selection. */
type Transport = (args: ProviderRequest) => Promise<ProviderResult>;
let transportOverride: Transport | null = null;
export function __setSalesAgentTransport(t: Transport | null) {
  transportOverride = t;
}

export const NOT_CONFIGURED_MESSAGE = "AI service unavailable.";

/** One bounded call to the MunchReach AI provider. Never throws, never retries. */
export async function callSalesAgentModel(args: { system: string; prompt: string; purpose: "decision" | "reply"; workspaceId: string }): Promise<SalesAgentCall> {
  const started = Date.now();
  const cfg = await resolveProviderConfig();
  const meta = (status: SalesAgentCallMeta["status"], tokens?: { inputTokens?: number | null; outputTokens?: number | null }): SalesAgentCallMeta => ({
    provider: SALES_AGENT_PROVIDER,
    aiProvider: cfg?.provider ?? null,
    model: cfg?.model ?? null,
    status,
    latencyMs: Date.now() - started,
    inputTokens: tokens?.inputTokens ?? null,
    outputTokens: tokens?.outputTokens ?? null,
    purpose: args.purpose,
  });
  const log = (m: SalesAgentCallMeta) =>
    console.info("[sales-agent-ai]", JSON.stringify({ workspaceId: args.workspaceId, ...m }));

  if (!cfg) {
    const m = meta("unavailable");
    log(m);
    return { ok: false, kind: "unavailable", message: NOT_CONFIGURED_MESSAGE, meta: m };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SALES_AGENT_TIMEOUT_MS);
  try {
    const req: ProviderRequest = { ...cfg, system: args.system, prompt: args.prompt.slice(0, 12_000), signal: controller.signal };
    const out = await (transportOverride ?? sendToProvider)(req);
    const text = String(out?.text ?? "");
    if (!text.trim()) {
      const m = meta("failed", out);
      log(m);
      return { ok: false, kind: "failed", message: "AI returned an invalid response.", meta: m };
    }
    const m = meta("success", out);
    log(m);
    return { ok: true, text, meta: m };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = (error as { statusCode?: number })?.statusCode;
    const invalid = (error as { invalid?: boolean })?.invalid === true;
    const timedOut = controller.signal.aborted || /abort|timed? ?out/i.test(msg);
    const kind = timedOut ? "timeout" : invalid ? "failed" : status && (status === 401 || status === 402 || status === 403 || status === 429 || status >= 500) ? "unavailable" : "failed";
    const m = meta(kind);
    log(m);
    const message = kind === "timeout" ? "AI decision timed out." : invalid ? "AI returned an invalid response." : "AI service unavailable.";
    return { ok: false, kind, message, meta: m };
  } finally {
    clearTimeout(timer);
  }
}
