import { describe, expect, it } from "vitest";

import { extractSignals, roleFamily, isBlankValue } from "@/lib/ai-lead-signals";
import { lintStep, normalizeWriterState, writerStepSchema, strategySchema } from "@/lib/ai-campaign-writer-model";
import { leadFacts, buildPrompt, roleHint } from "@/lib/ai-personalization.server";
import { defaultAiConfig } from "@/lib/ai-personalization-model";

const lead = (extra: Record<string, unknown> = {}) => ({
  id: "l1",
  email: "a@b.co",
  first_name: "Sarah",
  company: "Acme",
  job_title: "CFO",
  custom_fields: {},
  ...extra,
});

describe("lead signals", () => {
  it("recognises funding, revenue, tech stack and headcount under common column names", () => {
    const { signals } = extractSignals({
      "Last Funding Round": "Series A",
      annual_revenue: "$20M",
      Technologies: "HubSpot, Salesforce",
      employee_count: "85",
    });
    const kinds = signals.map((s) => s.kind);
    expect(kinds).toEqual(expect.arrayContaining(["funding_round", "revenue", "tech_stack", "employees"]));
    expect(signals.find((s) => s.kind === "revenue")!.handling).toBe("indirect");
  });

  it("skips empty and placeholder values instead of inventing anything", () => {
    expect(extractSignals({ funding_round: "N/A", technologies: "", revenue: "unknown" }).signals).toEqual([]);
    expect(isBlankValue("-")).toBe(true);
  });

  it("drops bare LinkedIn URLs", () => {
    expect(extractSignals({ linkedin_url: "https://linkedin.com/in/x" }).signals).toEqual([]);
  });

  it("maps job titles to role families", () => {
    expect(roleFamily("CFO")).toBe("finance");
    expect(roleFamily("VP Sales")).toBe("sales");
    expect(roleFamily("Head of HR")).toBe("people");
    expect(roleFamily("CTO")).toBe("technical");
    expect(roleFamily("Co-Founder & CEO")).toBe("founder_ceo");
    expect(roleFamily("VP Marketing")).toBe("marketing");
    expect(roleFamily("")).toBe("other");
  });
});

describe("personalization facts and prompt", () => {
  const fields = ["first_name", "job_title", "company", "company_description", "custom_fields"] as const;

  it("puts real signals into the facts and marks revenue as sensitive", () => {
    const facts = leadFacts(
      lead({ custom_fields: { funding_round: "Series B", annual_revenue: "$20M", tech_stack: "HubSpot" } }) as never,
      [...fields],
      "light",
    );
    const labels = facts.map((f) => f.label);
    expect(labels).toContain("Funding round");
    expect(labels).toContain("Technology stack");
    expect(labels.some((l) => l.startsWith("Annual revenue (sensitive"))).toBe(true);
  });

  it("never lists missing fields", () => {
    const facts = leadFacts(lead({ company: "", custom_fields: { funding_round: "" } }) as never, [...fields], "deep");
    expect(facts.map((f) => f.label)).not.toContain("Company");
    expect(facts.map((f) => f.label)).not.toContain("Funding round");
  });

  it("steers the angle by role and forbids fabrication", () => {
    const facts = leadFacts(lead() as never, [...fields], "balanced");
    expect(roleHint(facts)).toMatch(/Finance/);
    const { system, prompt } = buildPrompt(defaultAiConfig(), facts);
    expect(system).toMatch(/Never invent a round/);
    expect(system).toMatch(/never quote the figure/);
    expect(prompt).toMatch(/Role angle: Finance/);
  });
});

describe("writer self-review", () => {
  it("flags generic openers, spam subjects and length", () => {
    const issues = lintStep(
      { subject: "Exclusive Opportunity to Revolutionize Your Business!", body: "I hope you're doing well. " + "word ".repeat(200) },
      { style: "Short" },
    );
    expect(issues.join(" ")).toMatch(/hope you're doing well/);
    expect(issues.join(" ")).toMatch(/Too long/);
    expect(issues.join(" ")).toMatch(/exclamation/);
  });

  it("passes a concise, natural email", () => {
    expect(
      lintStep(
        { subject: "reorders at {{company}}", body: "Hi {{first_name}},\n\nQuick one on reorders.\n\nOpen to taking a look?" },
        { style: "Balanced" },
      ),
    ).toEqual([]);
  });

  it("flags follow-ups that copy the first email", () => {
    const body =
      "Restaurants struggle with delayed supplier reorders because kitchens track inventory manually across locations every single evening before closing.";
    expect(lintStep({ subject: "follow up", body }, { style: "Balanced", previous: [{ body }] }).join(" ")).toMatch(
      /Too similar/,
    );
  });

  it("keeps older saved campaigns loading without the new fields", () => {
    expect(writerStepSchema.parse({ purpose: "p", subject: "s", body: "b" }).subjectOptions).toEqual([]);
    const s = strategySchema.parse({
      angle: "a", valueProposition: "v", painPoint: "p", offer: "o", ctaStrategy: "c", tone: "t", messagingStyle: "m",
    });
    expect(s.recommendedFollowUps).toBeNull();
    expect(normalizeWriterState({ steps: [{ purpose: "p", subject: "s", body: "b", waitDays: 0 }] }).steps).toHaveLength(1);
  });
});
