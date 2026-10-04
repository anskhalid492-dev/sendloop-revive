import { describe, expect, it } from "vitest";
import { WRITER_SYSTEM_TOKENS, sanitizeWriterVariables } from "@/lib/ai-campaign-writer-model";

describe("AI Campaign Writer variable handling", () => {
  it("never offers or keeps {{ai_personalization}}", () => {
    expect(WRITER_SYSTEM_TOKENS).not.toContain("ai_personalization");
    const out = sanitizeWriterVariables("Hi {{first_name}},\n\n{{ai_personalization}} We help {{company}}.");
    expect(out).not.toMatch(/ai_personalization/);
    expect(out).toBe("Hi {{first_name}},\n\nWe help {{company}}.");
    expect(sanitizeWriterVariables("Quick idea {{ AI_Personalization }}")).toBe("Quick idea");
  });

  it("keeps campaign custom variables exactly, including pain_point and fallbacks", () => {
    const out = sanitizeWriterVariables(
      "Seems {{pain_point}} is slowing {{company}}. {{recent_event | your recent news}}",
      ["pain_point", "recent_event"],
    );
    expect(out).toBe("Seems {{pain_point}} is slowing {{company}}. {{recent_event | your recent news}}");
  });

  it("strips invented variables but keeps system ones", () => {
    expect(sanitizeWriterVariables("{{funding_round}} at {{company}}, {{sender_name}}")).toBe(
      "funding_round at {{company}}, {{sender_name}}",
    );
    expect(sanitizeWriterVariables("{{pain_point}} here")).toBe("pain_point here");
  });
});
