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
