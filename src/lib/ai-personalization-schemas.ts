import { z } from "zod";

export const configSchema = z.object({
  level: z.enum(["light", "balanced", "deep"]),
  tone: z.enum(["professional", "friendly", "direct", "conversational", "curious"]),
  length: z.enum(["one_line", "two_lines", "short_paragraph"]),
  language: z.string().min(2).max(40),
  instructions: z.string().max(4000),
  fields: z.array(z.string()).max(20),
  exampleOutput: z.string().max(2000),
  fallbackMode: z.enum(["fallback_text", "skip", "hold"]),
  fallbackText: z.string().max(600),
});

export const campaignInput = z.object({ campaignId: z.string().uuid() });