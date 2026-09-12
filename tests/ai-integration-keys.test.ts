import { describe, expect, it } from "vitest";

import { interpretModelName } from "@/lib/ai-integration-keys.server";

describe("free-text model names from the Integrations tab", () => {
  it("keeps an exact model id", () => {
    expect(interpretModelName("anthropic", "claude-sonnet-4-5")).toBe("claude-sonnet-4-5");
    expect(interpretModelName("openai", "gpt-4o")).toBe("gpt-4o");
  });

  it("maps a family name typed by hand to a real model", () => {
    expect(interpretModelName("anthropic", "claude sonnet 5")).toBe("claude-sonnet-4-5");
    expect(interpretModelName("anthropic", "Claude Opus")).toBe("claude-opus-4-1");
  });

  it("falls back to the provider default when nothing matches", () => {
    expect(interpretModelName("anthropic", "")).toBe("claude-haiku-4-5");
    expect(interpretModelName("anthropic", "some-unknown-model")).toBe("claude-haiku-4-5");
    expect(interpretModelName("openai", null)).toBe("gpt-4o-mini");
  });

  it("never returns a model from the other provider", () => {
    expect(interpretModelName("openai", "claude sonnet")).toBe("gpt-4o-mini");
    expect(interpretModelName("anthropic", "gpt-4o")).toBe("claude-haiku-4-5");
  });
});
