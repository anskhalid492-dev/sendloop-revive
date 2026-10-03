import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  COMPOSE_MODES,
  COMPOSE_SYSTEM_PROMPT,
  REPLY_SYSTEM_PROMPT,
  buildComposePrompt,
  buildReplyPrompt,
  cleanAiEmail,
  detectIntent,
  firstNameFrom,
  formatThread,
  resolveGreeting,
  type ThreadMessage,
} from "@/lib/inbox-ai-prompt";

const msg = (direction: string, body: string, at: string, from = "john@acme.com", name: string | null = null): ThreadMessage => ({
  direction,
  body,
  occurred_at: at,
  from_email: direction === "inbound" ? from : "rep@seller.com",
  from_name: name,
});

const thread = [
  msg("outbound", "Hi John, we make custom packaging. Interested?", "2026-09-01T10:00:00Z"),
  msg("inbound", "We're launching a candle line and need around 2,000 boxes.", "2026-09-02T10:00:00Z"),
  msg("outbound", "Great — what size are the candles?", "2026-09-02T12:00:00Z"),
  msg("inbound", "3 inch jars. Do you offer custom printed boxes?", "2026-09-03T09:00:00Z"),
];

describe("AI Reply prompt", () => {
  const built = buildReplyPrompt({ prospectEmail: "john@acme.com", subject: "Packaging", lead: { first_name: "john", company: "Acme" }, messages: thread });

  it("includes the full conversation, previous and latest messages, in order", () => {
    for (const m of thread) expect(built.prompt).toContain(m.body!);
    expect(built.prompt.indexOf("custom packaging")).toBeLessThan(built.prompt.indexOf("3 inch jars"));
    expect(built.prompt).toMatch(/#4 PROSPECT.*\[LATEST\]/);
    expect(built.prompt).toContain("4 messages");
  });
  it("only uses the messages it is given (thread isolation)", () => {
    expect(built.prompt).not.toContain("other-prospect");
    const other = buildReplyPrompt({ prospectEmail: "a@b.com", subject: null, lead: null, messages: [msg("inbound", "only this", "2026-01-01T00:00:00Z", "a@b.com")] });
    expect(other.prompt).not.toContain("candle");
  });
  it("greets by first name, then display name, then company, then Hi there", () => {
    expect(built.greeting).toBe("Hi John,");
    expect(resolveGreeting({ prospectEmail: "j@x.com", lead: null, messages: [msg("inbound", "x", "2026-01-01", "j@x.com", "Jane Doe")] }).greeting).toBe("Hi Jane,");
    expect(resolveGreeting({ prospectEmail: "j@x.com", lead: { company: "ABC Consulting" }, messages: [] }).greeting).toBe("Hi ABC Consulting,");
    expect(resolveGreeting({ prospectEmail: "j@x.com", lead: null, messages: [] }).greeting).toBe("Hi there,");
  });
  it("never invents names from email addresses or generic inboxes", () => {
    expect(firstNameFrom("john.smith@acme.com")).toBe("");
    expect(firstNameFrom("info")).toBe("");
    expect(resolveGreeting({ prospectEmail: "info@x.com", lead: null, messages: [msg("inbound", "x", "2026", "info@x.com", "info@x.com")] }).greeting).toBe("Hi there,");
  });
  it("instructs answer-first, no repeats, human tone, natural sign-off and no invented facts", () => {
    expect(REPLY_SYSTEM_PROMPT).toMatch(/answer.*FIRST/i);
    expect(REPLY_SYSTEM_PROMPT).toMatch(/Never ask for information the prospect already gave/);
    expect(REPLY_SYSTEM_PROMPT).toMatch(/I hope this email finds you well/);
    expect(REPLY_SYSTEM_PROMPT).toMatch(/sign-off/);
    expect(REPLY_SYSTEM_PROMPT).toMatch(/signature is added separately/);
    expect(REPLY_SYSTEM_PROMPT).toMatch(/Never invent pricing, discounts, features/);
  });
  it("detects unsubscribe / human / not-interested and guides accordingly", () => {
    expect(detectIntent("Please unsubscribe me")).toBe("unsubscribe");
    expect(detectIntent("Can I talk to a real person?")).toBe("human");
    expect(detectIntent("Not interested, thanks")).toBe("not_interested");
    const u = buildReplyPrompt({ prospectEmail: "j@x.com", subject: null, lead: null, messages: [msg("inbound", "Remove me from your list", "2026", "j@x.com")] });
    expect(u.intent).toBe("unsubscribe");
    expect(u.prompt).toMatch(/No selling/);
  });
  it("keeps newest messages when the thread is very long", () => {
    const long = Array.from({ length: 30 }, (_, i) => msg("inbound", `m${i} ` + "x".repeat(2400), `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
    const out = formatThread(long);
    expect(out).toContain("m29 ");
    expect(out).toMatch(/earlier messages omitted/);
  });
});

describe("AI Email Composer prompt", () => {
  it("supports exactly the six modes", () => {
    expect([...COMPOSE_MODES]).toEqual(["improve", "human", "shorter", "professional", "warmer", "first_touch"]);
    for (const mode of COMPOSE_MODES) expect(buildComposePrompt({ mode, draft: "Hi John, following up about the boxes." }).prompt).toContain("following up about the boxes");
  });
  it("preserves meaning, adds no claims or fake personalization, body only", () => {
    expect(COMPOSE_SYSTEM_PROMPT).toMatch(/Preserve the original meaning/);
    expect(COMPOSE_SYSTEM_PROMPT).toMatch(/Never add new claims/);
    expect(COMPOSE_SYSTEM_PROMPT).toMatch(/no subject line/);
    expect(buildComposePrompt({ mode: "first_touch", draft: "x" }).prompt).toMatch(/never invent how the sender found the prospect/);
    expect(buildComposePrompt({ mode: "warmer", draft: "x" }).prompt).toMatch(/No fake familiarity/);
  });
  it("output cleanup removes subject lines and placeholders without adding text", () => {
    expect(cleanAiEmail("Subject: Hello\n\nHi John,\n\nYes we do.\n\nBest,\n[Your Name]")).toBe("Hi John,\n\nYes we do.\n\nBest,");
  });
});

describe("wiring and provider separation", () => {
  const fns = readFileSync("src/lib/inbox-ai.functions.ts", "utf8");
  const composer = readFileSync("src/components/inbox/AiComposerButton.tsx", "utf8");
  const reply = readFileSync("src/components/inbox/AiReplyButton.tsx", "utf8");
  const dialog = readFileSync("src/components/inbox/ComposeDialog.tsx", "utf8");
  it("uses the customer AI key, never the AI Sales Agent provider", () => {
    expect(fns).toContain("workspaceAiCredentials");
    expect(fns).not.toMatch(/sales-agent/);
    expect(composer).not.toMatch(/sales-agent/);
  });
  it("scopes the thread to the conversation and workspace", () => {
    expect(fns).toMatch(/\.eq\("conversation_id", conversation\.id\)\s*\.eq\("workspace_id", conversation\.workspace_id\)/);
  });
  it("never sends; composer requires explicit choice and keeps original", () => {
    expect(fns).not.toMatch(/sendConversationReply|sendComposedEmail/);
    expect(composer).toContain("Use this version");
    expect(composer).toContain("Keep my original");
    expect(reply).toContain("Restore my draft");
    expect(reply).toContain("Reading conversation");
  });
  it("places AI Email Composer directly before Signature and leaves subject alone", () => {
    expect(dialog.indexOf("<AiComposerButton")).toBeLessThan(dialog.indexOf("Signature\n"));
    expect(dialog.slice(dialog.indexOf("<AiComposerButton"), dialog.indexOf("Signature\n"))).not.toMatch(/setSubject/);
  });
});
