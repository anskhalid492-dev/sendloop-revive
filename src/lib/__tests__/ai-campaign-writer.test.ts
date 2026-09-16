import { describe, expect, it } from "vitest";

import {
  defaultBrief,
  defaultControls,
  emptyWriterState,
  normalizeWriterState,
  sanitizeVariables,
  stepPurposes,
  writerStateSchema,
} from "@/lib/ai-campaign-writer-model";

describe("AI campaign writer model", () => {
  it("keeps only variables the platform supports", () => {
    expect(sanitizeVariables("Hi {{first_name}} at {{company}}")).toBe(
      "Hi {{first_name}} at {{company}}",
    );
    // Invented variables must not survive into a sequence.
    expect(sanitizeVariables("Saw your {{funding_round}} news")).toBe("Saw your funding_round news");
    expect(sanitizeVariables("{{ First_Name }}")).toBe("{{first_name}}");
    expect(sanitizeVariables("Unsubscribe: {{unsubscribe_link}}")).toBe(
      "Unsubscribe: {{unsubscribe_link}}",
    );
  });

  it("gives every sequence step its own purpose", () => {
    for (const count of [3, 4, 5, 6, 7]) {
      const purposes = stepPurposes(count);
      expect(purposes).toHaveLength(count);
      expect(new Set(purposes).size).toBe(count);
      expect(purposes[0]).toMatch(/Open the conversation/);
      expect(purposes[count - 1]).toMatch(/Low-pressure close/);
    }
  });

  it("falls back to an empty state when saved data is unusable", () => {
    expect(normalizeWriterState(null)).toEqual(emptyWriterState());
    expect(normalizeWriterState({ steps: "nope" })).toEqual(emptyWriterState());
  });

  it("round-trips a saved state", () => {
    const state = {
      ...emptyWriterState(),
      brief: defaultBrief(),
      controls: defaultControls(),
      steps: [{ purpose: "Open", subject: "Hi", body: "Body", waitDays: 0 }],
    };
    expect(writerStateSchema.parse(state).steps).toHaveLength(1);
  });

  it("defaults to a four step campaign", () => {
    expect(defaultControls().steps).toBe(4);
    expect(defaultControls().tone).toBe("Professional");
  });
});

describe("follow-up count, pain points and recreate", () => {
  it("turns the follow-up count into the total number of emails", () => {
    expect(totalSteps({ followUps: 0 })).toBe(1);
    expect(totalSteps({ followUps: 3 })).toBe(4);
    expect(totalSteps({ followUps: 99 })).toBe(MAX_SEQUENCE_STEPS);
  });

  it("keeps pain point variables intact in generated copy", () => {
    const text = "One thing I noticed is {{pain_point}}, plus {{PAIN_POINT_3}} and {{made_up}}.";
    const out = sanitizeVariables(text);
    expect(out).toContain("{{pain_point}}");
    expect(out).toContain("{{pain_point_3}}");
    expect(out).not.toContain("{{made_up}}");
  });

  it("names one token per pain point slot", () => {
    expect(painPointToken(1)).toBe("pain_point");
    expect(painPointToken(4)).toBe("pain_point_4");
  });

  it("counts the pain point slots a template actually uses", () => {
    expect(painPointSlotsUsed("hello")).toBe(0);
    expect(painPointSlotsUsed("{{pain_point}} and {{pain_point_2}}")).toBe(2);
    expect(painPointSlotsUsed("{{ pain_point_5 }}")).toBe(5);
  });

  it("gives each lead their own pain point, never one shared line", () => {
    const config = { ...defaultAiConfig(), painPointsPerLead: 2, painPointFallback: "rising costs" };
    const a = aiExtras(config, { content: "Saw your new menu", painPoints: ["slow reorders", "no repeat customers"] });
    const b = aiExtras(config, { content: "Saw your new site", painPoints: ["thin margins", "empty midweek covers"] });
    expect(a.extras["pain_point"]).toBe("slow reorders");
    expect(b.extras["pain_point"]).toBe("thin margins");
    expect(a.extras["pain_point_2"]).toBe("no repeat customers");
    expect(b.extras["pain_point_2"]).toBe("empty midweek covers");
  });

  it("falls back rather than shipping a raw variable when a lead has no pain point", () => {
    const config = { ...defaultAiConfig(), painPointsPerLead: 1, painPointFallback: "rising costs" };
    const out = aiExtras(config, { content: "Hi", painPoints: [] });
    expect(out.extras["pain_point"]).toBe("rising costs");
  });
});
