import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { memStore } from "./helpers/sales-agent-provider-store";
import {
  __setProviderTransport,
  __setSalesAgentProviderStore,
  callAnthropic,
  callOpenAi,
  getProviderView,
  removeProviderKey,
  resolveProviderConfig,
  saveProviderConfig,
  testProviderConnection,
} from "@/lib/sales-agent-provider.server";
import { __setSalesAgentTransport, callSalesAgentModel } from "@/lib/sales-agent-ai.server";
import { runAiDecision, runAiReply, type AgentContext } from "@/lib/sales-agent.server";
import { DEFAULT_SALES_AGENT_SETTINGS } from "@/lib/sales-agent";
import { makeAiDecisionNode, type WorkflowNode } from "@/lib/workflow-graph";

const read = (p: string) => readFileSync(p, "utf8");
const SECRET = "sk-super-secret-value-123456";
const base = { system: "s", prompt: "p", purpose: "decision" as const, workspaceId: "11111111-1111-1111-1111-111111111111" };
const ctx: AgentContext = {
  workspaceId: base.workspaceId,
  lead: { first_name: "Ana", company: "Acme", status: "active", tags: [], workspace_id: base.workspaceId },
  stageName: null,
  campaignName: "Q4",
  conversation: { id: "c", subject: "Hello", prospect_email: "ana@acme.test" },
  messages: [{ direction: "inbound", body: "Can you tell me more?", occurred_at: null }],
  previousDecisions: [],
};

function fetchMock(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return impl(url, init);
  }));
  return calls;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (provider: "openai" | "anthropic", signal = new AbortController().signal) => ({ provider, model: "m-1", apiKey: SECRET, system: "sys", prompt: "hi", signal });

afterEach(() => {
  __setSalesAgentProviderStore(null);
  __setSalesAgentTransport(null);
  __setProviderTransport(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenAI provider", () => {
  it("sends the configured key/model to OpenAI and parses text", async () => {
    const calls = fetchMock(() => json({ choices: [{ message: { content: "hello" } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
    const r = await callOpenAi(req("openai"));
    expect(r).toEqual({ text: "hello", inputTokens: 3, outputTokens: 1 });
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(String(calls[0]!.init.body)).model).toBe("m-1");
  });
  it("provider error carries status but not the response body", async () => {
    fetchMock(() => json({ error: { message: `bad key ${SECRET}` } }, 401));
    const e = await callOpenAi(req("openai")).catch((x) => x);
    expect(e.statusCode).toBe(401);
    expect(String(e.message)).not.toContain(SECRET);
  });
  it("invalid / empty / refusal responses are rejected", async () => {
    fetchMock(() => json({ choices: [] }));
    expect((await callOpenAi(req("openai")).catch((x) => x)).invalid).toBe(true);
    fetchMock(() => new Response("not json", { status: 200 }));
    expect((await callOpenAi(req("openai")).catch((x) => x)).invalid).toBe(true);
    fetchMock(() => json({ choices: [{ message: { content: null, refusal: "no" } }] }));
    expect((await callOpenAi(req("openai")).catch((x) => x)).invalid).toBe(true);
  });
  it("timeout surfaces as a timeout without retry", async () => {
    __setSalesAgentProviderStore(memStore({ provider: "openai", model: "m-1", key: SECRET }));
    vi.useFakeTimers();
    let n = 0;
    fetchMock((_u, init) => {
      n += 1;
      return new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(new Error("The operation was aborted"))));
    });
    const p = callSalesAgentModel(base);
    await vi.advanceTimersByTimeAsync(21_000);
    const r = await p;
    vi.useRealTimers();
    expect(r).toMatchObject({ ok: false, kind: "timeout" });
    expect(n).toBe(1);
  });
});

describe("Anthropic provider", () => {
  it("sends x-api-key + model and joins text blocks", async () => {
    const calls = fetchMock(() => json({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }], usage: { input_tokens: 4, output_tokens: 2 } }));
    const r = await callAnthropic(req("anthropic"));
    expect(r).toEqual({ text: "ab", inputTokens: 4, outputTokens: 2 });
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    const h = new Headers(calls[0]!.init.headers);
    expect(h.get("x-api-key")).toBe(SECRET);
    expect(h.get("anthropic-version")).toBeTruthy();
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ model: "m-1", system: "sys" });
  });
  it("provider error, invalid response and refusal", async () => {
    fetchMock(() => json({}, 529));
    expect((await callAnthropic(req("anthropic")).catch((x) => x)).statusCode).toBe(529);
    fetchMock(() => json({ content: [] }));
    expect((await callAnthropic(req("anthropic")).catch((x) => x)).invalid).toBe(true);
    fetchMock(() => json({ content: [{ type: "text", text: "x" }], stop_reason: "refusal" }));
    expect((await callAnthropic(req("anthropic")).catch((x) => x)).invalid).toBe(true);
  });
  it("timeout maps to timeout", async () => {
    __setSalesAgentProviderStore(memStore({ provider: "anthropic", model: "m-1", key: SECRET }));
    __setSalesAgentTransport(async () => {
      throw new Error("The operation was aborted");
    });
    expect(await callSalesAgentModel(base)).toMatchObject({ ok: false, kind: "timeout" });
  });
});

describe("provider selection", () => {
  it("OpenAI config uses OpenAI, Anthropic config uses Anthropic", async () => {
    const calls = fetchMock((url) =>
      url.includes("openai") ? json({ choices: [{ message: { content: "o" } }] }) : json({ content: [{ type: "text", text: "a" }] }),
    );
    __setSalesAgentProviderStore(memStore({ provider: "openai", model: "gpt-x", key: SECRET }));
    const a = await callSalesAgentModel(base);
    __setSalesAgentProviderStore(memStore({ provider: "anthropic", model: "claude-x", key: SECRET }));
    const b = await callSalesAgentModel(base);
    expect(calls.map((c) => new URL(c.url).host)).toEqual(["api.openai.com", "api.anthropic.com"]);
    expect(a.ok && a.meta).toMatchObject({ aiProvider: "openai", model: "gpt-x", provider: "munchreach" });
    expect(b.ok && b.meta).toMatchObject({ aiProvider: "anthropic", model: "claude-x" });
  });
  it("changing provider requires a new key and stops using the old provider", async () => {
    const s = memStore({ provider: "openai", model: "gpt-x", key: "old-openai-key" });
    __setSalesAgentProviderStore(s);
    await expect(saveProviderConfig({ provider: "anthropic", model: "claude-x" })).rejects.toThrow(/API key/);
    expect((await resolveProviderConfig())!.provider).toBe("openai");
    await saveProviderConfig({ provider: "anthropic", model: "claude-x", apiKey: "new-anthropic-key" });
    expect(await resolveProviderConfig()).toEqual({ provider: "anthropic", model: "claude-x", apiKey: "new-anthropic-key" });
  });
  it("no provider configured fails safely without any network call and never uses LOVABLE_API_KEY", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "lovable-should-not-be-used");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    __setSalesAgentProviderStore(memStore(null));
    const r = await callSalesAgentModel(base);
    expect(r).toMatchObject({ ok: false, kind: "unavailable" });
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("removed key fails safely and decision routes to fallback; reply is not produced", async () => {
    const s = memStore({ provider: "openai", model: "gpt-x", key: SECRET });
    __setSalesAgentProviderStore(s);
    await removeProviderKey();
    const node = makeAiDecisionNode(["Interested", "Other"]) as Extract<WorkflowNode, { type: "branch" }>;
    const d = await runAiDecision(node, ctx, DEFAULT_SALES_AGENT_SETTINGS);
    expect(d.pathKey).toBe(node.otherwise.key);
    expect(d.output["fallbackReason"]).toBe("AI service unavailable.");
    const rep = await runAiReply({ mode: "auto_send" }, ctx, DEFAULT_SALES_AGENT_SETTINGS, 0.99);
    expect(rep.ok).toBe(false);
  });
  it("provider failure on auto-send never yields a sendable reply", async () => {
    __setSalesAgentProviderStore(memStore({ provider: "anthropic", model: "c", key: SECRET }));
    __setSalesAgentTransport(async () => {
      throw Object.assign(new Error("down"), { statusCode: 503 });
    });
    const rep = await runAiReply({ mode: "auto_send" }, ctx, DEFAULT_SALES_AGENT_SETTINGS, 0.99);
    expect(rep.ok).toBe(false);
  });
});

describe("admin configuration + masking", () => {
  it("save, update, remove and masked views", async () => {
    const s = memStore(null);
    __setSalesAgentProviderStore(s);
    expect((await getProviderView()).status).toBe("not_configured");
    await expect(saveProviderConfig({ provider: "openai", model: "gpt-x" })).rejects.toThrow();
    const v1 = await saveProviderConfig({ provider: "openai", model: "gpt-x", apiKey: SECRET });
    expect(v1).toMatchObject({ provider: "openai", model: "gpt-x", hasKey: true, status: "configured" });
    const v2 = await saveProviderConfig({ provider: "openai", model: "gpt-y" });
    expect(v2.model).toBe("gpt-y");
    expect((await resolveProviderConfig())!.apiKey).toBe(SECRET);
    const v3 = await removeProviderKey();
    expect(v3).toMatchObject({ hasKey: false, maskedKey: null, status: "not_configured" });
    expect(await resolveProviderConfig()).toBeNull();
    for (const v of [v1, v2, v3]) expect(JSON.stringify(v)).not.toContain(SECRET);
    // stored ciphertext never contains the raw key
    for (const w of s.writes) expect(JSON.stringify(w)).not.toContain(SECRET);
  });
  it("test connection returns only safe fields and records status", async () => {
    __setSalesAgentProviderStore(memStore({ provider: "openai", model: "gpt-x", key: SECRET }));
    __setProviderTransport(async () => ({ text: "OK" }));
    const ok = await testProviderConnection();
    expect(Object.keys(ok).sort()).toEqual(["latencyMs", "message", "model", "ok", "provider"]);
    expect(ok).toMatchObject({ ok: true, provider: "openai", model: "gpt-x" });
    expect((await getProviderView()).status).toBe("test_ok");
    __setProviderTransport(async () => {
      throw Object.assign(new Error(`denied ${SECRET}`), { statusCode: 401 });
    });
    const bad = await testProviderConnection();
    expect(bad).toMatchObject({ ok: false, message: "The API key was rejected by the provider." });
    expect(JSON.stringify(bad)).not.toContain(SECRET);
    expect((await getProviderView()).status).toBe("test_failed");
  });
  it("test connection with nothing configured makes no call", async () => {
    __setSalesAgentProviderStore(memStore(null));
    const t = vi.fn();
    __setProviderTransport(t);
    expect((await testProviderConnection()).ok).toBe(false);
    expect(t).not.toHaveBeenCalled();
  });
  it("every admin server function requires super admin", () => {
    const src = read("src/lib/sales-agent-provider.functions.ts");
    expect(src.match(/createServerFn\(/g)!.length).toBe(4);
    expect(src.match(/await guard\(context/g)!.length).toBe(4);
    expect(src).toMatch(/assertSuperAdmin/);
    expect(src.match(/requireSupabaseAuth\]/g)!.length).toBe(4);
  });
});

describe("security", () => {
  it("key never appears in logs, call results, or history metadata", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((...a) => void logs.push(a.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...a) => void logs.push(a.join(" ")));
    __setSalesAgentProviderStore(memStore({ provider: "openai", model: "gpt-x", key: SECRET }));
    __setSalesAgentTransport(async () => ({ text: '{"outcome":"Interested","confidence":0.95,"reason":"r"}' }));
    const node = makeAiDecisionNode(["Interested", "Other"]) as Extract<WorkflowNode, { type: "branch" }>;
    const d = await runAiDecision(node, ctx, DEFAULT_SALES_AGENT_SETTINGS);
    __setSalesAgentTransport(async () => {
      throw new Error(`boom ${SECRET}`);
    });
    const f = await callSalesAgentModel(base);
    const blob = JSON.stringify([d, f, logs]);
    expect(blob).not.toContain(SECRET);
    expect(logs.length).toBeGreaterThan(0);
  });
  it("browser-facing modules never contain provider keys or env reads", () => {
    for (const f of ["src/lib/sales-agent-provider.ts", "src/components/admin/SalesAgentProviderSettings.tsx", "src/routes/_authenticated/mranuskhalid/ai-provider.tsx"]) {
      const src = read(f);
      expect(src).not.toMatch(/process\.env|VITE_|sales-agent-provider\.server|api\.openai\.com|api\.anthropic\.com/);
    }
  });
  it("AI Sales Agent has no Lovable AI gateway dependency", () => {
    for (const f of ["src/lib/sales-agent-ai.server.ts", "src/lib/sales-agent-provider.server.ts", "src/lib/sales-agent.server.ts", "src/lib/sales-agent.functions.ts", "src/lib/sales-agent-provider.functions.ts"]) {
      expect(read(f)).not.toMatch(/LOVABLE_API_KEY|ai\.gateway\.lovable|gpt-6-astra|X-Lovable-AIG/);
    }
  });
  it("customer AI features never import the MunchReach provider", () => {
    for (const f of ["src/lib/ai-campaign-writer.server.ts", "src/lib/ai-personalization.server.ts", "src/lib/inbox-ai.functions.ts", "src/lib/ai-campaign-writer.functions.ts", "src/lib/ai-personalization.functions.ts"]) {
      expect(read(f)).not.toMatch(/sales-agent-provider|sales-agent-ai/);
    }
  });
});
