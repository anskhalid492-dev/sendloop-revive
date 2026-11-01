import { z } from "zod";

export const MESSAGE_LIMIT = 4000;
export const CHAT_ERROR = "I'm having trouble answering right now. Please try again, or contact support.";
export const LONG_MESSAGE_ERROR = "Please keep your message within 4,000 characters. Your question hasn't been sent.";
export type ContextTurn = { role: "user" | "assistant"; content: string };

/** Only the request copy is compacted; browser history and ticket transcripts stay intact. */
export function compactHistory(messages: ContextTurn[], smaller = false): ContextTurn[] {
  const latest = messages.findLastIndex((m) => m.role === "user");
  if (latest < 0) return [];
  if (messages[latest].content.length > MESSAGE_LIMIT) throw new Error(LONG_MESSAGE_ERROR);
  const last = messages[latest];
  let budget = smaller ? 2000 : 10000;
  const older: ContextTurn[] = [];
  for (let i = latest - 1; i >= 0 && older.length < (smaller ? 2 : 11) && budget > 0; i--) {
    const m = messages[i];
    const content = m.content.slice(0, Math.min(MESSAGE_LIMIT, smaller ? 1000 : 2000, budget));
    if (!content.trim()) continue;
    older.unshift({ role: m.role, content });
    budget -= content.length;
  }
  // Claude expects the conversation to start with the user.
  while (older[0]?.role === "assistant") older.shift();
  return [...older, { ...last }];
}

const turn = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(MESSAGE_LIMIT) });
export const chatInputSchema = z.object({ messages: z.array(turn).min(1).max(30), page: z.string().max(300).optional() });
const transportSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1).max(1000),
  page: z.string().max(300).optional(),
});

export function parseChatInput(input: unknown) {
  const transport = transportSchema.parse(input);
  return chatInputSchema.parse({ ...transport, messages: compactHistory(transport.messages) });
}

export function splitSystem(system: string): string[] {
  const blocks: string[] = [];
  for (let i = 0; i < system.length; i += MESSAGE_LIMIT) blocks.push(system.slice(i, i + MESSAGE_LIMIT));
  return blocks;
}

/** Preserve the opening summary, then use the most relevant passages, not whole articles. */
export function relevantExcerpt(text: string, question: string, max = 1200): string {
  if (text.length <= max) return text;
  const words = new Set(question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const passages = text.match(/[\s\S]{1,500}/g) ?? [];
  const ranked = passages.map((p, i) => ({ p, i, score: [...words].filter((w) => p.toLowerCase().includes(w)).length }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const selected = new Set([0]);
  let used = passages[0]?.length ?? 0;
  for (const item of ranked) {
    if (selected.has(item.i)) continue;
    if (used + item.p.length > max) continue;
    selected.add(item.i);
    used += item.p.length;
  }
  return [...selected].sort((a, b) => a - b).map((i) => passages[i]).join("\n…\n").slice(0, max);
}

export function isContextValidationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; message?: string; name?: string };
  return (e.name === "ZodError" || [400, 413, 422].includes(e.status ?? 0)) &&
    /too_big|at most|too (?:long|large)|context|token|length|validation|max(?:imum)?|4000/i.test(e.message ?? "");
}