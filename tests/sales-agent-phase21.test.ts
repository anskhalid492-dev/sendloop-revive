import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HUMAN_REVIEW_TAG, normalizeSettings, preReplySafety, replyDelivery } from "@/lib/sales-agent";
import { memStore } from "./helpers/sales-agent-provider-store";
import { __setSalesAgentProviderStore } from "@/lib/sales-agent-provider.server";
import { __setSalesAgentTransport } from "@/lib/sales-agent-ai.server";
import { runAiReply, settingsKey, type AgentContext } from "@/lib/sales-agent.server";
import { aggregateAiMonitoring, classifyFailure, FALLBACK_OUTCOME, pageWorkspaces } from "@/lib/sales-agent-metrics";
import { loadMonitoringRows } from "@/lib/sales-agent-monitoring.server";
import { describeAiReplyOutput, describeHumanReviewOutput } from "@/lib/sales-agent-history";

const read = (p: string) => readFileSync(p, "utf8");
const WS = "11111111-1111-1111-1111-111111111111";
const WS2 = "22222222-2222-2222-2222-222222222222";
const settings = normalizeSettings({ enabled: true });

const ctx = (over: Partial<AgentContext> = {}): AgentContext => ({
  workspaceId: WS,
  lead: { first_name: "Ana", status: "active", tags: [], workspace_id: WS },
  stageName: null,
  campaignName: null,
  conversation: { id: "c", subject: "Hello", prospect_email: "ana@acme.test" },
  messages: [{ direction: "inbound", body: "Sounds interesting, tell me more.", occurred_at: null }],
  previousDecisions: [],
  ...over,
});

let calls = 0;
const reply = (text: string) =>
  __setSalesAgentTransport(async () => {
    calls += 1;
    return { text, inputTokens: 10, outputTokens: 5 };
  });

beforeEach(() => {
  calls = 0;
  __setSalesAgentProviderStore(memStore({ provider: "openai", model: "gpt-test", key: "test-key" }));
});
afterEach(() => {
  __setSalesAgentTransport(null);
  __setSalesAgentProviderStore(null);
  vi.unstubAllEnvs();
});

const AUTO = { mode: "auto_send" };
const CLEAN = "Thanks Ana, happy to share more details about how we help teams like yours.";

async function finalMode(config: Record<string, unknown>, c: AgentContext, last: Parameters<typeof runAiReply>[3], hasOwner = true) {
  const r = await runAiReply(config, c, settings, last);
  if (!r.ok) return "not_sent";
  return replyDelivery({ requested: r.mode, forcedDraft: r.forcedDraft, hasConversation: Boolean(c.conversation), hasOwner }).mode;
}

describe("auto-send safety — never sends", () => {
  it("baseline: a clean, confident reply with all context auto-sends", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx(), { confidence: 0.95 })).toBe("auto_send");
  });
  it("confidence below threshold → draft", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx(), { confidence: 0.6 })).toBe("draft");
  });
  it("uses the AI Decision's own threshold, not only the workspace default", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx(), { confidence: 0.85, threshold: 0.9 })).toBe("draft");
  });
  it("unsubscribed lead → nothing generated, no provider call", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx({ lead: { status: "unsubscribed", tags: [] } }), { confidence: 0.99 })).toBe("not_sent");
    expect(calls).toBe(0);
  });
  it("latest message is an unsubscribe request → nothing generated", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx({ messages: [{ direction: "inbound", body: "Please unsubscribe me", occurred_at: null }] }), { confidence: 0.99 })).toBe("not_sent");
    expect(calls).toBe(0);
  });
  it("lead tagged for human review → nothing generated", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx({ lead: { status: "active", tags: [HUMAN_REVIEW_TAG] } }), { confidence: 0.99 })).toBe("not_sent");
    expect(calls).toBe(0);
  });
  it("legal / sensitive message → draft", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx({ messages: [{ direction: "inbound", body: "Our lawyer will contact you about GDPR", occurred_at: null }] }), { confidence: 0.99 })).toBe("draft");
  });
  it("pricing, discount and booked-meeting content → draft", async () => {
    for (const text of ["Our plan is $499 per month, Ana, let me know.", "I can offer you a 30% discount this week, Ana.", "Great, I've booked a meeting for Tuesday at 3pm with you."]) {
      reply(text);
      expect(await finalMode(AUTO, ctx(), { confidence: 0.99 })).toBe("draft");
    }
  });
  it("workflow owner missing → handed to a person, never sent", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx(), { confidence: 0.99 }, false)).toBe("handoff");
  });
  it("conversation missing → draft", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx({ conversation: null }), { confidence: 0.99 })).toBe("draft");
  });
  it("no prospect message to reply to → draft", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx({ messages: [] }), { confidence: 0.99 })).toBe("draft");
  });
  it("invalid AI result → not sent", async () => {
    reply('{"subject": "x"}');
    expect(await finalMode(AUTO, ctx(), { confidence: 0.99 })).toBe("not_sent");
    reply("Hi {{first_name}}, thanks!");
    expect(await finalMode(AUTO, ctx(), { confidence: 0.99 })).toBe("not_sent");
  });
  it("provider timeout → not sent", async () => {
    __setSalesAgentTransport(async () => {
      throw new Error("The operation was aborted");
    });
    const r = await runAiReply(AUTO, ctx(), settings, { confidence: 0.99 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.ai?.status).toBe("timeout");
  });
  it("provider failure → not sent", async () => {
    __setSalesAgentTransport(async () => {
      throw Object.assign(new Error("Bad gateway"), { statusCode: 502 });
    });
    const r = await runAiReply(AUTO, ctx(), settings, { confidence: 0.99 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.ai?.status).toBe("unavailable");
  });
  it("uncertain preceding decision (fallback) → draft even without a confidence", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx(), { confidence: null, usedFallback: true })).toBe("draft");
    expect(preReplySafety({ latestInbound: "hi", lastDecisionUncertain: true }).forceDraft.length).toBe(1);
  });
  it("disabled AI Sales Agent → nothing generated", async () => {
    reply(CLEAN);
    const r = await runAiReply(AUTO, ctx(), normalizeSettings({ enabled: false }), { confidence: 0.99 });
    expect(r.ok).toBe(false);
    expect(calls).toBe(0);
  });
  it("draft mode is never upgraded to auto-send", () => {
    expect(replyDelivery({ requested: "draft", forcedDraft: [], hasConversation: true, hasOwner: true }).mode).toBe("draft");
  });
  it("live engine routes every reply through replyDelivery and never sends on failure", () => {
    const src = read("src/lib/automation-engine.server.ts");
    expect(src).toMatch(/replyDelivery\(/);
    expect(src).toMatch(/delivery\.mode === "auto_send" && conversation && owner/);
    expect(src).toMatch(/if \(!result\.ok\) \{[\s\S]{0,120}Never send on failure/);
  });
});

describe("settings isolation", () => {
  it("settings keys are per workspace", () => {
    expect(settingsKey(WS)).not.toBe(settingsKey(WS2));
    expect(settingsKey(WS)).toBe(`ai_sales_agent:${WS}`);
  });
  it("read requires membership and write requires owner/admin before touching storage", () => {
    const src = read("src/lib/sales-agent.functions.ts");
    const get = src.slice(src.indexOf("getSalesAgentSettings"), src.indexOf("saveSalesAgentSettings"));
    expect(get.indexOf("memberRole")).toBeLessThan(get.indexOf("supabaseAdmin"));
    const save = src.slice(src.indexOf("saveSalesAgentSettings"), src.indexOf("adminSalesAgentAiMetrics"));
    expect(save).toMatch(/\["owner", "admin"\]/);
    expect(save.indexOf("memberRole")).toBeLessThan(save.indexOf("supabaseAdmin"));
    expect(src).not.toMatch(/workspace_ai_keys|ai_provider_keys/);
  });
});

describe("admin monitoring", () => {
  it("is super-admin only and checks before loading data", () => {
    const src = read("src/lib/sales-agent.functions.ts");
    const fn = src.slice(src.indexOf("adminSalesAgentMonitoring"));
    expect(fn).toMatch(/requireSupabaseAuth/);
    expect(fn.indexOf("assertSuperAdmin(context)")).toBeGreaterThan(0);
    expect(fn.indexOf("assertSuperAdmin(context)")).toBeLessThan(fn.indexOf("supabaseAdmin"));
    expect(read("src/routes/_authenticated/mranuskhalid/ai-sales-agent.tsx")).toMatch(/_authenticated\/mranuskhalid/);
  });

  const ai = (status: string, purpose: string, latencyMs = 100) => ({ provider: "munchreach", status, latencyMs, inputTokens: 100, outputTokens: 20, purpose });
  const rows = [
    { workspace_id: WS, output: { kind: "ai_decision", outcome: "Interested", usedFallback: false, ai: ai("success", "decision", 200) } },
    { workspace_id: WS, output: { kind: "ai_decision", outcome: "Pricing question", usedFallback: false, ai: ai("success", "decision", 400) } },
    { workspace_id: WS, output: { kind: "ai_decision", outcome: "Interested", usedFallback: true, fallbackReason: "AI was not confident enough to respond automatically.", ai: ai("success", "decision") } },
    { workspace_id: WS2, output: { kind: "ai_decision", outcome: null, usedFallback: true, fallbackReason: "AI returned an invalid decision.", ai: ai("success", "decision") } },
    { workspace_id: WS2, output: { kind: "ai_decision", outcome: null, usedFallback: true, fallbackReason: "AI decision timed out.", ai: ai("timeout", "decision") } },
    { workspace_id: WS2, output: { kind: "ai_reply", generated: false, error: "AI service unavailable.", ai: ai("unavailable", "reply") } },
    { workspace_id: WS2, output: { kind: "ai_reply", generated: true, mode: "draft", ai: ai("success", "reply") } },
    { workspace_id: WS2, output: { humanReview: true, reason: "x" } },
    // Disabled agent: no AI call, so not a request
    { workspace_id: WS, output: { kind: "ai_decision", outcome: null, usedFallback: true, fallbackReason: "The AI Sales Agent is turned off for this workspace." } },
    // Not MunchReach (e.g. anything customer-key): never counted
    { workspace_id: WS, output: { ai: { provider: "openai", status: "success", latencyMs: 9, purpose: "decision" } } },
  ];

  it("aggregates totals from MunchReach AI metadata only", () => {
    const m = aggregateAiMonitoring(rows);
    expect(m.totals.requests).toBe(7);
    expect(m.totals.success).toBe(5);
    expect(m.totals.timedOut).toBe(1);
    expect(m.totals.failed).toBe(1);
    expect(m.totals.successRate).toBe(71.4);
    expect(m.totals.totalTokens).toBe(7 * 120);
    expect(m.totals.decisions).toBe(5);
    expect(m.totals.replies).toBe(2);
  });
  it("workspace breakdown is sorted by requests desc", () => {
    const m = aggregateAiMonitoring(rows);
    expect(m.workspaces.map((w) => [w.workspaceId, w.requests])).toEqual([[WS2, 4], [WS, 3]]);
    expect(m.workspaces[1]!.avgLatencyMs).toBe(233);
    expect(m.workspaces[1]!.successRate).toBe(100);
  });
  it("outcomes support custom labels and group fallbacks", () => {
    const m = aggregateAiMonitoring(rows);
    const o = Object.fromEntries(m.outcomes.map((x) => [x.outcome, x.count]));
    expect(o).toEqual({ Interested: 1, "Pricing question": 1, [FALLBACK_OUTCOME]: 4 });
  });
  it("failure breakdown uses the recorded classifications", () => {
    const f = Object.fromEntries(aggregateAiMonitoring(rows).failures.map((x) => [x.kind, x.count]));
    expect(f).toEqual({ provider: 1, timeout: 1, invalid: 1, low_confidence: 1, human_fallback: 1, other: 1 });
    expect(classifyFailure({ kind: "ai_reply", generated: true })).toBeNull();
  });
  it("zero data is safe", () => {
    const m = aggregateAiMonitoring([]);
    expect(m.totals.successRate).toBeNull();
    expect(m.totals.avgLatencyMs).toBeNull();
    expect(m.failures.every((x) => x.count === 0)).toBe(true);
  });
  it("workspace search and pagination", () => {
    const list = Array.from({ length: 45 }, (_, i) => ({ workspaceId: `w${i}`, name: i % 2 ? `Acme ${i}` : `Beta ${i}`, requests: 45 - i, success: 0, failed: 0, timedOut: 0, successRate: null, avgLatencyMs: null, tokens: 0 }));
    const p3 = pageWorkspaces(list, null, 3, 20);
    expect(p3.rows.length).toBe(5);
    expect(p3.pages).toBe(3);
    const s = pageWorkspaces(list, "acme", 1, 20);
    expect(s.total).toBe(22);
    expect(s.rows.every((r) => r.name.startsWith("Acme"))).toBe(true);
    expect(pageWorkspaces(list, null, 99, 20).page).toBe(3);
  });
  it("date filtering is bounded, UTC-inclusive and paged (no unbounded scan)", async () => {
    const seen: Record<string, unknown>[] = [];
    let page = 0;
    const db = {
      from: (t: string) => {
        const q: Record<string, unknown> = { table: t };
        const b = {
          select: (s: string) => ((q["select"] = s), b),
          gte: (c: string, v: string) => ((q["gte"] = [c, v]), b),
          lt: (c: string, v: string) => ((q["lt"] = [c, v]), b),
          or: (v: string) => ((q["or"] = v), b),
          order: () => b,
          range: async (a: number, z: number) => {
            q["range"] = [a, z];
            seen.push(q);
            page += 1;
            return { data: page === 1 ? Array.from({ length: 1000 }, () => ({ workspace_id: WS, output: {} })) : [{ workspace_id: WS, output: {} }], error: null };
          },
        };
        return b;
      },
    };
    const out = await loadMonitoringRows(db, "2026-10-01", "2026-10-03");
    expect(out.rows.length).toBe(1001);
    expect(out.truncated).toBe(false);
    expect(seen[0]!["table"]).toBe("automation_run_steps");
    expect(seen[0]!["select"]).toBe("workspace_id, output");
    expect(seen[0]!["gte"]).toEqual(["created_at", "2026-10-01T00:00:00.000Z"]);
    expect(seen[0]!["lt"]).toEqual(["created_at", "2026-10-04T00:00:00.000Z"]);
    expect(String(seen[0]!["or"])).toMatch(/ai_decision,ai_reply/);
    expect(seen[1]!["range"]).toEqual([1000, 1999]);
  });
  it("never returns prompts, reply text or provider payloads", () => {
    const m = JSON.stringify(aggregateAiMonitoring([{ workspace_id: WS, output: { kind: "ai_reply", generated: true, text: "SECRET BODY", ai: ai("success", "reply") } }]));
    expect(m).not.toMatch(/SECRET BODY/);
  });
});

describe("phase 2.2 audit", () => {
  it("no confidence available (no preceding AI Decision) → draft", async () => {
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx(), null)).toBe("draft");
    reply(CLEAN);
    expect(await finalMode(AUTO, ctx(), { confidence: null })).toBe("draft");
  });
  it("an unsaved reply is never shown as a generated draft", () => {
    expect(describeAiReplyOutput({ generated: true, mode: "draft", draftCreated: false, handedOff: false, note: "No owner" })).toMatch(/^AI reply not saved/);
  });
  it("hitting the 20,000-step cap is reported as truncated", async () => {
    const full = Array.from({ length: 1000 }, () => ({ workspace_id: WS, output: {} }));
    const b: Record<string, unknown> = {};
    for (const k of ["select", "gte", "lt", "or", "order"]) b[k] = () => b;
    b["range"] = async () => ({ data: full, error: null });
    const out = await loadMonitoringRows({ from: () => b }, "2026-01-01", "2026-01-31");
    expect(out.truncated).toBe(true);
    expect(out.rows.length).toBe(20_000);
  });
});

describe("customer run history", () => {
  it("AI reply: draft generated vs auto-send attempted", () => {
    expect(describeAiReplyOutput({ generated: true, mode: "draft" })).toMatch(/^Draft generated/);
    expect(describeAiReplyOutput({ generated: true, mode: "draft", forcedDraft: ["Needs review."] })).toMatch(/kept as draft: Needs review/);
    expect(describeAiReplyOutput({ generated: true, mode: "auto_send", sent: true })).toMatch(/^Auto-send attempted/);
    expect(describeAiReplyOutput({ generated: true, mode: "draft", ai: { provider: "munchreach", latencyMs: 5 } })).not.toMatch(/munchreach|latency/i);
  });
  it("human review shows reason and assigned owner", () => {
    expect(describeHumanReviewOutput({ humanReview: true, reason: "Pricing", assignedToName: "Sam" })).toBe("Human review requested · Reason: Pricing · Assigned owner: Sam");
    expect(describeHumanReviewOutput({ humanReview: true, reason: "x", assignedTo: null })).toMatch(/unassigned/);
  });
});

describe("simulation safety", () => {
  it("simulation never reaches the live action executor", () => {
    const sim = read("src/lib/workflow-simulation.server.ts");
    expect(sim).not.toMatch(/runSalesAgentAction|executeWorkflow|runAction\(|sendReplyThroughMailbox|email_drafts|lead_tasks|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    const engine = read("src/lib/automation-engine.server.ts");
    const action = engine.slice(engine.indexOf("async function runSalesAgentAction"));
    expect(action.slice(0, 600)).toMatch(/assertNotSimulation\(run\.metadata\)/);
    const decide = engine.slice(engine.indexOf("aiDecide: async"));
    expect(decide.slice(0, 200)).toMatch(/assertNotSimulation\(run\.metadata\)/);
  });
});

describe("provider separation (four paths)", () => {
  it("Campaign Writer, Personalization and Inbox AI Reply never use the MunchReach provider", () => {
    for (const f of ["src/lib/ai-campaign-writer.server.ts", "src/lib/ai-personalization.server.ts", "src/lib/inbox-ai.functions.ts"]) {
      const src = read(f);
      expect(src).not.toMatch(/sales-agent/);
      expect(src).not.toMatch(/LOVABLE_API_KEY/);
    }
  });
  it("AI Sales Agent uses only MunchReach credentials, never a customer key", () => {
    const src = read("src/lib/sales-agent-ai.server.ts") + read("src/lib/sales-agent.server.ts") + read("src/lib/sales-agent.functions.ts");
    expect(src).not.toMatch(/LOVABLE_API_KEY|ai\.gateway\.lovable|gpt-6-astra/);
    expect(src).toMatch(/resolveProviderConfig/);
    expect(src).not.toMatch(/workspace_ai_keys|ai-keys|ai-provider-keys|byok/i);
  });
});
