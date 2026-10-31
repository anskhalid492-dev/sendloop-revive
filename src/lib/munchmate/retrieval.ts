/**
 * MunchMate retrieval (pure, client-safe). Keyword scoring over approved
 * public knowledge chunks with topic expansion — no customer data ever reaches this module.
 */
export type KnowledgeDoc = {
  key: string;
  title: string;
  url: string | null;
  content: string;
};

export type ScoredChunk = KnowledgeDoc & { score: number; chunk: string };

const STOP = new Set(
    "a an the and or of to in on for with by is are was be do does how i my me we you your it this that can what why when where which from at as so if not no yes our get use using munchreach munchmate tell give everything detailed about".split(
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

export function knowledgeIntent(query: string) {
  return {
    overview: /\b(what is munchreach|overview|everything about munchreach|features|how (does )?munchreach (work|help)|cold (email|outreach))\b/i.test(query),
    pricing: /\b(pric(?:e|es|ing)|plans?|affordable|cost|budget|starter|growth|scale|lifetime|free trial|subscription)\b|\$(29|99)\b/i.test(query),
    lifetime: /\blifetime\b|\$(29|99)\b/i.test(query),
  };
}

const TOPICS = [
  ["affordable cost budget pricing price plan subscription lifetime deal", "pricing plan billing"],
  ["warmup reputation deliverability spam inbox placement", "warmup deliverability"],
  ["unibox inbox replies conversations", "inbox reply"],
  ["mailbox mailboxes account smtp imap gmail outlook", "mailbox account"],
  ["campaign sequence automation outreach followup follow-ups", "campaign sequence automation"],
  ["leads contacts csv import verification verify", "lead import verification"],
  ["integration integrations api webhook", "integration api webhook"],
] as const;

/** Topic-aware lexical retrieval. Brand mentions alone never qualify an unrelated question. */
export function retrieve(query: string, docs: KnowledgeDoc[], k = 8, minScore = 1): ScoredChunk[] {
  const intent = knowledgeIntent(query);
  const original = tokenize(query);
  const expanded = TOPICS.filter(([words]) => tokenize(words).some((t) => original.includes(t)))
    .flatMap(([, words]) => tokenize(words));
  const q = Array.from(new Set([...original, ...expanded]));
  if (intent.overview) q.push("overview", "feature", "campaign", "mailbox", "warmup", "lead", "inbox", "api");
  if (q.length === 0) return [];
  const df = new Map<string, number>();
  const prepared = docs.flatMap((d) =>
    chunkText(d.content, d.key.startsWith("pricing:") || d.key === "product:overview" ? 14000 : 1200).map((chunk) => {
      const toks = new Set(tokenize(`${d.title} ${chunk}`));
      for (const t of q) if (toks.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
      return { d, chunk, toks, titleToks: new Set(tokenize(d.title)) };
    }),
  );
  const n = Math.max(prepared.length, 1);
  const scored: ScoredChunk[] = [];
  for (const p of prepared) {
    const authoritative = (intent.pricing && p.d.key.startsWith("pricing:")) || (intent.overview && p.d.key === "product:overview");
    let score = authoritative ? 20 : 0;
    if (intent.lifetime && p.d.url === "/lifetime" && p.d.key.startsWith("pricing:")) score += 10;
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
  return scored.filter((s) => {
    const identity = s.url ?? s.key;
    // Individual plan documents share a destination but contain different necessary limits.
    const key = s.key.startsWith("pricing:") ? s.key : identity;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, k);
}

export function identityAnswer(query: string): string | null {
  return /^(?:are you munchmate|who are you|what(?:'s| is) your name)[?.!\s]*$/i.test(query.trim())
    ? "Yes! I'm MunchMate, your MunchReach sidekick. I'm here to help you explore MunchReach, understand its features and find the right plan. 😊"
    : null;
}

export function sourceLinks(hits: KnowledgeDoc[]) {
  const seen = new Set<string>();
  return hits.flatMap((h) => {
    if (!h.url || !isAllowedLink(h.url) || seen.has(h.url)) return [];
    seen.add(h.url);
    return [{ title: h.title, url: h.url }];
  }).slice(0, 3);
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
