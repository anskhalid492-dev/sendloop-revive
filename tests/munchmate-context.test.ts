import { afterEach, describe, expect, it, vi } from "vitest";
import { chatInputSchema, compactHistory, isContextValidationError, LONG_MESSAGE_ERROR, parseChatInput, relevantExcerpt, splitSystem, type ContextTurn } from "@/lib/munchmate/context";
import { buildKnowledgePrompt } from "@/lib/munchmate/grounding";
import { FALLBACK_ANSWER, sanitizeOutput } from "@/lib/munchmate/retrieval";
import { generateReply } from "@/lib/munchmate/provider.server";

// Named throwaway conversation fixtures only; every provider request is mocked.
const question = "How do I create a campaign?";
const call = { apiKey: "fixture-not-a-key", model: "fixture-model", system: "Public rules. ".repeat(800),
  retrySystem: "Public rules and a relevant excerpt.", maxTokens: 500, temperature: 0.3,
  messages: [{ role: "user" as const, content: question }] };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("MunchMate bounded context", () => {
  it("keeps a short question exactly intact", () => {
    expect(parseChatInput({ messages: [{ role: "user", content: "  hello\nthere  " }] }).messages)
      .toEqual([{ role: "user", content: "  hello\nthere  " }]);
  });
  it("preserves every character of a 4,000-character latest question", () => {
    const content = "x".repeat(4000);
    expect(compactHistory([{ role: "user", content }])[0]?.content).toBe(content);
    expect(chatInputSchema.safeParse({ messages: compactHistory([{ role: "user", content }]) }).success).toBe(true);
  });
  it("rejects a 4,001-character latest question rather than silently changing it", () => {
    expect(() => parseChatInput({ messages: [{ role: "user", content: "x".repeat(4001) }] })).toThrow(LONG_MESSAGE_ERROR);
  });
  it("repairs legacy oversized assistant replies and histories before validation without mutation", () => {
    const original: ContextTurn[] = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "history".repeat(1000) }));
    original.push({ role: "user", content: question });
    const before = structuredClone(original);
    const parsed = parseChatInput({ messages: original });
    expect(parsed.messages.length).toBeLessThanOrEqual(12);
    expect(parsed.messages.every((m) => m.content.length <= 4000)).toBe(true);
    expect(parsed.messages.at(-1)?.content).toBe(question);
    expect(original).toEqual(before);
  });
  it("supports multiple consecutive questions beyond the old 30-message boundary", () => {
    const history: ContextTurn[] = [];
    for (let i = 0; i < 40; i++) {
      history.push({ role: "user", content: `Question ${i}: ${question}` });
      const parsed = parseChatInput({ messages: history });
      expect(parsed.messages.at(-1)?.content).toBe(`Question ${i}: ${question}`);
      history.push({ role: "assistant", content: sanitizeOutput("Helpful answer. ".repeat(500)) });
    }
    expect(history).toHaveLength(80);
  });
  it("reduces older context before touching the latest question on retry", () => {
    const history: ContextTurn[] = [{ role: "user", content: "a".repeat(4000) }, { role: "assistant", content: "b".repeat(4000) }, { role: "user", content: "c".repeat(4000) }];
    const normal = compactHistory(history);
    const smaller = compactHistory(history, true);
    expect(smaller.at(-1)?.content).toBe(history.at(-1)?.content);
    expect(smaller.reduce((sum, m) => sum + m.content.length, 0)).toBeLessThan(normal.reduce((sum, m) => sum + m.content.length, 0));
  });
  it("extracts relevant passages even from a long unbroken article", () => {
    const article = "a".repeat(5000) + " Connect mailbox through Settings SMTP IMAP. " + "b".repeat(5000);
    const excerpt = relevantExcerpt(article, "Connect mailbox SMTP IMAP");
    expect(excerpt.length).toBeLessThanOrEqual(1200);
    expect(excerpt).toContain("Connect mailbox");
    expect(excerpt).not.toBe(article);
  });
  it("bounds article excerpts and system blocks while retaining hard rules on retry", () => {
    const hits = [{ key: "help:test", title: "Test", url: "/help-center", content: "", chunk: "Campaign instructions. ".repeat(2000) }];
    const system = buildKnowledgePrompt(hits, FALLBACK_ANSWER, "style ".repeat(1000), question);
    const smaller = buildKnowledgePrompt(hits, FALLBACK_ANSWER, "style ".repeat(1000), question, true);
    expect(smaller.length).toBeLessThan(system.length);
    expect(smaller).toContain("You have no tools");
    expect(splitSystem(system).every((s) => s.length <= 4000)).toBe(true);
    expect(splitSystem(system).join("")).toBe(system);
  });
});

describe.each(["openai", "anthropic"] as const)("MunchMate %s provider", (provider) => {
  function success() {
    return Response.json(provider === "openai" ? { choices: [{ message: { content: "Helpful answer." } }] } : { content: [{ type: "text", text: "Helpful answer." }] });
  }
  it("sends bounded individual messages and system text blocks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateReply({ ...call, provider })).toBe("Helpful answer.");
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const texts = provider === "openai" ? payload.messages.map((m: ContextTurn) => m.content) : [...payload.system.map((s: { text: string }) => s.text), ...payload.messages.map((m: ContextTurn) => m.content)];
    expect(texts.every((s: string) => s.length <= 4000)).toBe(true);
    expect(payload.messages.at(-1).content).toBe(question);
  });
  it("retries context validation exactly once with smaller history and knowledge", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ error: { message: "context length validation too_big" } }, { status: 400 })).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetchMock);
    const messages: ContextTurn[] = [{ role: "user", content: "a".repeat(4000) }, { role: "assistant", content: "b".repeat(4000) }, { role: "user", content: question }];
    expect(await generateReply({ ...call, provider, messages })).toBe("Helpful answer.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0][1].body;
    const second = fetchMock.mock.calls[1][1].body;
    expect(second.length).toBeLessThan(first.length);
    expect(JSON.parse(second).messages.at(-1).content).toBe(question);
  });
  it("stops after one failed context retry and logs no key or conversation", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ error: { message: "context length too_big fixture-not-a-key private message" } }, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateReply({ ...call, provider })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("400");
    expect(logged).not.toContain("fixture-not-a-key");
    expect(logged).not.toContain("private message");
    expect(logged).not.toContain(question);
  });
  it("does not retry authentication failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { message: "Invalid API key" } }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateReply({ ...call, provider })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it("recognizes validation errors but not generic outages", () => {
  expect(isContextValidationError({ name: "ZodError", message: "too_big: String must contain at most 4000 characters" })).toBe(true);
  expect(isContextValidationError({ status: 503, message: "Unavailable" })).toBe(false);
});