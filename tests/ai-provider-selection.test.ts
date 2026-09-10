import { describe, expect, it } from "vitest";

import { defaultAiConfig, normalizeAiConfig } from "@/lib/ai-personalization-model";
import { configSchema } from "@/lib/ai-personalization-schemas";

describe("campaign AI provider selection", () => {
  it("defaults to automatic (whatever the workspace connected)", () => {
    expect(defaultAiConfig().provider).toBeNull();
    // Existing campaigns saved before the selector existed keep working.
    expect(normalizeAiConfig({ tone: "friendly" }).provider).toBeNull();
  });

  it("persists a real provider choice and rejects anything else", () => {
    expect(normalizeAiConfig({ provider: "anthropic" }).provider).toBe("anthropic");
    expect(normalizeAiConfig({ provider: "openai" }).provider).toBe("openai");
    // Email-sending providers must never leak into the AI selector.
    expect(normalizeAiConfig({ provider: "resend" }).provider).toBeNull();
  });

  it("accepts the provider through the saved-settings schema", () => {
    const base = { ...defaultAiConfig(), provider: "anthropic" as const };
    expect(configSchema.parse(base).provider).toBe("anthropic");
    expect(configSchema.parse({ ...base, provider: null }).provider).toBeNull();
    expect(() => configSchema.parse({ ...base, provider: "sendgrid" })).toThrow();
  });
});

describe("workspace AI credentials", () => {
  const rows = [
    { provider: "openai", model: "gpt-4o-mini", key_ciphertext: "openai", status: "verified" },
    {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      key_ciphertext: "anthropic",
      status: "verified",
    },
  ];

  const adminWith = (data: typeof rows) => ({
    from: () => ({ select: () => ({ eq: async () => ({ data }) }) }),
  });

  it("uses the provider the campaign selected", async () => {
    const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
    const { encryptCredentials } = await import("@/lib/provider-credentials.server");
    const encrypted = rows.map((r) => ({
      ...r,
      key_ciphertext: encryptCredentials({ api_key: `key-${r.provider}` }),
    }));

    const claude = await workspaceAiCredentials(adminWith(encrypted), "w1", "anthropic");
    expect(claude?.provider).toBe("anthropic");
    expect(claude?.apiKey).toBe("key-anthropic");

    const openai = await workspaceAiCredentials(adminWith(encrypted), "w1", "openai");
    expect(openai?.provider).toBe("openai");
  });

  it("falls back to a connected provider when the selected one has no key", async () => {
    const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
    const { encryptCredentials } = await import("@/lib/provider-credentials.server");
    const onlyOpenAi = [
      { ...rows[0]!, key_ciphertext: encryptCredentials({ api_key: "key-openai" }) },
    ];
    const creds = await workspaceAiCredentials(adminWith(onlyOpenAi), "w1", "anthropic");
    expect(creds?.provider).toBe("openai");
  });

  it("returns null when nothing is connected", async () => {
    const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
    expect(await workspaceAiCredentials(adminWith([]), "w1", "openai")).toBeNull();
  });
});
