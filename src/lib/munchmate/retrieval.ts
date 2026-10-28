/**
 * MunchMate retrieval (pure, client-safe). Keyword scoring over approved
 * public knowledge chunks — no customer data ever reaches this module.
 */
export type KnowledgeDoc = {
  key: string;
  title: string;
  url: string | null;
  content: string;
};

export type ScoredChunk = KnowledgeDoc & { score: number; chunk: string };

const STOP = new Set(
  "a an the and or of to in on for with by is are was be do does how i my me we you your it this that can what why when where which from at as so if not no yes our get use using".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

export function chunkText(text: string, size = 900): string[] {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const parts = clean.split(/\n{2,}|(?<=\.)\s+/);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).length > size && cur) {
      out.push(cur.trim());
      cur = p;
    } else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Top-k chunks. Title matches weigh 3x; returns only chunks with a real match. */
export function retrieve(query: string, docs: KnowledgeDoc[], k = 5, minScore = 1.5): ScoredChunk[] {
  const q = Array.from(new Set(tokenize(query)));
  if (q.length === 0) return [];
  const df = new Map<string, number>();
  const prepared = docs.flatMap((d) =>
    chunkText(d.content).map((chunk) => {
      const toks = new Set(tokenize(`${d.title} ${chunk}`));
      for (const t of q) if (toks.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
      return { d, chunk, toks, titleToks: new Set(tokenize(d.title)) };
    }),
  );
  const n = Math.max(prepared.length, 1);
  const scored: ScoredChunk[] = [];
  for (const p of prepared) {
    let score = 0;
    for (const t of q) {
      if (!p.toks.has(t)) continue;
      const idf = Math.log(1 + n / (df.get(t) ?? 1));
      score += idf * (p.titleToks.has(t) ? 3 : 1);
    }
    if (score >= minScore) scored.push({ ...p.d, chunk: p.chunk, score });
  }
  scored.sort((a, b) => b.score - a.score);
  // One chunk per doc keeps sources diverse.
  const seen = new Set<string>();
  return scored.filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true))).slice(0, k);
}

export const FALLBACK_ANSWER =
  "I don't have confirmed information about that. Let me connect you with our support team.";

const HUMAN_RE =
  /\b(human|agent|real person|support team|talk to (someone|support)|create (a )?ticket|contact support)\b/i;
const PROBLEM_RE =
  /\b(error|bug|broken|not working|doesn'?t work|failed|failing|crash|stuck|can'?t|cannot|issue|problem|charged|refund)\b/i;

/** Whether the chat should surface ticket / human-support actions. */
export function shouldOfferTicket(userText: string, reply: string, hits: number): boolean {
  return hits === 0 || HUMAN_RE.test(userText) || PROBLEM_RE.test(userText) || reply.includes("connect you with our support team");
}

/** Strip HTML/script from model output; keep plain markdown-lite text. */
export function sanitizeOutput(text: string, maxChars = 4000): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/javascript:/gi, "")
    .trim()
    .slice(0, maxChars);
}

/** Only MunchReach links are rendered clickable in the widget. */
export function isAllowedLink(href: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    const u = new URL(href);
    return u.protocol === "https:" && /(^|\.)munchreach\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}
