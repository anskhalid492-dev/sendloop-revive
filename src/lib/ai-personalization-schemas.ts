import { z } from "zod";

export const configSchema = z.object({
  level: z.enum(["light", "balanced", "deep"]),
  framework: z
    .enum([
      "offer_driven",
      "challenger",
      "problem_solution",
      "aida",
      "before_after_bridge",
      "question_led",
      "social_proof",
      "straight_to_point",
    ])
    .optional(),
  tone: z.enum(["professional", "friendly", "direct", "conversational", "curious"]),
  length: z.enum(["one_line", "two_lines", "short_paragraph"]),

  language: z.string().min(2).max(40),
  instructions: z.string().max(4000),
  fields: z.array(z.string()).max(20),
  exampleOutput: z.string().max(2000),
  fallbackMode: z.enum(["fallback_text", "skip", "hold"]),
  fallbackText: z.string().max(600),
  // Which connected AI provider generates this campaign's lines.
  provider: z.enum(["openai", "anthropic"]).nullable().optional(),
  // Exact model id for that provider, as returned by its Models API.
  model: z.string().trim().max(200).nullable().optional(),
});

export const campaignInput = z.object({ campaignId: z.string().uuid() });