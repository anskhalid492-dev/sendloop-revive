/**
 * Customer-specific AI model discovery (ChatGPT / Claude).
 * Provider HTTP is stubbed at the fetch boundary with the real response shapes
 * of GET /v1/models; no real customer keys or accounts are touched.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchProviderModels } from "@/lib/ai-models.server";
import { defaultAiConfig, normalizeAiConfig } from "@/lib/ai-personalization-model";
import { configSchema } from "@/lib/ai-personalization-schemas";
import { INTEGRATIONS_BY_SLUG } from "@/lib/integrations-catalog";

const OPENAI_KEY = "sk-test-abcdefghijklmnopqrstuvwxyz";
const CLAUDE_KEY = "sk-ant-test-abcdefghijklmnopqrstuvwxyz";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const openAiList = (ids: string[]) =>
  json({ object: "list", data: ids.map((id, i) => ({ id, object: "model", created: 1700000000 + i, owned_by: "org" })) });

/** Minimal in-memory stand-in for the service-role client. */
function fakeAdmin(tables: Record<string, Array<Record<string, unknown>>>) {
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let op: { kind: "select" | "update" | "delete"; patch?: Record<string, unknown> } = { kind: "select" };
    const match = () => rows.filter((r) => filters.every((f) => f(r)));
    const run = () => {
      const hit = match();
      if (op.kind === "update") hit.forEach((r) => Object.assign(r, op.patch));
      if (op.kind === "delete") hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return { data: hit, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
      update: (patch: Record<string, unknown>) => ((op = { kind: "update", patch }), q),
      delete: () => ((op = { kind: "delete" }), q),
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      upsert: async (row: Record<string, unknown>) => {
        const i = rows.findIndex((r) => r["workspace_id"] === row["workspace_id"] && r["provider"] === row["provider"]);
        if (i >= 0) rows[i] = { ...rows[i], ...row };
        else rows.push({ ...row });
        return { error: null };
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  return { from, tables };
}

async function directRow(provider: string, key: string, model: string, status = "verified") {
  const { encryptCredentials } = await import("@/lib/provider-credentials.server");
  return {
    workspace_id: "w1",
    provider,
    model,
    key_ciphertext: encryptCredentials({ api_key: key }),
    key_last4: key.slice(-4),
    status,
    last_error: null,
    verified_at: null,
  };
}

describe("model discovery against the real Models APIs", () => {
  it("OpenAI: calls GET /v1/models with the customer's key and returns its models", async () => {
    const seen: Array<{ url: string; auth: string }> = [];
    const f = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: (init.headers as Record<string, string>)["Authorization"]! });
      return openAiList(["model-a", "model-b", "text-embedding-x", "whisper-x"]);
    }) as unknown as typeof fetch;
    const r = await fetchProviderModels("openai", OPENAI_KEY, f);
    expect(seen[0]).toEqual({ url: "https://api.openai.com/v1/models", auth: `Bearer ${OPENAI_KEY}` });
    expect(r.ok && r.models.map((m) => m.id).sort()).toEqual(["model-a", "model-b"]);
    expect(r.ok && r.hiddenCount).toBe(2);
  });

  it("Anthropic: paginates GET /v1/models and keeps display name, context and capabilities", async () => {
    const urls: string[] = [];
    const f = (async (url: string, init: RequestInit) => {
      urls.push(url);
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe(CLAUDE_KEY);
      if (!url.includes("after_id"))
        return json({ data: [{ id: "claude-x", display_name: "Claude X", created_at: "2026-01-01T00:00:00Z", max_input_tokens: 200000, max_tokens: 64000, capabilities: { vision: { supported: true }, pdf: { supported: false } } }], has_more: true, last_id: "claude-x" });
      return json({ data: [{ id: "claude-y", display_name: "Claude Y", created_at: "2025-01-01T00:00:00Z" }], has_more: false, last_id: "claude-y" });
    }) as unknown as typeof fetch;
    const r = await fetchProviderModels("anthropic", CLAUDE_KEY, f);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("after_id=claude-x");
    if (!r.ok) throw new Error("expected ok");
    expect(r.models[0]).toMatchObject({ id: "claude-x", displayName: "Claude X", contextWindow: 200000, maxOutputTokens: 64000, capabilities: ["vision"] });
    expect(r.models[1]!.contextWindow).toBeNull(); // never guessed
  });

  it("reports invalid, revoked or blocked keys and outages clearly", async () => {
    const at = (status: number) => (async () => json({ error: { message: "raw detail" } }, status)) as unknown as typeof fetch;
    const invalid = await fetchProviderModels("openai", OPENAI_KEY, at(401));
    expect(invalid).toMatchObject({ ok: false, reason: "invalid_key" });
    expect(!invalid.ok && invalid.message).not.toContain("raw detail");
    expect(await fetchProviderModels("anthropic", CLAUDE_KEY, at(403))).toMatchObject({ ok: false, reason: "forbidden" });
    expect(await fetchProviderModels("openai", OPENAI_KEY, at(503))).toMatchObject({ ok: false, reason: "unreachable" });
    const boom = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect(await fetchProviderModels("openai", OPENAI_KEY, boom)).toMatchObject({ ok: false, reason: "unreachable" });
  });
});

describe("connection, refresh, selection and persistence", () => {
  it("saving a key validates it live and does not auto-pick a model", async () => {
    const { saveWorkspaceAiKey } = await import("@/lib/ai-keys.server");
    const admin = fakeAdmin({ workspace_ai_keys: [] });
    const info = await saveWorkspaceAiKey(admin, { workspaceId: "w1", apiKey: OPENAI_KEY, userId: "u1", provider: "openai" }, (async () => openAiList(["model-a"])) as unknown as typeof fetch);
    expect(info.connected).toBe(true);
    expect(info.model).toBe("");
    const stored = admin.tables["workspace_ai_keys"]![0]!;
    expect(String(stored["key_ciphertext"])).not.toContain(OPENAI_KEY);
    expect(info).not.toHaveProperty("apiKey");
  });

  it("an invalid key is never stored", async () => {
    const { saveWorkspaceAiKey } = await import("@/lib/ai-keys.server");
    const admin = fakeAdmin({ workspace_ai_keys: [] });
    await expect(
      saveWorkspaceAiKey(admin, { workspaceId: "w1", apiKey: CLAUDE_KEY, userId: "u1", provider: "anthropic" }, (async () => json({}, 401)) as unknown as typeof fetch),
    ).rejects.toThrow(/Invalid Anthropic API key/);
    expect(admin.tables["workspace_ai_keys"]).toHaveLength(0);
  });

  it("refresh re-fetches the live list and flags a model the key no longer offers", async () => {
    const { listWorkspaceAiModels } = await import("@/lib/ai-keys.server");
    const admin = fakeAdmin({ workspace_ai_keys: [await directRow("openai", OPENAI_KEY, "model-old")] });
    let ids = ["model-old", "model-new"];
    const f = (async () => openAiList(ids)) as unknown as typeof fetch;
    const first = await listWorkspaceAiModels(admin, "w1", "openai", f);
    expect(first.ok && first.selectedAvailable).toBe(true);
    ids = ["model-new"];
    const second = await listWorkspaceAiModels(admin, "w1", "openai", f);
    expect(second.ok && second.models.map((m) => m.id)).toEqual(["model-new"]);
    expect(second.ok && second.selectedAvailable).toBe(false);
    expect(second.selectedModel).toBe("model-old"); // flagged, not replaced
  });

  it("refresh with a revoked key marks the connection invalid", async () => {
    const { listWorkspaceAiModels } = await import("@/lib/ai-keys.server");
    const admin = fakeAdmin({ workspace_ai_keys: [await directRow("anthropic", CLAUDE_KEY, "claude-x")] });
    const r = await listWorkspaceAiModels(admin, "w1", "anthropic", (async () => json({}, 401)) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, reason: "invalid_key" });
    expect(admin.tables["workspace_ai_keys"]![0]!["status"]).toBe("invalid");
  });

  it("selecting persists the exact provider + model id, and rejects models the key lacks", async () => {
    const { selectWorkspaceAiModel } = await import("@/lib/ai-keys.server");
    const admin = fakeAdmin({ workspace_ai_keys: [await directRow("anthropic", CLAUDE_KEY, "")] });
    const f = (async () => json({ data: [{ id: "claude-x-20260101", display_name: "Claude X" }], has_more: false })) as unknown as typeof fetch;
    const info = await selectWorkspaceAiModel(admin, { workspaceId: "w1", provider: "anthropic", model: "claude-x-20260101" }, f);
    expect(info.model).toBe("claude-x-20260101");
    expect(admin.tables["workspace_ai_keys"]![0]).toMatchObject({ workspace_id: "w1", provider: "anthropic", model: "claude-x-20260101" });
    await expect(
      selectWorkspaceAiModel(admin, { workspaceId: "w1", provider: "anthropic", model: "claude-made-up" }, f),
    ).rejects.toThrow(/not available/);
    expect(admin.tables["workspace_ai_keys"]![0]!["model"]).toBe("claude-x-20260101");
  });

  it("reports not connected without calling any provider", async () => {
    const { listWorkspaceAiModels } = await import("@/lib/ai-keys.server");
    const f = vi.fn();
    const r = await listWorkspaceAiModels(fakeAdmin({ workspace_ai_keys: [] }), "w1", "openai", f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, reason: "not_connected" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("provider switching and the campaign's model", () => {
  it("campaign config stores provider + exact model, and never keeps a model without a provider", () => {
    expect(defaultAiConfig().model).toBeNull();
    expect(normalizeAiConfig({ provider: "anthropic", model: " claude-x " }).model).toBe("claude-x");
    expect(normalizeAiConfig({ model: "claude-x" }).model).toBeNull();
    expect(configSchema.parse({ ...defaultAiConfig(), provider: "openai", model: "model-a" }).model).toBe("model-a");
  });

  it("uses the selected provider's key and model, switching back and forth", async () => {
    const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
    const admin = fakeAdmin({
      workspace_ai_keys: [await directRow("openai", OPENAI_KEY, "model-a"), await directRow("anthropic", CLAUDE_KEY, "claude-x")],
    });
    expect(await workspaceAiCredentials(admin, "w1", "anthropic", null)).toMatchObject({ provider: "anthropic", apiKey: CLAUDE_KEY, model: "claude-x" });
    expect(await workspaceAiCredentials(admin, "w1", "openai", null)).toMatchObject({ provider: "openai", apiKey: OPENAI_KEY, model: "model-a" });
    expect(await workspaceAiCredentials(admin, "w1", "anthropic", "claude-y")).toMatchObject({ model: "claude-y" });
  });

  it("never falls back to another provider", async () => {
    const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
    const admin = fakeAdmin({ workspace_ai_keys: [await directRow("openai", OPENAI_KEY, "model-a")] });
    expect(await workspaceAiCredentials(admin, "w1", "anthropic", "claude-x")).toBeNull();
  });
});

describe("generation uses exactly the selected model", () => {
  const cfg = () => normalizeAiConfig({ fields: ["first_name", "company"], fallbackMode: "fallback_text" });
  const lead = { id: "l1", email: "a@b.com", first_name: "Ana", company: "Acme" };

  it("Claude: sends the selected model id to /v1/messages", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return json({ content: [{ type: "text", text: "Saw Acme's launch." }] });
    }) as unknown as typeof fetch;
    const { generatePersonalization } = await import("@/lib/ai-personalization.server");
    const r = await generatePersonalization(cfg(), lead, { provider: "anthropic", apiKey: CLAUDE_KEY, model: "claude-x-20260101" });
    expect(bodies[0]!["model"]).toBe("claude-x-20260101");
    expect(r.model).toBe("claude-x-20260101");
  });

  it("ChatGPT: sends the selected model id to OpenAI", async () => {
    const bodies: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      bodies.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return json({ id: "c1", object: "chat.completion", created: 1, model: "model-a", choices: [{ index: 0, message: { role: "assistant", content: "Saw Acme's launch." }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    }) as unknown as typeof fetch;
    const { generatePersonalization } = await import("@/lib/ai-personalization.server");
    await generatePersonalization(cfg(), lead, { provider: "openai", apiKey: OPENAI_KEY, model: "model-a" });
    expect(bodies[0]!.url).toContain("api.openai.com/v1/chat/completions");
    expect(bodies[0]!.body["model"]).toBe("model-a");
  });

  it("refuses to generate when no model is selected — no default is invented", async () => {
    const f = vi.fn();
    globalThis.fetch = f as unknown as typeof fetch;
    const { generatePersonalization, AiGatewayError } = await import("@/lib/ai-personalization.server");
    const err = await generatePersonalization(cfg(), lead, { provider: "anthropic", apiKey: CLAUDE_KEY, model: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiGatewayError);
    expect(err.status).toBe(409);
    expect(err.message).toMatch(/No Claude model is selected/);
    expect(f).not.toHaveBeenCalled();
  });

  it("an unavailable model is a clear terminal error, not a silent swap", async () => {
    const models: string[] = [];
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      models.push(String(JSON.parse(String(init.body))["model"]));
      return json({ type: "error", error: { type: "not_found_error", message: "model: claude-gone" } }, 404);
    }) as unknown as typeof fetch;
    const { generatePersonalization } = await import("@/lib/ai-personalization.server");
    const err = await generatePersonalization(cfg(), lead, { provider: "anthropic", apiKey: CLAUDE_KEY, model: "claude-gone" }).catch((e) => e);
    expect(err.status).toBe(404);
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("claude-gone");
    expect(err.message).toMatch(/Refresh models/);
    expect(models).toEqual(["claude-gone"]);
  });
});

describe("selector scope and subscription restrictions", () => {
  it("the AI selector only accepts ChatGPT and Claude — never email-sending providers", () => {
    for (const p of ["resend", "ses", "sendgrid", "mailgun", "brevo", "uspeedo", "nuntly", "elastic_email", "maileroo", "courier"]) {
      expect(normalizeAiConfig({ provider: p }).provider).toBeNull();
      expect(() => configSchema.parse({ ...defaultAiConfig(), provider: p })).toThrow();
    }
  });

  it("the Integrations entries no longer take a free-text model", () => {
    for (const slug of ["openai", "claude"]) {
      expect(INTEGRATIONS_BY_SLUG[slug]!.fields.some((f) => f.key === "model")).toBe(false);
    }
  });

  it("an Integrations-tab key on a paid-only integration is unavailable on the Free plan", async () => {
    vi.doMock("@/lib/integrations.server", () => ({
      workspaceHasPaidPlan: async () => false,
      loadCredentials: async () => ({ api_key: CLAUDE_KEY }),
    }));
    const { integrationAiKeys } = await import("@/lib/ai-integration-keys.server");
    const admin = fakeAdmin({
      integration_connections: [{ id: "c1", workspace_id: "w1", slug: "claude", status: "connected", config: { model: "claude-x" } }],
      integrations: [{ slug: "claude", is_enabled: true, requires_paid_plan: true }],
    });
    expect(await integrationAiKeys(admin, "w1")).toEqual([]);
    vi.doUnmock("@/lib/integrations.server");
  });

  it("an Integrations-tab key keeps its exact model on a paid plan", async () => {
    vi.resetModules();
    vi.doMock("@/lib/integrations.server", () => ({
      workspaceHasPaidPlan: async () => true,
      loadCredentials: async () => ({ api_key: CLAUDE_KEY }),
    }));
    const { integrationAiKeys } = await import("@/lib/ai-integration-keys.server");
    const admin = fakeAdmin({
      integration_connections: [{ id: "c1", workspace_id: "w1", slug: "claude", status: "connected", config: { model: "claude sonnet typed by hand" } }],
      integrations: [{ slug: "claude", is_enabled: true, requires_paid_plan: true }],
    });
    const [k] = await integrationAiKeys(admin, "w1");
    expect(k).toMatchObject({ provider: "anthropic", model: "claude sonnet typed by hand" });
    vi.doUnmock("@/lib/integrations.server");
  });
});
