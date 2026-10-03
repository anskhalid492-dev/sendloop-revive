/**
 * Pure prompt building for the customer-key Inbox AI features:
 *  - AI Reply (conversation composer)
 *  - AI Email Composer (New Email composer)
 *
 * Both run on the workspace's OWN connected AI provider. This module never
 * imports the MunchReach AI Sales Agent provider (separate billing/credentials).
 */

export type ThreadMessage = {
  direction: string;
  from_name: string | null;
  from_email: string;
  body: string | null;
  occurred_at: string | null;
  sending_account_id?: string | null;
};

export type ReplyContext = {
  prospectEmail: string;
  subject: string | null;
  lead: { first_name?: string | null; last_name?: string | null; company?: string | null; job_title?: string | null } | null;
  messages: ThreadMessage[];
  instruction?: string | null;
};

/* ---------------------------------------------------------------- greeting */

const GENERIC_LOCAL_PARTS = /^(info|sales|hello|hi|contact|support|admin|office|team|mail|enquiries|inquiries|help|noreply|no-reply|billing|accounts|hr|marketing)$/i;

function cleanName(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s || s.includes("@") || /[<>{}\[\]]/.test(s) || /\d{2,}/.test(s)) return "";
  return s;
}

/** First word of a real person's name (never derived from an email address). */
export function firstNameFrom(value: string | null | undefined): string {
  const s = cleanName(value);
  if (!s) return "";
  const first = s.split(/\s+/)[0]!.replace(/[^\p{L}'-]/gu, "");
  if (!first || first.length < 2 || GENERIC_LOCAL_PARTS.test(first)) return "";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * Greeting priority: lead first name → prospect's own display name in the thread
 * → company name → "Hi there,". Never invents and never uses an email address.
 */
export function resolveGreeting(ctx: Pick<ReplyContext, "lead" | "messages" | "prospectEmail">): { greeting: string; source: "first_name" | "display_name" | "company" | "none" } {
  const fromLead = firstNameFrom(ctx.lead?.first_name);
  if (fromLead) return { greeting: `Hi ${fromLead},`, source: "first_name" };
  const prospect = ctx.prospectEmail.toLowerCase();
  const inbound = [...ctx.messages].reverse().find((m) => m.direction === "inbound" && m.from_email.toLowerCase() === prospect && cleanName(m.from_name));
  const fromDisplay = firstNameFrom(inbound?.from_name);
  if (fromDisplay) return { greeting: `Hi ${fromDisplay},`, source: "display_name" };
  const company = cleanName(ctx.lead?.company);
  if (company) return { greeting: `Hi ${company},`, source: "company" };
  return { greeting: "Hi there,", source: "none" };
}

/* ---------------------------------------------------------------- intent */

export type ProspectIntent = "unsubscribe" | "human" | "not_interested" | "normal";

export function detectIntent(latestInbound: string): ProspectIntent {
  const t = latestInbound.toLowerCase();
  if (/\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|opt[ -]?out|do not (email|contact)|don't (email|contact))\b/.test(t)) return "unsubscribe";
  if (/\b(speak|talk) (to|with) (a |an )?(human|real person|person|someone|manager)\b|\breal person\b|\bare you (a )?(bot|robot|ai)\b/.test(t)) return "human";
  if (/\b(not interested|no thanks|no thank you|not a fit|we'?re all set|not right now|pass on this)\b/.test(t)) return "not_interested";
  return "normal";
}

/* ---------------------------------------------------------------- shared rules */

export const HUMAN_STYLE_RULES = [
  "Write like a real salesperson quickly typing a thoughtful email — short natural sentences, short paragraphs, plain words.",
  "Never use: 'I hope this email finds you well', 'I hope you are doing well', 'I'd be happy to assist', 'Thank you for your valuable', 'We are excited to', 'Don't hesitate to reach out', 'Feel free to reach out', 'synergy', 'leverage', 'circle back', 'touch base'.",
  "No corporate jargon, no marketing hype, no excessive enthusiasm, at most one exclamation mark.",
  "Do not summarise the conversation back to the prospect and do not repeat what they already know.",
  "Plain text only. No markdown, no bullet or numbered lists (write in sentences), no placeholders like [Name] or {{...}}.",
];

export const FACT_RULES = [
  "Never invent pricing, discounts, features, integrations, production or delivery times, guarantees, results, meetings, payments or completed actions.",
  "Only use facts that appear in the conversation, the contact details given, or the rep's own text. If something needed is missing, do not guess — offer to confirm it.",
  "Never invent a sender name, phone number, job title, address, website or credentials.",
  "Never promise deliverables, offers or timelines that US has not already offered in the thread — no free samples, sample kits, mockups, dielines, PDFs, quotes, 'today'/'within 24 hours' or similar unless already offered earlier. Don't recommend specific materials or options nobody mentioned.",
  "Ask at most one or two short questions, and only for what is genuinely needed for the next step.",
];

/* ---------------------------------------------------------------- AI Reply */

export const REPLY_SYSTEM_PROMPT = [
  "You are drafting the next email reply for a B2B sales rep (US) to a prospect (PROSPECT).",
  "First, silently read the WHOLE thread and work out: what the prospect is asking now, what they already told us, what we already told them, which questions were already answered, any objections or requirements, and their current intent. Do not output this analysis.",
  "Then write only the reply body.",
  "Structure (adapt naturally, not a fixed template): greeting line, a direct answer to the prospect's latest message FIRST, any genuinely useful context, then a natural next step or question only if it fits, then a short sign-off word on its own line.",
  "Answer first, sell second. A simple question gets a simple answer — do not turn it into a pitch. Do not force a call-to-action.",
  "Never ask for information the prospect already gave earlier in the thread (company, product, quantity, size, timeline, budget, preferences) — use it.",
  "Match the prospect's formality and the tone we have used before. Pick ONE sign-off that fits (e.g. 'Best,', 'Thanks,', 'Cheers,', 'Best regards,', 'Warm regards,'). If we signed off a certain way before, keep it.",
  "Do NOT write a name, title, company or contact details after the sign-off — the rep's mailbox signature is added separately.",
  ...HUMAN_STYLE_RULES,
  ...FACT_RULES,
].join("\n");

const INTENT_GUIDANCE: Record<ProspectIntent, string> = {
  unsubscribe:
    "The prospect asked to stop receiving emails. Write ONLY a brief, polite confirmation that they will not be contacted again. No selling, no questions, no links.",
  human:
    "The prospect wants a real person. Reply briefly and personally as the rep, acknowledge it plainly and address their point. Do not claim to be or not be an AI, do not promise a call or meeting that has not been arranged.",
  not_interested:
    "The prospect is not interested. Respect it: a short, gracious reply with no pitch and no pressure. At most leave the door open in one short sentence.",
  normal: "",
};

/** Max messages from the current thread sent to the model (oldest first). */
export const THREAD_MESSAGE_LIMIT = 40;
const PER_MESSAGE_CHARS = 2500;
const THREAD_CHARS = 24_000;

export function formatThread(
  messages: ThreadMessage[],
  cleanBody: (body: string | null) => string = (b) => (b ?? "").trim(),
): string {
  const ordered = [...messages].sort((a, b) => Date.parse(a.occurred_at ?? "") - Date.parse(b.occurred_at ?? ""));
  const blocks = ordered.map((m, i) => {
    const who = m.direction === "inbound" ? "PROSPECT" : "US";
    const when = m.occurred_at ? ` — ${m.occurred_at.slice(0, 16).replace("T", " ")} UTC` : "";
    const latest = i === ordered.length - 1 ? " [LATEST]" : "";
    const text = cleanBody(m.body).slice(0, PER_MESSAGE_CHARS) || "(no text)";
    return `#${i + 1} ${who}${when}${latest}\n${text}`;
  });
  // Keep the newest messages when the thread is very long.
  let out: string[] = [];
  let size = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    size += blocks[i]!.length;
    if (size > THREAD_CHARS && out.length) break;
    out.unshift(blocks[i]!);
  }
  if (out.length < blocks.length) out = [`(${blocks.length - out.length} earlier messages omitted for length)`, ...out];
  return out.join("\n\n---\n\n");
}

export function buildReplyPrompt(ctx: ReplyContext, cleanBody?: (b: string | null) => string): { system: string; prompt: string; intent: ProspectIntent; greeting: string } {
  const clean = cleanBody ?? ((b: string | null) => (b ?? "").trim());
  const latestInbound = [...ctx.messages]
    .sort((a, b) => Date.parse(a.occurred_at ?? "") - Date.parse(b.occurred_at ?? ""))
    .filter((m) => m.direction === "inbound")
    .pop();
  const intent = detectIntent(clean(latestInbound?.body ?? ""));
  const { greeting } = resolveGreeting(ctx);
  // Defensive: never more than the newest THREAD_MESSAGE_LIMIT messages.
  ctx = { ...ctx, messages: [...ctx.messages].sort((a, b) => Date.parse(a.occurred_at ?? "") - Date.parse(b.occurred_at ?? "")).slice(-THREAD_MESSAGE_LIMIT) };
  const facts = [
    `Prospect email: ${ctx.prospectEmail}`,
    ctx.lead?.first_name ? `Prospect first name: ${ctx.lead.first_name}` : "",
    ctx.lead?.company ? `Company: ${ctx.lead.company}` : "",
    ctx.lead?.job_title ? `Role: ${ctx.lead.job_title}` : "",
    ctx.subject ? `Thread subject: ${ctx.subject}` : "",
  ].filter(Boolean);
  const prompt = [
    "CONTACT",
    ...facts,
    "",
    `Start the reply with exactly this greeting line: "${greeting}"`,
    INTENT_GUIDANCE[intent],
    "",
    `FULL CONVERSATION (${ctx.messages.length} messages, oldest first):`,
    formatThread(ctx.messages, clean) || "(no messages yet)",
    "",
    ctx.instruction ? `Extra instruction from the rep: ${ctx.instruction}` : "",
    "Write the next reply from US to the [LATEST] point in the thread.",
  ]
    .filter((l) => l !== "")
    .join("\n");
  return { system: REPLY_SYSTEM_PROMPT, prompt, intent, greeting };
}

/* ---------------------------------------------------------------- AI Email Composer */

export const COMPOSE_MODES = ["improve", "human", "shorter", "professional", "warmer", "first_touch"] as const;
export type ComposeMode = (typeof COMPOSE_MODES)[number];

export const COMPOSE_MODE_LABELS: Record<ComposeMode, string> = {
  improve: "Improve email",
  human: "Make it more human",
  shorter: "Make it shorter",
  professional: "Make it more professional",
  warmer: "Make it warmer",
  first_touch: "Improve first-touch email",
};

const MODE_INSTRUCTIONS: Record<ComposeMode, string> = {
  improve: "Improve grammar, clarity, flow, readability and tone. Keep the original meaning, offer, facts, call-to-action and intent.",
  human: "Rewrite so it sounds naturally written by a real person: conversational, concise, no AI-style or corporate phrasing, no unnecessary adjectives or generic intros.",
  shorter: "Cut unnecessary words. Keep the key message, important details, context and the call-to-action. Do not drop important details just to be short.",
  professional: "Make it clear, confident, concise and professional — but not robotic or stiff.",
  warmer: "Make it friendlier and more approachable. No fake familiarity and no invented personal details.",
  first_touch:
    "Shape it as a first-contact sales email: natural greeting, a short opening, a clear reason for reaching out, a simple value point, ONE clear call-to-action, natural sign-off. No long intro, no fake compliments, no fake research, never invent how the sender found the prospect, no aggressive selling. Use only what is already in the draft.",
};

export const COMPOSE_SYSTEM_PROMPT = [
  "You edit an email the user already wrote. Return ONLY the rewritten email body — no subject line, no notes, no quotes around it.",
  "Preserve the original meaning, facts, offer, names and call-to-action. Never add new claims, numbers, features, prices, dates, links or personal details that are not in the draft.",
  "Keep any {{...}} tokens (such as a signature token) exactly as written and in place.",
  "Keep the greeting name and sign-off the user wrote; do not add a sender name or signature.",
  ...HUMAN_STYLE_RULES,
  ...FACT_RULES,
].join("\n");

export function buildComposePrompt(input: { mode: ComposeMode; draft: string; recipientEmail?: string | null }): { system: string; prompt: string } {
  return {
    system: COMPOSE_SYSTEM_PROMPT,
    prompt: [
      `TASK: ${MODE_INSTRUCTIONS[input.mode]}`,
      input.recipientEmail ? `Recipient email (do not turn it into a name): ${input.recipientEmail}` : "",
      "",
      "DRAFT:",
      input.draft.slice(0, 8000),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/* ---------------------------------------------------------------- output cleanup */

const SUBJECT_LINE = /^\s*subject\s*:.*\n+/i;

/** Strips wrapper artefacts a model sometimes adds; never adds content. */
export function cleanAiEmail(text: string): string {
  let t = (text ?? "").replace(/\r\n/g, "\n").trim();
  t = t.replace(/^```[a-z]*\n?|```$/g, "").trim();
  t = t.replace(SUBJECT_LINE, "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("“") && t.endsWith("”"))) t = t.slice(1, -1).trim();
  t = t.replace(/\*\*(.+?)\*\*/g, "$1");
  t = t.replace(/\[(your name|name|sender name|company|phone|title)\]/gi, "").replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}
