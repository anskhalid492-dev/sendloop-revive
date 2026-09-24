import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AI_PROVIDERS,
  aiProvider,
  aiProviderLabel,
  resolveAiModel,
} from "@/lib/ai-providers";
import { INTEGRATIONS_BY_SLUG } from "@/lib/integrations-catalog";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("AI provider catalogue", () => {
  it("offers OpenAI and Claude", () => {
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual(["openai", "anthropic"]);
    expect(aiProviderLabel("anthropic")).toBe("Claude");
    expect(aiProvider("anthropic").vendor).toBe("Anthropic");
  });

  it("validates provider key shapes", () => {
    expect(aiProvider("anthropic").keyPattern.test("sk-ant-api03-abcdefghijklmnopqrstuvwx")).toBe(true);
    expect(aiProvider("anthropic").keyPattern.test("sk-abcdefghijklmnopqrstuvwx")).toBe(false);
    expect(aiProvider("openai").keyPattern.test("sk-abcdefghijklmnopqrstuvwx")).toBe(true);
  });

  it("never substitutes a model — the stored id is used exactly or not at all", () => {
    expect(resolveAiModel(" claude-sonnet-4-5 ")).toBe("claude-sonnet-4-5");
    expect(resolveAiModel(null)).toBe("");
    expect(resolveAiModel("some-unknown-model")).toBe("some-unknown-model");
  });
});

describe("key verification", () => {
  it("calls Anthropic with the documented auth headers", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), headers: init.headers as Record<string, string> });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const { verifyAiKey } = await import("@/lib/ai-keys.server");
    const result = await verifyAiKey("anthropic", "sk-ant-api03-abcdefghijklmnopqrstuvwx");

    expect(result.ok).toBe(true);
    expect(calls[0]!.url).toContain("api.anthropic.com/v1/models");
    expect(calls[0]!.headers["anthropic-version"]).toBe("2023-06-01");
    expect(calls[0]!.headers["x-api-key"]).toBe("sk-ant-api03-abcdefghijklmnopqrstuvwx");
  });

  it("rejects a bad-shaped key before any network call", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const { verifyAiKey } = await import("@/lib/ai-keys.server");
    const result = await verifyAiKey("anthropic", "not-a-key");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Anthropic");
    expect(called).toBe(false);
  });

  it("reports an unauthorized key without leaking provider detail", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const { verifyAiKey } = await import("@/lib/ai-keys.server");
    const result = await verifyAiKey("anthropic", "sk-ant-api03-abcdefghijklmnopqrstuvwx");
    expect(result).toEqual({
      ok: false,
      message: "Invalid Anthropic API key. Please check your key and try again.",
    });
  });
});

describe("Claude generation", () => {
  const config = {
    level: "balanced",
    tone: "professional",
    length: "one_line",
    language: "English",
    instructions: "",
    fields: ["first_name", "company"],
    exampleOutput: "",
    fallbackMode: "fallback_text",
    fallbackText: "I came across your team and wanted to reach out.",
  } as const;

  const lead = { id: "l1", email: "a@b.com", first_name: "Ana", company: "Acme" };

  it("uses the Anthropic Messages API and returns its text", async () => {
    const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "Noticed Acme's packaging work." }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const { generatePersonalization } = await import("@/lib/ai-personalization.server");
    const { normalizeAiConfig } = await import("@/lib/ai-personalization-model");
    const result = await generatePersonalization(normalizeAiConfig(config), lead, {
      provider: "anthropic",
      apiKey: "sk-ant-api03-abcdefghijklmnopqrstuvwx",
      model: "claude-haiku-4-5",
    });

    expect(seen[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(seen[0]!.body["model"]).toBe("claude-haiku-4-5");
    expect(seen[0]!.body["system"]).toBeTruthy();
    expect(result.content).toContain("Acme");
    expect(result.model).toBe("claude-haiku-4-5");
  });

  it("marks rate limits retryable and key failures terminal", async () => {
    const { generatePersonalization, AiGatewayError } = await import(
      "@/lib/ai-personalization.server"
    );
    const { normalizeAiConfig } = await import("@/lib/ai-personalization-model");
    const run = () =>
      generatePersonalization(normalizeAiConfig(config), lead, {
        provider: "anthropic",
        apiKey: "sk-ant-api03-abcdefghijklmnopqrstuvwx",
        model: "claude-haiku-4-5",
      });

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "rate" } }), {
        status: 429,
      })) as unknown as typeof fetch;
    const rateError = await run().catch((error) => error);
    expect(rateError).toBeInstanceOf(AiGatewayError);
    expect(rateError.retryable).toBe(true);
    expect(rateError.message).toContain("Claude");

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "bad key" } }), {
        status: 401,
      })) as unknown as typeof fetch;
    const keyError = await run().catch((error) => error);
    expect(keyError.retryable).toBe(false);
    expect(keyError.status).toBe(401);
  });
});

describe("Claude integration entry", () => {
  it("is listed with an Anthropic API key field", () => {
    const meta = INTEGRATIONS_BY_SLUG["claude"];
    expect(meta?.category).toBe("ai");
    expect(meta?.authType).toBe("api_key");
    expect(meta?.fields.some((f) => f.key === "api_key" && f.secret)).toBe(true);
    expect(meta?.docsUrl).toContain("docs.anthropic.com");
  });
});
